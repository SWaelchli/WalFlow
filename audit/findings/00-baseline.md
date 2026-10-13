# Phase 0: Setup and Baseline

**Date:** 2026-10-13 · **Commit:** `3e46a3b` (main, clean) · **Env:** Windows 11, Python 3.13.14 (`.venv`), Node 22.11.0

## Finding template

```
### F0-xx  <title>
- Severity: S1 | S2 | S3
- Location: path:line
- Expected: ...
- Actual: ...
- Evidence: command / numbers
- Suggested fix: ...
- Follow-up in plan item: x.y
```

---

## 0.2 Backend test suite

`.venv/Scripts/python -m pytest backend/tests -q -rsxX`

- **134 passed, 0 failed, 0 skipped, 0 xfail** in 8.4 s
- 28 warnings, all Pydantic v2 deprecations (`class Config`, `.dict()`, `.copy()`, `min_items`, `__fields_set__`) in `routers/*.py`, `graph_parser.py:46`, `routers/simulation.py:85,86,120,121`
- Green suite does **not** imply correct physics; see F0-05.

## 0.3 Frontend lint and build

- `npm run lint`: **clean** (0 errors, 0 warnings)
- 7 `eslint-disable` comments: 4× `react-hooks/exhaustive-deps` (`App.jsx` ×2, `AuthProvider.jsx`, `AdminHubModal.jsx`), 3× `react-refresh/only-export-components`. Review the 4 hook ones in 2.21.
- `npm run build`: **succeeds** in 3.9 s
  - Single JS chunk **1,510 kB** (377 kB gzip), no code splitting (Phase 2.22)
  - Vite warns Node 22.11.0 is below the required 22.12+

## 0.4 Example diagrams (headless solve through the WebSocket code path)

Script: scratchpad `solve_examples.py` (`ReactFlowGraph` → `GraphParser.parse_graph` → `NetworkSolver` → `run_sequential_relief_simulation`), warm-start cache cleared before every case.

| File | Cases | Result | Notes |
|---|---|---|---|
| Example_API_614_LOS | 6 | all "success" | 15–18 outer iterations, 51 unknowns |
| Example_API_682_Seal_Flush | 1 | "success" | **100 outer iterations = limit hit, setpoints not met (F0-01)** |
| Example_Chilled_Water_Loop | 1 | success | |
| Example_Multi_PSV_Protection | 1 | success | |
| Example_Parallel_Pumps | 1 | success | |
| Example_Pressure_Regulation | 1 | success | 33 outer iterations |
| Example_Pump_Comparison | 1 | success | |
| Example_Remote_Control | 1 | success | |
| Example_Thermal_Management | 1 | success | |
| walflow-diagram (8) | 4 | success | not wired into the app (F0-04); "20° Start" needs 92 outer iterations; reports `warm_start_status: Exact Hit` after a cache clear (F0-06) |
| GreetingCanvas | 3 | success | |

All residuals ≤ 1e-4 (scaled). No exceptions, no fallback to the dense solver. Browser-side loading is not yet checked (needs the running app, Phase 2.10 / 3.9).

## 0.5 `qa_report/`

- The working tree only has stale `__pycache__/*.pyc`. The earlier AI audit (`eacef70`, dated 2026-08-03, app v0.1.3) was deleted in `4cad62d` ("implemented the remaining items from the qa audit").
- Recoverable via `git show 4cad62d^:qa_report/QA_SUMMARY_REPORT.md` (also `engineering/PHYSICS_VERIFICATION.md`, `test_physics_accuracy.py`, `security/SECURITY_AUDIT_REPORT.md`, `ui/UI_QA_REPORT.md`, `performance/*`).
- What it covered: pipe ΔP (Swamee-Jain), tank hydrostatic head, orifice loss, pump/system operating point, parallel-loop mass/pressure continuity, cavitation flag, SEC-01..09, Imperial unit gap (since built in 0.2.0), solver O(N^2.7) scaling.
- **Weakness (F0-05):** its "hand calculations" re-implement the code's own formulas, e.g. orifice `Cd = 0.60/√(1+250/Re)` (not a standard correlation) and "cavitation if P_suction < 1.2·P_vap" (not an NPSH check). It confirms the code does what the code says, not that the physics is right. Phase 1 must use **independent references** (Crane TP-410, ISO 5167, Idelchik, Hydraulic Institute, fluid property tables).
- Delete the stale `qa_report/` folder (cosmetic).

## 0.6 Test coverage by equipment

Number of test files that reference each equipment module:

| Equipment | Test files | Comment |
|---|---|---|
| base_node | 0 | abstract |
| calibrated_restriction, check_valve_orifice, flow_source, remote_control_valve, three_way_tcv | 1 | thin |
| check_valve, filter, linear_regulator, pressure_safety_valve, pressure_source, reducer, rupture_disc | 2 | |
| heat_exchanger | 3 | |
| mixer, splitter, volumetric_pump | 5 | |
| linear_control_valve | 6 | |
| orifice | 7 | |
| centrifugal_pump | 12 | |
| pipe | 23 | |
| tank | 26 | |

Gaps that matter: no test checks that **control loops (regulator, RCV, TCV) actually reach their setpoint** at the end of a solve (F0-01 shows they can fail silently). Fluid property correlations (`fluid_utils.py`) have no test against published data. No test checks results in the frontend's unit conversions.

---

## Findings

### F0-01  Pressure regulators do not converge; result depends on the iteration limit, but is reported as a success
- **Severity: S1** (wrong numbers shown as valid)
- Location: [solver.py:196-366](../../backend/simulation/solver.py#L196-L366) (outer control loop), `success = solve_error is None` at line 366
- Expected: the outer loop either converges to the setpoints (|P_sensed − P_set| < 0.001 bar) or the result is flagged as not converged / control saturated.
- Actual, `Example_API_682_Seal_Flush` (PRV set 10 bar, BPR set 8 bar):

  | control_iterations | PRV sensed [bar] | PRV opening | BPR sensed [bar] | BPR opening |
  |---|---|---|---|---|
  | 50 | 12.54 | 65.7% | 10.46 | 23.7% |
  | 100 (default) | 8.83 | 70.0% | 6.57 | 14.7% |
  | 200 | 11.92 | 64.5% | 9.82 | 21.9% |
  | 400 | 12.25 | 58.8% | 10.21 | 22.9% |

  Neither valve is saturated, so a solution exists; the damped proportional fixed-point update (gain 15 %/bar, damping 0.25) oscillates. `success: True` in every row.
- Also to verify in 1.41: `sensed` is compared to `set_pressure` without an explicit gauge/absolute conversion.
- Suggested fix (Phase 4): put the regulator setpoint into the Newton system as an equation (or use a secant/bisection outer loop), and always report `controls_converged` / `control_saturated` in stats and in the UI.
- Follow-up: 1.3, 1.27, 1.41, 3.20, 3.30

### F0-02  File format 0.1 diagrams cannot be loaded by cloud load, local drafts are silently purged, but local import and examples bypass the check
- **Severity: S2** (data access loss, inconsistent behaviour)
- Location: [constants.js](../../frontend/src/constants.js) (`FILE_FORMAT_VERSION = '0.2'`), [Sidebar.jsx:939](../../frontend/src/components/panels/Sidebar.jsx#L939), [ProjectManagerModal.jsx:214](../../frontend/src/components/modals/ProjectManagerModal.jsx#L214), [useAutoSaveSession.js:366](../../frontend/src/hooks/useAutoSaveSession.js#L366), [App.jsx:770](../../frontend/src/App.jsx#L770) (`loadData`, no check)
- Actual: every shipped example and `GreetingCanvas.wlf` is `version: "0.1"`, `app_version: "0.1.6"`. They load through `loadData` with no version check and no migration. Cloud diagrams saved as 0.1 are blocked with an `alert`. A 0.1 local draft is deleted with only a `console.warn`. Local file import (`App.jsx:1058, 1634`) has no check at all.
- The backend solves the 0.1 examples fine, so it is unclear whether a real incompatibility exists that justified the bump to 0.2 (AGENTS.md: raise the format only for a real incompatibility).
- Suggested fix: one `migrateDiagram(data)` function used by every load path (0.1 → 0.2), re-save examples as 0.2, never silently purge drafts.
- Follow-up: 2.10, 2.11

### F0-03  Version documentation drift
- **Severity: S3**
- AGENTS.md says app `0.1.6` / format `0.1`; code says app `0.2.0` (`constants.js`, `package.json`, `main.py:89` hardcoded) / format `0.2`. Last tag is `v0.1.5` (no `v0.1.6` tag). CHANGELOG has a `[0.2.0]` section.
- Suggested fix: confirm the intended current version with the user, update AGENTS.md, read the backend version from one place.

### F0-04  Stray personal diagram in the examples folder
- **Severity: S3**
- `frontend/src/data/examples/walflow-diagram (8).wlf` (49 nodes, 4 cases) is not imported in `App.jsx`. It looks like a downloaded working file. Either rename and register it as an example, or remove it.

### F0-05  The existing physics tests are partly self-referential
- **Severity: S2** (false confidence)
- The earlier QA report and several `test_physics_*` files compute the "expected" value with the same correlations the code uses. Check this per test in 1.46.

### F0-06  Warm-start status reported after a cache clear
- **Severity: S3** (diagnostic only, to confirm)
- `walflow-diagram (8)` reports `warm_start_status: "Exact Hit"` on the first solve after `NetworkSolver.clear_warm_start_cache()`. Probably the second pass of `run_sequential_relief_simulation` hits the cache that the first pass filled, so the reported status describes the last internal solve, not the user's request. Check in 1.7 and 1.10.

### F0-07  Hygiene
- **Severity: S3**
- 28 Pydantic v2 deprecation warnings (will break on Pydantic v3).
- Frontend bundle 1.5 MB single chunk.
- Node 22.11 below Vite's minimum 22.12.
- Stale `qa_report/engineering/__pycache__`.
