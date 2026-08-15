# WalFlow Backend Technical Audit Report

**Date:** 2026-08-14  
**Scope:** Python Backend (`backend/`)  
**Auditors:** Physics & Solver Auditor, Database & API Auditor, WebSocket & Real-Time Collaboration Auditor, QA & Redundancy Auditor  

---

## Executive Summary

A comprehensive, multi-domain technical audit of the WalFlow Python backend was conducted across the simulation engine, database layer, real-time WebSocket communications, codebase architecture, and test suites. 

### Overall Health Assessment
WalFlow's steady-state hydraulic solver and FastAPI backend are structurally sound, well-conceived, and feature robust core algorithms (e.g. analytical sparse Jacobians, flow direction tracking, and collaborative multi-user locking). However, the audit revealed several critical and high-priority reliability and performance bottlenecks:

1. **Critical Bug:** A missing `import logging` in [`backend/routers/pipe_classes.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/pipe_classes.py) causes an unhandled Python `NameError` whenever the external Equinor TR2000 REST API is unreachable, crashing what should be a clean `502 Bad Gateway` into an unhandled `500 Internal Server Error`.
2. **Event Loop Starvation:** The CPU-heavy simulation solver is currently executed synchronously on the main asyncio event loop in `/ws/simulate`, freezing all concurrent WebSocket broadcasts, room lock signals, and HTTP requests during calculation.
3. **Database Concurrency Bottlenecks:** The SQLite configuration lacks Write-Ahead Logging (`WAL`), busy timeout tuning (`PRAGMA busy_timeout`), and transaction rollback guards in `get_db()`, creating vulnerability to `OperationalError: database is locked` during concurrent multi-tab or project operations.
4. **Memory Leaks in Real-Time Collaboration:** `ConnectionManager` leaks orphaned WebSocket references when users switch diagram rooms, and `LOCAL_LOCKS` retains expired diagram check-out locks indefinitely in memory when running without Redis.
5. **Inner-Loop Solver Inefficiencies:** The Newton-Raphson residual evaluation currently performs $O(N_{nodes} \times N_{edges})$ linear edge scans, and pipe calculations create function closures and re-evaluate invariant geometric terms on every iteration.
6. **Test Coverage Gaps:** The newly introduced `RemoteControlValve` component has **0 unit or integration tests**, and edge cases such as disconnected floating subgraphs and 100% blocked zero-flow lines lack automated verification.

---

## Audit Scorecard

| Domain | Status | Rating | Core Strengths | Key Action Items |
| :--- | :---: | :---: | :--- | :--- |
| **1. Physics & Solver** | 🟡 | Good / Needs Tuning | Analytical Jacobian, flow-direction detection, solid physical formulations. | Eliminate $O(N \times M)$ residual edge scans; cache pipe geometric terms; bound warm-start cache. |
| **2. Database & API** | 🔴 | Action Required | Clean SQLAlchemy models and lightweight token validation. | Fix missing `logging` import; enable SQLite `WAL` and `busy_timeout`; isolate DB transactions from outbound I/O. |
| **3. WebSocket & Real-time** | 🔴 | Action Required | Bidirectional collaborative locking and event-driven telemetry dispatch. | Offload simulation to worker thread (`asyncio.to_thread`); fix room switching socket leaks; prune dead sockets. |
| **4. Code Structure & Redundancy** | 🟡 | Moderate | Clear separation of equipment models and routers. | Deduplicate `extract_telemetry`; decouple `diagrams.py` and `projects.py`; extract `lock_service.py`. |
| **5. Test Coverage & QA** | 🟡 | Moderate | Core equipment models (Pumps, Valves, Pipes, Heat Exchangers) well tested. | Add unit tests for `RemoteControlValve`; add topology tests for isolated subgraphs and zero-flow circuits. |

---

## Audit Findings by Category

---

### Category 1: Solver & Physics Performance

#### Finding 1.1: $O(N_{nodes} \times N_{edges})$ Linear Edge Scanning in Residual Evaluation
* **File & Lines:** [`backend/simulation/solver.py:685-686`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py#L685-L686)
* **Problem Description:** Inside `objective(x_scaled)`, node mass balance is calculated using generator expressions scanning all edges:
  ```python
  q_in = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['target'] == node_id)
  q_out = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['source'] == node_id)
  ```
  This creates $O(N \times M)$ complexity. On a network with 100 nodes and 200 edges over 20 Newton steps with 3 line search evaluations each, this executes over 1.2 million iterations.
* **Suggested Code Diff:**
```diff
--- a/backend/simulation/solver.py
+++ b/backend/simulation/solver.py
@@ -142,6 +142,16 @@ class NetworkSolver:
                 if isinstance(node, ThreeWayTCV):
                     self.tcv_node_indices.append(i)
 
+        # Precompute fast incidence lookup tables for residual and Jacobian evaluation
+        self.node_incoming_edge_indices = {nid: [] for nid in self.node_ids}
+        self.node_outgoing_edge_indices = {nid: [] for nid in self.node_ids}
+        for j, edge in enumerate(self.edges_list):
+            self.node_incoming_edge_indices[edge['target']].append(j)
+            self.node_outgoing_edge_indices[edge['source']].append(j)
+        self.internal_idx_map = {node_idx: i for i, node_idx in enumerate(self.internal_node_indices)}
@@ -685,8 +695,8 @@ class NetworkSolver:
-                q_in = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['target'] == node_id)
-                q_out = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['source'] == node_id)
+                q_in = sum(q_edges[j] for j in self.node_incoming_edge_indices[node_id])
+                q_out = sum(q_edges[j] for j in self.node_outgoing_edge_indices[node_id])
```
* **Merit & Benefit:** Reduces mass balance computation from $O(N \times M)$ to $O(N)$, resulting in a $5\times\text{--}20\times$ speedup on residual evaluations for large diagrams.

---

#### Finding 1.2: Dead Code & Allocation of `q_in_node_all` in `calculate_jacobian`
* **File & Lines:** [`backend/simulation/solver.py:447-451`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py#L447-L451)
* **Problem Description:** A zero-filled array `q_in_node_all` is allocated and populated via edge iteration on every Jacobian evaluation, but it is never referenced anywhere.
* **Suggested Code Diff:**
```diff
--- a/backend/simulation/solver.py
+++ b/backend/simulation/solver.py
@@ -446,10 +446,6 @@ class NetworkSolver:
-        # Precompute q_in_node for all nodes
-        q_in_node_all = np.zeros(len(self.nodes_list))
-        for j, edge in enumerate(self.edges_list):
-            tgt_idx = self.node_id_to_idx[edge['target']]
-            q_in_node_all[tgt_idx] += q_edges[j]
```
* **Merit & Benefit:** Eliminates unnecessary memory allocation and garbage collection overhead in the inner Jacobian loop.

---

#### Finding 1.3: Invariant Geometric Re-computations & Closures in `Pipe`
* **File & Lines:** [`backend/simulation/equipment/pipe.py:39, 47-50, 98, 105-108`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/pipe.py#L39-L50)
* **Problem Description:** Cross-sectional area `math.pi * (self.diameter / 2.0)**2` and relative roughness `eps / (3.7 * self.diameter)` are recalculated on every call to `calculate_delta_p` and `calculate_dp_derivative`. Nested helper closures `get_f_turb` and `get_dp_deriv_turb` are dynamically defined on each call.
* **Suggested Code Diff:**
```diff
--- a/backend/simulation/equipment/pipe.py
+++ b/backend/simulation/equipment/pipe.py
@@ -25,6 +25,10 @@ class Pipe(HydraulicNode):
         self.friction_factor = friction_factor  # Darcy friction factor (f)
+        
+        self.area = math.pi * (self.diameter / 2.0)**2 if self.diameter > 0 else 1e-6
+        eps = self.roughness if (self.roughness is not None and self.roughness > 0) else 0.000045
+        self.rel_roughness_term = eps / (3.7 * self.diameter) if self.diameter > 0 else 0.0
         
         # A pipe requires exactly one inlet and one outlet
         self.add_inlet()
```
* **Merit & Benefit:** Eliminates thousands of redundant floating-point calculations and function object instantiations per second.

---

#### Finding 1.4: Dynamic Reflection Overhead in `calculate_dp_derivative`
* **File & Lines:** [`backend/simulation/equipment/base_node.py:90-93`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/base_node.py#L90-L93)
* **Problem Description:** `inspect.signature(self.calculate_delta_p)` uses runtime Python bytecode inspection inside the numerical fallback derivative method.
* **Suggested Code Diff:**
```diff
--- a/backend/simulation/equipment/base_node.py
+++ b/backend/simulation/equipment/base_node.py
@@ -87,14 +87,13 @@ class HydraulicNode:
     def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
         """
         Numerical derivative fallback of pressure drop with respect to flow rate.
         Can be overridden by subclasses for analytical derivatives.
         """
-        import inspect
         dq = 1e-6
-        sig = inspect.signature(self.calculate_delta_p)
-        has_update_state = 'update_state' in sig.parameters
+        has_update_state = getattr(self, 'has_update_state_param', False) or (self.node_type in ['pressure_safety_valve', 'rupture_disc', 'check_valve'])
```
* **Merit & Benefit:** Removes costly runtime reflection from inner-loop numerical differentiation.

---

#### Finding 1.5: Unbounded Growth of Class-Level Warm-Start Cache
* **File & Lines:** [`backend/simulation/solver.py:28, 770`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py#L28)
* **Problem Description:** `_warm_start_cache` is an unbounded class-level dictionary that retains converged solution state vectors across multiple topologies and operating cases indefinitely.
* **Suggested Code Diff:**
```diff
--- a/backend/simulation/solver.py
+++ b/backend/simulation/solver.py
@@ -27,7 +27,8 @@ class NetworkSolver:
-    # Class-level cache: (topology_key, active_case_id) -> np.ndarray (converged state vector)
-    _warm_start_cache = {}
+    _warm_start_cache: Dict[Tuple, np.ndarray] = {}
+    _MAX_WARM_START_ENTRIES = 128
+
+    @classmethod
+    def clear_warm_start_cache(cls):
+        cls._warm_start_cache.clear()
@@ -769,6 +770,8 @@ class NetworkSolver:
             if warm_start_enabled:
+                if len(NetworkSolver._warm_start_cache) >= NetworkSolver._MAX_WARM_START_ENTRIES:
+                    NetworkSolver._warm_start_cache.pop(next(iter(NetworkSolver._warm_start_cache)))
                 NetworkSolver._warm_start_cache[(self.topology_key, self.active_case_id)] = converged_x
```
* **Merit & Benefit:** Enforces a bounded memory footprint for the solver cache over continuous server uptime.

---

#### Finding 1.6: Evaluation of Fluid Properties (`fluid_utils.py`)
* **File:** [`backend/simulation/fluid_utils.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/fluid_utils.py)
* **Merit Rule Evaluation:** Fluid density is a linear relation ($O(1)$) and viscosity is an exponential formula ($O(1)$). In WalFlow's steady-state model, fluid properties are fixed during the inner Newton-Raphson iterations and read directly from port properties. Property lookups only occur in the outer property propagation loop ($\le 5$ iterations).
* **Verdict:** `fluid_utils.py` is **already optimal**. Adding array vectorization or complex cache layers would add complexity without measurable performance gain. **No changes recommended.**

---

### Category 2: Database & API Resilience

#### Finding 2.1: [CRITICAL BUG] Missing `import logging` in `pipe_classes.py`
* **File & Lines:** [`backend/routers/pipe_classes.py:165, 183, 217`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/pipe_classes.py#L165)
* **Problem Description:** `backend/routers/pipe_classes.py` calls `logging.error(...)` inside exception handlers for TR2000 endpoints (`/tr2000/plants`, `/tr2000/search`, `/tr2000/sync`), but `import logging` was omitted from module imports. Any network failure or 404 from Equinor triggers an unhandled `NameError: name 'logging' is not defined`, resulting in a `500 Internal Server Error` instead of a clean `502 Bad Gateway`.
* **Suggested Code Diff:**
```diff
--- a/backend/routers/pipe_classes.py
+++ b/backend/routers/pipe_classes.py
@@ -1,4 +1,5 @@
 import json
+import logging
 from typing import List, Optional, Any, Dict
 from fastapi import APIRouter, Depends, HTTPException, status, Query
```
* **Merit & Benefit:** Fixes critical runtime crash and ensures proper HTTP status codes and logging on upstream network failures.

---

#### Finding 2.2: Missing SQLite WAL Mode, Busy Timeout, and Foreign Key PRAGMAs
* **File & Lines:** [`backend/db/database.py:17-20`](file:///c:/Users/sebas/Coding/WalFlow/backend/db/database.py#L17-L20)
* **Problem Description:** By default, SQLite uses rollback journal mode (`DELETE`), locking the entire database during writes and blocking readers. Without `PRAGMA busy_timeout`, simultaneous transactions from multiple browser tabs or background operations immediately crash with `sqlite3.OperationalError: database is locked`. Furthermore, foreign key constraints are not enforced by default in SQLite.
* **Suggested Code Diff:**
```diff
--- a/backend/db/database.py
+++ b/backend/db/database.py
@@ -1,6 +1,7 @@
 import os
-from sqlalchemy import create_engine
+from sqlalchemy import create_engine, event
+from sqlalchemy.pool import QueuePool
 from sqlalchemy.orm import declarative_base, sessionmaker
 
 # Database path (stored locally or via DATABASE_PATH environment variable)
@@ -16,8 +17,27 @@ db_dir = os.path.dirname(DB_PATH)
 SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
 
 engine = create_engine(
-    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
+    SQLALCHEMY_DATABASE_URL,
+    connect_args={
+        "check_same_thread": False,
+        "timeout": 30,
+    },
+    poolclass=QueuePool,
+    pool_size=10,
+    max_overflow=20,
+    pool_pre_ping=True,
+    pool_recycle=3600,
 )
+
+@event.listens_for(engine, "connect")
+def set_sqlite_pragma(dbapi_connection, connection_record):
+    cursor = dbapi_connection.cursor()
+    cursor.execute("PRAGMA journal_mode = WAL")
+    cursor.execute("PRAGMA synchronous = NORMAL")
+    cursor.execute("PRAGMA busy_timeout = 10000")  # 10s timeout queue
+    cursor.execute("PRAGMA foreign_keys = ON")
+    cursor.close()
```
* **Merit & Benefit:** Enables concurrent readers alongside active writers, eliminates spurious "database is locked" errors, and enforces relational integrity.

---

#### Finding 2.3: Missing Rollback on Exception in `get_db`
* **File & Lines:** [`backend/db/database.py:25-32`](file:///c:/Users/sebas/Coding/WalFlow/backend/db/database.py#L25-L32)
* **Problem Description:** If an unhandled exception occurs inside a route handler, `get_db()` jumps directly to `finally: db.close()` without explicitly rolling back uncommitted transaction state.
* **Suggested Code Diff:**
```diff
--- a/backend/db/database.py
+++ b/backend/db/database.py
@@ -25,7 +25,10 @@ Base = declarative_base()
 def get_db():
     """Dependency for obtaining a database session per request."""
     db = SessionLocal()
     try:
         yield db
+    except Exception:
+        db.rollback()
+        raise
     finally:
         db.close()
```
* **Merit & Benefit:** Guarantees clean transaction teardown on errors and prevents corrupted session states.

---

#### Finding 2.4: Database Connection Held During Outbound Network I/O
* **File & Lines:** [`backend/routers/pipe_classes.py:190-222`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/pipe_classes.py#L190-L222)
* **Problem Description:** `sync_tr2000_pipe_class` injects `db: Session = Depends(get_db)` at the start of the route, holding an active SQLite database connection during 10–15 seconds of outbound external HTTP calls to the Equinor TR2000 API.
* **Suggested Code Diff:** Acquire `db = SessionLocal()` only *after* `fetch_and_normalize_tr2000_pcs` completes.
* **Merit & Benefit:** Prevents connection starvation and removes database lock contention during slow external network calls.

---

#### Finding 2.5: Equinor TR2000 Client Reuse & Parallelized Sub-Queries
* **File & Lines:** [`backend/services/tr2000_service.py:88-112, 224-231`](file:///c:/Users/sebas/Coding/WalFlow/backend/services/tr2000_service.py#L88-L112)
* **Problem Description:** `_fetch_get` opens a new `httpx.AsyncClient` on every request, repeating TLS handshakes. Furthermore, `/pipe-sizes` and `/temp-pressures` are fetched sequentially, doubling sync latency.
* **Suggested Code Diff:** Pass a shared `httpx.AsyncClient` and fetch pipe sizes and pressure-temperature tables concurrently via `asyncio.gather`:
```diff
--- a/backend/services/tr2000_service.py
+++ b/backend/services/tr2000_service.py
@@ -224,8 +224,14 @@ async def fetch_and_normalize_tr2000_pcs(
     actual_rev = str(pcs_header.get("Revision") or pcs_header.get("RevID") or rev_id or "0")
 
-    # 2. Fetch Size Schedules
-    sizes_json = await _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev/{actual_rev}/pipe-sizes")
-    # 3. Fetch Pressure-Temperature Ratings
-    pt_json = await _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev/{actual_rev}/temp-pressures")
+    # 2 & 3. Fetch Pipe Sizes and Temp-Pressure tables concurrently
+    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
+        sizes_task = _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev/{actual_rev}/pipe-sizes", client=client)
+        pt_task = _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev/{actual_rev}/temp-pressures", client=client)
+        sizes_json, pt_json = await asyncio.gather(sizes_task, pt_task)
```
* **Merit & Benefit:** Cuts TR2000 sync latency in half and reduces network overhead.

---

### Category 3: WebSocket & Real-Time Collaboration Safety

#### Finding 3.1: Event Loop Starvation by Synchronous Simulation Solver in `/ws/simulate`
* **File & Lines:** [`backend/main.py:216-218`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py#L216-L218)
* **Problem Description:** `run_sequential_relief_simulation(network_instance, solver_instance, extract_telemetry)` is a synchronous, CPU-intensive mathematical solver. Running it directly inside `async def websocket_endpoint` blocks the entire FastAPI asyncio event loop, freezing all other WebSocket communication, real-time collaboration lock broadcasts, and HTTP requests while calculating.
* **Suggested Code Diff:**
```diff
--- a/backend/main.py
+++ b/backend/main.py
@@ -216,9 +216,11 @@ async def websocket_endpoint(websocket: WebSocket):
                 if solver_instance:
                     try:
-                        stats, telemetry_mitigated, telemetry_unmitigated, has_psv = run_sequential_relief_simulation(
-                            network_instance, solver_instance, extract_telemetry
-                        )
+                        stats, telemetry_mitigated, telemetry_unmitigated, has_psv = (
+                            await asyncio.to_thread(
+                                run_sequential_relief_simulation,
+                                network_instance, solver_instance, extract_telemetry
+                            )
+                        )
```
* **Merit & Benefit:** Offloads CPU-bound matrix solves to a worker thread, keeping the event loop responsive to concurrent users and requests.

---

#### Finding 3.2: Room Switching Socket Leak in `ConnectionManager`
* **File & Lines:** [`backend/routers/diagrams.py:42-55`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L42-L55)
* **Problem Description:** When a client switches diagrams over an existing WebSocket connection, `connect(websocket, "diagram_B")` assigns the socket to Diagram B without removing it from Diagram A. The socket continues receiving broadcasts from Diagram A, and stale references accumulate in memory.
* **Suggested Code Diff:**
```diff
--- a/backend/routers/diagrams.py
+++ b/backend/routers/diagrams.py
@@ -42,6 +42,13 @@ class ConnectionManager:
     async def connect(self, websocket, diagram_id: str):
         if diagram_id:
+            old_diagram_id = self.websocket_diagrams.get(websocket)
+            if old_diagram_id and old_diagram_id != diagram_id:
+                if old_diagram_id in self.active_connections:
+                    self.active_connections[old_diagram_id].discard(websocket)
+                    if not self.active_connections[old_diagram_id]:
+                        del self.active_connections[old_diagram_id]
             if diagram_id not in self.active_connections:
                 self.active_connections[diagram_id] = set()
             self.active_connections[diagram_id].add(websocket)
```
* **Merit & Benefit:** Prevents cross-diagram broadcast pollution and eliminates memory leaks when users navigate between diagrams.

---

#### Finding 3.3: Dead Socket Accumulation & Sequential Broadcast Blocking
* **File & Lines:** [`backend/routers/diagrams.py:56-65`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L56-L65)
* **Problem Description:** `broadcast_to_diagram` sends messages sequentially (`for connection in ...: await connection.send_text()`). A slow client creates head-of-line blocking for all other clients in the room. Furthermore, if `send_text` fails on a broken connection, the exception is caught with `pass` and the dead socket remains in `active_connections` forever.
* **Suggested Code Diff:**
```diff
--- a/backend/routers/diagrams.py
+++ b/backend/routers/diagrams.py
@@ -56,10 +57,28 @@ class ConnectionManager:
     async def broadcast_to_diagram(self, diagram_id: str, message: dict, exclude_websocket=None):
         if not diagram_id or diagram_id not in self.active_connections:
             return
-        for connection in list(self.active_connections[diagram_id]):
-            if connection != exclude_websocket:
-                try:
-                    await connection.send_text(json.dumps(message))
-                except Exception:
-                    pass
+        
+        targets = [
+            conn for conn in list(self.active_connections[diagram_id])
+            if conn != exclude_websocket
+        ]
+        if not targets:
+            return
+
+        payload = json.dumps(message)
+        tasks = [conn.send_text(payload) for conn in targets]
+        results = await asyncio.gather(*tasks, return_exceptions=True)
+
+        for conn, result in zip(targets, results):
+            if isinstance(result, Exception):
+                self.disconnect(conn)
```
* **Merit & Benefit:** Eliminates head-of-line broadcast blocking and automatically prunes dropped sockets from memory.

---

#### Finding 3.4: Fragile JSON Parsing Crashing WebSocket Session
* **File & Lines:** [`backend/main.py:158-197`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py#L158-L197)
* **Problem Description:** Malformed JSON strings or non-dictionary payloads received on `/ws/simulate` trigger unhandled `JSONDecodeError` or `AttributeError`, abruptly terminating the WebSocket connection rather than returning a structured error message.
* **Suggested Code Diff:** Add explicit try-except validation for JSON decoding and type checks before parsing `action`.
* **Merit & Benefit:** Hardens WebSocket session against client payload bugs and malformed frames.

---

#### Finding 3.5: Expired Lock Accumulation in Local In-Memory Fallback `LOCAL_LOCKS`
* **File & Lines:** [`backend/routers/diagrams.py:35, 69-168`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L35-L168)
* **Problem Description:** When running without Redis, `LOCAL_LOCKS` retains expired checkout locks indefinitely unless the exact same diagram is queried again.
* **Suggested Code Diff:** Add a helper `_prune_expired_local_locks(now)` called during lock operations to evict expired records.
* **Merit & Benefit:** Keeps memory footprint strictly bounded in non-Redis environments.

---

### Category 4: Redundant Code & Obsolete Endpoints

#### Finding 4.1: Telemetry Extraction Function Duplication & Field Drift
* **Files & Lines:** 
  - [`backend/main.py:85-127`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py#L85-L127) (`extract_telemetry`)
  - [`backend/routers/simulation.py:80-103`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/simulation.py#L80-L103) (`extract_telemetry_dict`)
* **Problem Description:** Two nearly identical 40-line functions serialize node/edge telemetry. `extract_telemetry_dict` in `simulation.py` has drifted and is missing node telemetry extraction for `capacity_utilization_pct`, `action_mode`, `set_pressure_bar`, `forced_state`, and `cv`.
* **Suggested Remediation:** Unify into a single, canonical `extract_telemetry` function exported from `backend/routers/simulation.py` and imported by `backend/main.py`.
* **Merit & Benefit:** Eliminates 45 lines of duplicated code and fixes attribute drift across simulation endpoints.

---

#### Finding 4.2: Duplicated `DiagramSummarySchema` and Redundant Local Re-Imports
* **Files & Lines:**
  - [`backend/routers/diagrams.py:181-193`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L181-L193) & [`backend/routers/projects.py:37-46`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/projects.py#L37-L46)
  - [`backend/routers/projects.py:13`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/projects.py#L13) (`import json` duplicate)
  - [`backend/simulation/equipment/remote_control_valve.py:69`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/remote_control_valve.py#L69) (`from simulation.fluid_utils import FluidProperties` duplicate inside `calculate()`)
* **Suggested Remediation:** Deduplicate schemas and clean up redundant local imports.
* **Merit & Benefit:** Cleans namespace hygiene and eliminates schema duplication.

---

### Category 5: Code Structure & Best Practices

#### Finding 5.1: Circular Dependency Workarounds Between `diagrams.py` and `projects.py`
* **Files & Lines:** [`backend/routers/diagrams.py:21-167`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L21-L167), [`backend/routers/projects.py:209`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/projects.py#L209)
* **Problem Description:** Collaborative lock functions (`acquire_lock`, `release_lock`, `get_lock_status_info`) and `ConnectionManager` are implemented directly in `routers/diagrams.py`. `routers/projects.py` performs late, intra-function imports (`from routers.diagrams import get_lock_status_info`) inside `get_project_detail` to bypass circular import errors.
* **Suggested Remediation:** Extract collaborative locking and connection management into a dedicated service `backend/services/lock_service.py`.
* **Merit & Benefit:** Enforces clean separation of concerns, eliminates circular import hazards, and adheres to standard FastAPI service architecture.

---

### Category 6: Test Coverage & Validation Gaps

#### Finding 6.1: Zero Test Coverage for `RemoteControlValve`
* **File:** [`backend/simulation/equipment/remote_control_valve.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/remote_control_valve.py)
* **Problem Description:** The newly added `RemoteControlValve` equipment model, its remote sensing pressure feedback loop, analytical derivatives, and `GraphParser` signal edge handling currently have **0 unit or integration tests**.
* **Suggested Implementation:** Add test suite [`backend/tests/test_physics_remote_control_valve.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/tests/test_physics_remote_control_valve.py) covering:
  1. Initialization and analytical vs numerical derivative verification.
  2. Downstream set-pressure regulation across distant hydraulic nodes.
  3. GraphParser parsing of yellow `SIGNAL` edges into `remote_sensing_config` without generating phantom hydraulic pipes.
* **Merit & Benefit:** Guarantees regression protection for control valve physics and remote telemetry logic.

---

#### Finding 6.2: Missing Tests for Isolated Subgraphs and Zero-Flow Deadheads
* **Files:** [`backend/simulation/solver.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py), [`backend/tests/`](file:///c:/Users/sebas/Coding/WalFlow/backend/tests/)
* **Problem Description:** Automated test suites do not verify behavior when users place disconnected floating components onto the canvas or fully close valves (zero-flow deadhead conditions).
* **Suggested Implementation:** Add test suite [`backend/tests/test_physics_topology_isolated.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/tests/test_physics_topology_isolated.py) to verify clean subgraph pruning and zero-flow division-by-zero resilience.
* **Merit & Benefit:** Prevents silent convergence failures on unlinked UI components.

---

## Conclusion & Next Steps

The recommended optimizations and bug fixes provide significant gains in system reliability, concurrency, and simulation speed while respecting WalFlow's steady-state design principle ($\Delta t = 0$) and the Merit Rule.

Please refer to [`audit_todo.md`](file:///c:/Users/sebas/Coding/WalFlow/audit_todo.md) for the prioritized execution roadmap.
