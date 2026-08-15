# WalFlow Backend Audit Implementation Handover

**Handover Date:** 2026-08-14  
**Source Role:** Lead Backend Auditor & Orchestrator  
**Target Role:** Implementation Agent / Software Engineer  
**Related Artifacts:**
- 📄 [`backend_audit_report.md`](file:///c:/Users/sebas/Coding/WalFlow/backend_audit_report.md) — Comprehensive technical report with detailed line-by-line analyses, root causes, and ready-to-apply code diffs.
- 📝 [`audit_todo.md`](file:///c:/Users/sebas/Coding/WalFlow/audit_todo.md) — Prioritized checklist across Critical, High, Medium, and Low priorities.

---

## 1. Project Context & Non-Negotiable Engineering Principles

### A. Core Architecture
WalFlow is a web-based hydraulic simulator with:
- **Backend:** Python FastAPI with SQLite (SQLAlchemy ORM), WebSockets for real-time bidirectional simulation/collaboration, and SciPy/NumPy for algebraic network solving.
- **Frontend:** React / Vite / ReactFlow with custom nodes, P&ID visual canvas, and telemetry overlay.

### B. Steady-State Hydraulic Solver ($\Delta t = 0$)
- **Strict Invariant:** WalFlow models **instantaneous algebraic steady-state equilibrium**. There are no time-steps ($\Delta t = 0$).
- **Constraint:** Do **NOT** propose or implement time-dependent transient physics (e.g., dynamic accumulator charge/discharge over time, transient water hammer waves, tank level filling over time, or valve opening ramps).

### C. The "Merit Rule"
- Only implement code modifications that deliver concrete, measurable benefits: bug fixes, concurrency safety, memory leak elimination, or algorithmic speedups.
- Notice: **`backend/simulation/fluid_utils.py` was evaluated and determined to be already optimal.** Do not refactor `fluid_utils.py`.

### D. Operational Guidelines
- **Git Commits:** Do **NOT** run `git commit` automatically. The user performs all commits manually.
- **Versioning:** Current App Version is `0.1.6` and File Format Version is `0.1`. Do not increment version numbers without explicit user instruction.
- **Changelog:** Track meaningful changes in `CHANGELOG.md` concisely.

---

## 2. Step-by-Step Implementation Roadmap

The implementation should be carried out in four structured phases. After each phase, run the test suite to verify zero regressions.

---

### 🚀 Phase 1: Critical Bug Fixes & Event Loop Offloading (Priority 1)

1. **Fix Missing `logging` Import in Pipe Classes Router**
   - **Target File:** [`backend/routers/pipe_classes.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/pipe_classes.py#L1-L10)
   - **Action:** Add `import logging` at top of file.
   - **Why:** Prevents `NameError` from crashing external TR2000 API errors into unhandled HTTP 500s instead of HTTP 502s.

2. **Offload Simulation from Event Loop in WebSocket Endpoint**
   - **Target File:** [`backend/main.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py#L216-L225)
   - **Action:** Wrap `run_sequential_relief_simulation(...)` inside `await asyncio.to_thread(...)`.
   - **Why:** Prevents heavy matrix solving from freezing FastAPI's asyncio event loop, keeping WebSocket broadcasts and API calls responsive during calculation.

3. **Harden WebSocket JSON Frame Parsing**
   - **Target File:** [`backend/main.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py#L158-L197)
   - **Action:** Wrap `json.loads` and dictionary validation in try/except; safely cast valve percentage updates with try/except fallbacks.
   - **Why:** Protects WebSocket sessions from abruptly dropping on malformed client frames.

---

### 🛡️ Phase 2: Database & Real-Time Collaboration Resilience (Priority 2)

1. **Enable SQLite WAL Mode, Busy Timeout & Foreign Keys**
   - **Target File:** [`backend/db/database.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/db/database.py#L17-L35)
   - **Action:** Attach an `@event.listens_for(engine, "connect")` hook executing `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA busy_timeout = 10000`, and `PRAGMA foreign_keys = ON`.
   - **Why:** Prevents `sqlite3.OperationalError: database is locked` during concurrent multi-tab or API access, and enforces relational integrity.

2. **Add Transaction Rollback on Exception in `get_db`**
   - **Target File:** [`backend/db/database.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/db/database.py#L25-L32)
   - **Action:** Add `except Exception: db.rollback(); raise` before `finally: db.close()`.
   - **Why:** Prevents uncommitted transaction states from lingering across connection reuses.

3. **Fix Room Switching Socket Leak in `ConnectionManager`**
   - **Target File:** [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L42-L55)
   - **Action:** Before assigning a WebSocket to a new `diagram_id`, inspect `self.websocket_diagrams.get(websocket)` and discard it from the previous room set.
   - **Why:** Eliminates cross-room broadcast pollution and dead socket accumulation on navigation.

4. **Concurrent Broadcasts & Dead Socket Eviction**
   - **Target File:** [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L56-L65)
   - **Action:** Refactor `broadcast_to_diagram` to dispatch `conn.send_text(...)` using `asyncio.gather(*tasks, return_exceptions=True)`, immediately calling `self.disconnect(conn)` on any socket that returns an exception.
   - **Why:** Prevents slow client head-of-line blocking and automatically purges dropped connections.

5. **Prune Expired Locks in Local Store `LOCAL_LOCKS`**
   - **Target File:** [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py#L35, L69-L115)
   - **Action:** Introduce `_prune_expired_local_locks(now)` called during lock checks/acquisitions.
   - **Why:** Bounds memory usage when running without Redis.

6. **Isolate Database Sessions from Remote TR2000 I/O**
   - **Target File:** [`backend/routers/pipe_classes.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/pipe_classes.py#L190-L222)
   - **Action:** Delay `db = SessionLocal()` creation until *after* `await fetch_and_normalize_tr2000_pcs(...)` finishes.
   - **Why:** Frees database connection pool slots during slow external network calls.

---

### ⚡ Phase 3: Solver Optimizations & Missing Tests (Priority 3)

1. **Optimize Residual Mass Balance from $O(N \times M)$ to $O(N)$**
   - **Target File:** [`backend/simulation/solver.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py#L142, L685)
   - **Action:** In `prune_topology()`, precompute `self.node_incoming_edge_indices` and `self.node_outgoing_edge_indices` mapping each `node_id` to a list of edge index ints. In `objective()`, replace generator scans with direct indexed lookups.
   - **Why:** Yields a $5\times\text{--}20\times$ speedup on residual evaluations during Newton and line-search iterations.

2. **Precompute Pipe Invariant Geometry Terms**
   - **Target File:** [`backend/simulation/equipment/pipe.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/pipe.py#L25-L50)
   - **Action:** Precalculate `self.area` and `self.rel_roughness_term` on `self` during `__init__`. Replace nested `get_f_turb` closures with direct inlined evaluations.
   - **Why:** Eliminates redundant float division and function object instantiations in tight solver loops.

3. **Bound Warm-Start Cache Size**
   - **Target File:** [`backend/simulation/solver.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py#L28, L770)
   - **Action:** Cap `_warm_start_cache` at 128 entries with FIFO eviction and expose `clear_warm_start_cache()` classmethod.
   - **Why:** Prevents continuous memory accumulation in persistent server environments.

4. **Parallelize TR2000 Sub-Queries**
   - **Target File:** [`backend/services/tr2000_service.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/services/tr2000_service.py#L88-L112, L224-L231)
   - **Action:** Pass reusable `httpx.AsyncClient` and fetch pipe size schedules and PT tables concurrently with `asyncio.gather`.
   - **Why:** Halves TR2000 spec sync latency.

5. **Create `RemoteControlValve` Unit Tests**
   - **Target File:** `backend/tests/test_physics_remote_control_valve.py` [NEW]
   - **Action:** Implement test cases for analytical derivatives, remote downstream pressure regulation, and signal edge graph parsing (see concrete test code in Section 4.1 of [`backend_audit_report.md`](file:///c:/Users/sebas/Coding/WalFlow/backend_audit_report.md)).

6. **Create Isolated Subgraph & Zero-Flow Edge Case Tests**
   - **Target File:** `backend/tests/test_physics_topology_isolated.py` [NEW]
   - **Action:** Implement tests verifying pruning of floating unlinked nodes and zero-flow division-by-zero resilience on 100% closed valves (see Section 4.2 of [`backend_audit_report.md`](file:///c:/Users/sebas/Coding/WalFlow/backend_audit_report.md)).

---

### 🧹 Phase 4: Code Architecture & Cleanup (Priority 4)

1. **Deduplicate Telemetry Extraction**
   - **Target Files:** [`backend/main.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/main.py#L85-L127), [`backend/routers/simulation.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/simulation.py#L80-L103)
   - **Action:** Unify into a single canonical `extract_telemetry` function in `routers/simulation.py` and import it in `main.py`.

2. **Extract Collaborative Locking to Service Layer**
   - **Target Files:** Create `backend/services/lock_service.py`, update [`backend/routers/diagrams.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/diagrams.py) and [`backend/routers/projects.py`](file:///c:/Users/sebas/Coding/WalFlow/backend/routers/projects.py).
   - **Action:** Move `ConnectionManager`, `acquire_lock`, `release_lock`, `get_lock_status_info`, and `DiagramSummarySchema` into the service layer, eliminating late intra-function imports.

3. **Delete Dead Variables & Reflection Overhead**
   - **Target Files:**
     - Delete unused `q_in_node_all` in [`backend/simulation/solver.py:447-451`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/solver.py#L447-L451).
     - Replace `inspect.signature` in [`backend/simulation/equipment/base_node.py:90-93`](file:///c:/Users/sebas/Coding/WalFlow/backend/simulation/equipment/base_node.py#L90-L93) with direct attribute check.
     - Clean redundant local re-imports across `projects.py`, `remote_control_valve.py`, and `main.py`.

---

## 3. Verification & Validation Commands

Always run the following commands to verify backend integrity:

```bash
# 1. Run full backend unit and regression test suite
pytest backend/tests/

# 2. Test specific physics suites
pytest backend/tests/test_physics_valves.py
pytest backend/tests/test_physics_pumps.py
pytest backend/tests/test_physics_solver.py

# 3. Verify FastAPI application starts cleanly
python -c "import main; print('Backend loaded successfully:', main.app.title)"

# 4. Frontend verification (if modifying any shared schemas/routes)
cd frontend
npm run lint
npm run build
```

---

## 4. Summary Checklist for the Next Agent

- [ ] Read [`backend_audit_report.md`](file:///c:/Users/sebas/Coding/WalFlow/backend_audit_report.md) for exact diff snippets.
- [ ] Implement changes phase by phase according to [`audit_todo.md`](file:///c:/Users/sebas/Coding/WalFlow/audit_todo.md).
- [ ] Ensure **no transient or dynamic time-stepping ($\Delta t \ne 0$)** is introduced into the solver.
- [ ] Run `pytest backend/tests/` after each phase.
- [ ] Update [`CHANGELOG.md`](file:///c:/Users/sebas/Coding/WalFlow/CHANGELOG.md) upon completion.
- [ ] **Do NOT run git commit** (user handles commits manually).
