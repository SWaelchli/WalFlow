# WalFlow Backend Audit Action Plan & TODO List

This checklist directly maps to the findings in [`backend_audit_report.md`](file:///c:/Users/sebas/Coding/WalFlow/backend_audit_report.md). Action items are prioritized based on system stability, concurrency safety, and performance impact.

---

## 🔴 Priority 1: Critical (Crash Fixes & Severe Bugs)

- [ ] **Fix Missing `logging` Import in Pipe Classes Router**
  - **File:** [`backend/routers/pipe_classes.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/pipe_classes.py)
  - Add `import logging` to prevent unhandled `NameError` crashing TR2000 error handling routes into HTTP 500s.
- [ ] **Fix Event Loop Starvation in WebSocket Simulation**
  - **File:** [`backend/main.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py)
  - Wrap synchronous `run_sequential_relief_simulation(...)` in `await asyncio.to_thread(...)` to prevent CPU solver from freezing the FastAPI event loop during calculation.
- [ ] **Harden WebSocket JSON Frame Parsing**
  - **File:** [`backend/main.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py)
  - Wrap `json.loads` and payload dictionary validation in try/except blocks to prevent malformed client messages from abruptly terminating the WebSocket session.

---

## 🟠 Priority 2: High (Concurrency, Memory Leaks & Data Integrity)

- [ ] **Enable SQLite WAL Mode & Busy Timeout**
  - **File:** [`backend/db/database.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/db/database.py)
  - Configure engine event listener with `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 10000`, and `PRAGMA foreign_keys = ON` to eliminate multi-tab `database is locked` crashes.
- [ ] **Add Explicit Rollback in `get_db` Dependency**
  - **File:** [`backend/db/database.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/db/database.py)
  - Add `except Exception: db.rollback(); raise` in `get_db()` generator to guarantee clean transaction teardown on route exceptions.
- [ ] **Fix Room Switching Socket Leaks in `ConnectionManager`**
  - **File:** [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py)
  - Discard sockets from previous diagram room sets when re-connecting on a new `diagram_id`.
- [ ] **Prune Dead Sockets & Concurrently Broadcast in `broadcast_to_diagram`**
  - **File:** [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py)
  - Use `asyncio.gather` for parallel broadcast dispatches and immediately evict broken connections on send exceptions.
- [ ] **Prune Expired Records in Fallback `LOCAL_LOCKS`**
  - **File:** [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py)
  - Implement periodic/on-call eviction of expired diagram lock entries to prevent memory accumulation in non-Redis environments.
- [ ] **Isolate Database Sessions from Outbound TR2000 Network I/O**
  - **File:** [`backend/routers/pipe_classes.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/pipe_classes.py)
  - Delay database session acquisition until after `fetch_and_normalize_tr2000_pcs` completes to prevent connection starvation.

---

## 🟡 Priority 3: Medium (Performance Optimization & Test Coverage)

- [ ] **Optimize Residual Mass Balance Evaluation to $O(N)$**
  - **File:** [`backend/simulation/solver.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py)
  - Precompute `node_incoming_edge_indices` and `node_outgoing_edge_indices` lookup dicts in `prune_topology()` to replace $O(N \times M)$ scans in `objective()`.
- [ ] **Precompute Pipe Invariant Geometry Terms**
  - **File:** [`backend/simulation/equipment/pipe.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/pipe.py)
  - Cache `area` and `rel_roughness_term` on `self` during `__init__`, eliminating nested closures in `calculate_delta_p`.
- [ ] **Bound Warm-Start Cache Size**
  - **File:** [`backend/simulation/solver.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py)
  - Cap `_warm_start_cache` to 128 entries with eviction and provide a `clear_warm_start_cache()` classmethod.
- [ ] **Parallelize TR2000 Sub-Queries with `asyncio.gather`**
  - **File:** [`backend/services/tr2000_service.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/services/tr2000_service.py)
  - Reuse `httpx.AsyncClient` and fetch pipe size schedules and PT tables concurrently to halve sync latency.
- [ ] **Add Unit Tests for `RemoteControlValve`**
  - **File:** `backend/tests/test_physics_remote_control_valve.py`
  - Add test suite covering analytical derivatives, downstream set-pressure regulation, and signal edge graph parsing.
- [ ] **Add Edge-Case Tests for Disconnected Subgraphs & Zero-Flow Circuits**
  - **File:** `backend/tests/test_physics_topology_isolated.py`
  - Add test suite verifying automatic pruning of floating nodes and numerical stability under 100% blocked flow conditions.

---

## 🟢 Priority 4: Low (Code Cleanup & Architecture Hygiene)

- [ ] **Deduplicate `extract_telemetry` Logic**
  - **Files:** [`backend/main.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py), [`backend/routers/simulation.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/simulation.py)
  - Unify telemetry serialization into a single shared function to eliminate code duplication and attribute drift.
- [ ] **Extract Collaborative Locking to `backend/services/lock_service.py`**
  - **Files:** [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py), [`backend/routers/projects.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/projects.py)
  - Decouple router files and remove late intra-function imports.
- [ ] **Remove Dead Code in `calculate_jacobian`**
  - **File:** [`backend/simulation/solver.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py)
  - Delete unused `q_in_node_all` allocation array (lines 447–451).
- [ ] **Remove Python Runtime Reflection in `calculate_dp_derivative`**
  - **File:** [`backend/simulation/equipment/base_node.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/base_node.py)
  - Replace `inspect.signature` with fast attribute/type check.
- [ ] **Clean Up Redundant Local Re-Imports**
  - Clean up duplicated `import json`, `from simulation.fluid_utils import FluidProperties`, and `import os` in sub-functions.
