# WalFlow Audit Plan

Audit of the Gemini/Antigravity-built codebase across three aspects:

1. **Physical correctness** of the backend solver and equipment models
2. **Correct implementation** of the frontend
3. **User friendliness** (usability and clarity)

This file is the single source of truth for progress across conversations.
**At the start of each session:** read this file, pick the first `TODO` / `IN PROGRESS` item, work it, then update the status fields and the Session Log.
**Do not change app code during the audit.** Record findings in `audit/findings/*.md` (one file per phase). Fixes are a separate, user-approved step (see Phase 4 and AGENTS.md rule 1).

---

## Status Legend

`TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` · `SKIPPED`

Severity: **S1** wrong physics or data loss · **S2** wrong or misleading result in some cases · **S3** minor, cosmetic or hygiene.

## Overall Progress

| Phase | Aspect | Status | Findings (S1/S2/S3) | Findings file |
|---|---|---|---|---|
| 0 | Setup and baseline | DONE | 1/2/4 | audit/findings/00-baseline.md |
| 1 | Backend physical correctness | DONE | 4/20/17 | audit/findings/01-physics.md |
| 2 | Frontend implementation | DONE | 3/11/14 | audit/findings/02-frontend.md |
| 3 | User friendliness | DONE | 2/8/9 | audit/findings/03-ux.md |
| 4 | Triage and fix roadmap | IN PROGRESS | 89 unique (9/40/40) | audit/findings/04-triage.md |

**Last updated:** 2026-10-13 (decisions recorded; B0 prompt awaiting user confirmation)

---

## Phase 0: Setup and Baseline

| ID | Task | Status |
|---|---|---|
| 0.1 | Create `audit/findings/` and a findings template (ID, severity, file:line, expected vs actual, evidence, suggested fix) | DONE |
| 0.2 | Install deps, run backend test suite (`pytest backend/tests`), record pass/fail and any skipped or xfail tests | DONE: 134 passed, 28 deprecation warnings |
| 0.3 | Run `npm run lint` and `npm run build` in `frontend/`, record warnings and errors | DONE: lint clean, build OK (1.5 MB chunk) |
| 0.4 | Run app locally (backend + frontend), load each example `.wlf` in `frontend/src/data/examples/`, record which converge | DONE (headless backend solve): all 22 example/case runs report success, but API 682 regulators did not converge (F0-01). Loading in the browser moved to 2.10 / 3.9 |
| 0.5 | Review `qa_report/engineering/` (only stale `.pyc` seen, check whether the test source exists or was deleted) | DONE: earlier audit deleted in `4cad62d`, recoverable from git; partly self-referential (F0-05) |
| 0.6 | Note the test-coverage gaps: which equipment types have no `test_physics_*` file (e.g. heat exchanger, mixer/splitter, pipe, tank, centrifugal pump curves) | DONE: see coverage table in 00-baseline.md |

---

## Phase 1: Backend Physical Correctness

Scope: [backend/simulation/](backend/simulation/), especially [solver.py](backend/simulation/solver.py) (1262 lines), [fluid_utils.py](backend/simulation/fluid_utils.py), [graph_parser.py](backend/simulation/graph_parser.py), and `equipment/*.py`.
Method: read the code, derive the expected result by hand or with an independent calculation (Python script using textbook formulas), and compare. Wherever possible, write a **throwaway check script** in the scratchpad, not in the repo.
Reminder from AGENTS.md: the solver is **steady-state only**. Judge it against that model, and do not flag the lack of transients as a defect.

### 1A. Solver core

| ID | Check | Status |
|---|---|---|
| 1.1 | Unknown vector and residual formulation: mass balance at every node, pressure continuity on every edge, no missing or duplicate equations (square system) | DONE: OK |
| 1.2 | Analytical Jacobian vs finite-difference Jacobian for every equipment type (the reducer was already found wrong once) | DONE: OK except TCV/valves/PSV (F1-12) |
| 1.3 | Convergence criteria and tolerances (`tol=1e-6` in scaled space): what do they mean in bar and L/min? Does "converged" ever mean a wrong answer? | DONE: yes (F1-01, F1-02, F1-06, F1-15) |
| 1.4 | Scaling of variables (`x_scaled`) and the `is_physical` check: can it reject valid solutions or accept non-physical ones (negative absolute pressure)? | DONE: accepts −23 bar(a) (F1-07) |
| 1.5 | Fallback path (dense Jacobian / `method` switch): same answer as the sparse Newton? Compare on all examples | DONE: same answer, but LM fails on 3/10 (F1-11) |
| 1.6 | Topology pruning and reachability (`prune_topology`): isolated sub-networks, dead ends, closed relief devices, inactive pumps. What does the user see for unreachable nodes? | DONE: silent (F1-10) |
| 1.7 | Warm-start cache: key correctness (topology + case), stale state across edits, results independent of history (solve cold vs warm gives the same answer) | DONE: OK for well-posed; history-dependent + thread-unsafe (F1-14) |
| 1.8 | Bottleneck identification and diagnostics (`_identify_bottleneck`) are meaningful | DONE: only meaningful on failure; UX in 3.4 |
| 1.9 | Reverse flow handling, zero-flow singularities (e.g. `sqrt(dP)` derivative at dP=0), regularization bias introduced near zero | DONE: OK; near-zero flow accuracy limited by F1-06 |
| 1.10 | Sequential relief simulation (`run_sequential_relief_simulation`): logic, ordering, termination, accumulation/overpressure calc | DONE: F1-03, F1-04, F1-08, F1-09 |
| 1.11 | Multiple solutions / non-uniqueness (parallel pumps, check valves, regulators): does the solver pick a physically sensible branch? | DONE: controller non-uniqueness F1-01, PSV latch F1-04, parallel pumps reverse branch F1-34 |

### 1B. Fluid properties ([fluid_utils.py](backend/simulation/fluid_utils.py))

| ID | Check | Status |
|---|---|---|
| 1.12 | Density vs temperature for each catalog fluid against published data (water, oils, glycols, ISO VG grades); check valid T range and extrapolation behaviour | DONE: water ✔; oils too thin when cold, VG32 inconsistent (F1-26); aqueous F1-29; water ρ F1-30 |
| 1.13 | Viscosity vs temperature (Walther/ASTM D341 or similar); dynamic vs kinematic unit handling (cSt vs Pa·s, density factor) | DONE: units ✔ (cSt×ρ→Pa·s); Vogel c=120 fit (F1-26, F1-29) |
| 1.14 | Vapor pressure and cavitation/NPSH use (Antoine or equivalent): units, range, and whether it is actually used in the pump/valve models | DONE: water ✔; gasoline 4–8× low (F1-27); used only as boiling flag, no NPSH (F1-28) |
| 1.15 | Specific heat, thermal conductivity if used; units | DONE: cp within 1–9 %; conductivity not used; no validity ranges (F1-31) |
| 1.16 | Cd(Re), valve Fr(Re), filter viscosity factor curves: source, continuity, limits (Re to 0 and Re to infinity) | DONE: orifice Cd too low at low Re (F1-25); valve Fr vs IEC acceptable (F1-32); filter factor continuous |

### 1C. Equipment models (one pass per file in [backend/simulation/equipment/](backend/simulation/equipment/))

For each: equation correctness, **units** (bar vs Pa, L/min vs m³/s, gauge vs absolute), sign conventions, behaviour at zero flow and reverse flow, limits (clamps), heat generation, property propagation, and agreement with the model's own `.md` doc where one exists.

| ID | Equipment | Key physics to verify | Status |
|---|---|---|---|
| 1.20 | pipe.py | Darcy-Weisbach, friction factor (laminar 64/Re, Colebrook/Swamee-Jain, transition handling), roughness, fittings K via equivalent length / K-sum, elevation head, velocity | DONE: friction verified (B1, F1-21); no fittings/elevation (F1-17); zero-flow Jacobian (F1-12) |
| 1.21 | tank.py | Pressure boundary, static head, temperature mixing assumptions | DONE: all ports at bottom pressure (F1-33); tank = infinite heat sink (document) |
| 1.22 | pressure_source.py / flow_source.py | Gauge vs absolute, boundary conditions, `.md` agreement | DONE: OK; flow source spring error ΔP/100 bar % (doc), cap F1-24 |
| 1.23 | centrifugal_pump.py | Curve interpolation, affinity laws if speed varies, NPSH/cavitation, efficiency, heat-to-fluid (P_hyd vs shaft) | DONE: F1-18, F1-28; symmetric reverse-flow curve (F1-34) |
| 1.24 | volumetric_pump.py | Fixed displacement, slip, relief behaviour, heat input, efficiency | DONE: unlimited flow when pushed (F1-35); silent power limit, KPI nameplate (F1-36) |
| 1.25 | orifice.py / calibrated_restriction.py | ISO 5167 or Cd-based Q = Cd·A·√(2ΔP/ρ), beta ratio, Re dependence, laminar regime, `.md` agreement | DONE: ISO 5167 correct; β clamp (F1-39); low-Re Cd (F1-25); calibration OK (C1) |
| 1.26 | linear_control_valve.py / three_way_tcv.py | Cv/Kv conversion constants, opening characteristic, flow split, temperature control logic | DONE: Cv const OK; linear trim only, no choke (F1-28); TCV F1-05 |
| 1.27 | linear_regulator.py / remote_control_valve.py | Pressure regulation logic (upstream/downstream/differential), sense pin, closed/open/regulating regimes, hysteresis-free steady state | DONE: no lock-up, dead-end = inlet pressure (F1-37); loop F1-01 |
| 1.28 | check_valve.py / check_valve_orifice.py | Cracking pressure, reverse blocking, continuity of the residual (Newton-friendly) | DONE: MCP OK; CVO parallel approximation acceptable; heat F1-16 |
| 1.29 | pressure_safety_valve.py / rupture_disc.py | Set pressure, overpressure/accumulation, capacity, reseat, burst behaviour, forced-state flags | DONE: capacity % referenced to 1 bar → always overcapacity (F1-38); F1-03/04/09 |
| 1.30 | filter.py | ΔP vs Q and viscosity, clogging factor, bypass | DONE: water-referenced (F1-19); clogging OK; no bypass (doc) |
| 1.31 | heat_exchanger.py | Energy balance (Q = m·cp·ΔT), effectiveness or fixed-ΔT model, pressure drop, hot vs cold side | DONE: ε-NTU reproduces rated duty; infeasible rating silent (F1-40); C_max=∞ (doc) |
| 1.32 | mixer.py / splitter.py | Mass balance, enthalpy-weighted mixing temperature, pressure equalisation, viscosity/density of mixture | DONE: OK; no junction loss (F1-17), reverse-flow temp (F1-13) |
| 1.33 | reducer.py | Crane TP-410 K-factors (contraction/expansion), Jacobian (recently fixed in 733481b, re-verify) | DONE: Crane A-26 formulas and Jacobian OK |
| 1.34 | base_node.py | Shared contract (`p_out` update, state flags) used consistently | DONE: contract consistent; calculate_temperature erases heat (F1-16) |

### 1D. Cross-cutting physics

| ID | Check | Status |
|---|---|---|
| 1.40 | **Unit consistency end to end:** frontend units, schema units, internal SI, response units. Grep for magic constants (1e5, 60000, 0.0000..., 273.15) and verify each | DONE: SI/abs internally OK; naming inconsistent (F1-20); field matrix in 2.1 |
| 1.41 | Gauge vs absolute pressure used consistently, atmospheric reference value | DONE: consistent labels (a)/(d); relief-device issue F1-09 |
| 1.42 | Energy balance of a closed loop: pump heat = heat rejected + ΔT rise; check on `Example_Chilled_Water_Loop` and `Example_Thermal_Management` | DONE: throttling heat lost (F1-16), 2.6–2.9 % imbalance with coolers, 71–78 % without |
| 1.43 | Thermal propagation (`_propagate_properties`): ordering on loops/recirculation, mixing at junctions, iteration count and convergence | DONE: OK; volumetric (not mass) continuity noted |
| 1.44 | Compare 3 to 5 benchmark networks to **independent hand/script calculation** (series pipe+orifice, parallel branches, pump-system curve intersection, regulator, PSV relief) and record the delta | DONE: pipe/parallel/pump/orifice within 0.4 %; transition +14 % (F1-21) |
| 1.45 | Operating cases (`test_operating_cases.py`, `case_resolver`): override semantics are physically valid | DONE: OK; dead case variables (F1-22) |
| 1.46 | Test review: are the existing `test_physics_*` assertions checking correct values (or just "no crash" / snapshot of current output)? | DONE: 6 physics test files have no assertions (F1-41); some self-referential (F0-05) |

**Phase 1 exit criteria:** every row is `DONE` or `SKIPPED` with a reason; every defect has a severity and a reproduction in `01-physics.md`.

---

## Phase 2: Frontend Implementation

Scope: [frontend/src/](frontend/src/). Large files to review closely: [App.jsx](frontend/src/App.jsx) (1970 lines), [Sidebar.jsx](frontend/src/components/panels/Sidebar.jsx) (1993), [SetupPanel.jsx](frontend/src/components/panels/SetupPanel.jsx) (2161), [DataList.jsx](frontend/src/components/panels/DataList.jsx) (1106), [FittingStandardsTab.jsx](frontend/src/components/piping/FittingStandardsTab.jsx) (1038), [AdminHubModal.jsx](frontend/src/components/modals/AdminHubModal.jsx), [ProjectManagerModal.jsx](frontend/src/components/modals/ProjectManagerModal.jsx).

### 2A. Frontend-to-backend contract

| ID | Check | Status |
|---|---|---|
| 2.1 | Graph serialisation: every node type's frontend `data` fields match the backend `schemas.py` / `graph_parser.py` field names, units and defaults (build a field-by-field matrix per equipment) | DONE: matrix in 02-frontend.md; HX defaults mismatch (F2-04), imperial diameter (F2-01) |
| 2.2 | Unit conversion ([converters.js](frontend/src/utils/converters.js), [UnitContext.jsx](frontend/src/context/UnitContext.jsx)): round trip display to internal to display, rounding, temperature offsets (°C/°F/K), pressure gauge/absolute, flow, viscosity | DONE: constants OK; double conversion (F2-01), blur rounding (F2-05), typing reformat (F2-08) |
| 2.3 | Result mapping: backend telemetry keys rendered on the right node/edge/port; handling of missing, NaN, null, and Infinity values | DONE: all keys mapped; NaN (F2-15), wrong-case/stale results (F2-07), missing = 0 (F2-20) |
| 2.4 | WebSocket hook ([useWebSocketSimulation.js](frontend/src/hooks/useWebSocketSimulation.js)): reconnect, debounce, out-of-order responses, cancel in-flight, error and non-convergence messages, stale results shown after edit | DONE: reconnect/order OK; no stale marking (F2-07), alert spam (F2-17), traffic (F2-22) |
| 2.5 | Operating cases ([case_resolver.js](frontend/src/utils/case_resolver.js), [CaseManager.jsx](frontend/src/components/overlays/CaseManager.jsx)): resolver parity with the backend resolver, unit of override values | DONE: resolver parity OK; F2-05, F2-06, F2-07, F2-09, F2-21 |
| 2.6 | Reducer/fitting catalog ([reducer_catalog.js](frontend/src/utils/reducer_catalog.js), `asme_b16_9_data.js`, `standards_library.js`) numeric data vs source standards and vs backend defaults (`fitting_defaults.py`, `pipe_class_defaults.py`) | DONE: schedule + B16.9 tables correct; seed/fallback errors (F2-23) |
| 2.7 | Fluid library ([fluid_library.js](frontend/src/constants/fluid_library.js)) vs backend fluid catalog: single source of truth or drift? | DONE: in sync (23/23) but duplicated, /fluids unused (F2-24) |

### 2B. State, persistence, and canvas logic

| ID | Check | Status |
|---|---|---|
| 2.10 | `.wlf` import/export: schema versioning (file format `0.1`), backward compatibility, validation of malformed files, loading the example files | DONE: no validation/error boundary (F2-10); stale results in files (F2-21, F2-22); F0-02 |
| 2.11 | Autosave ([useAutoSaveSession.js](frontend/src/hooks/useAutoSaveSession.js)): race conditions, data loss on tab close, conflict with cloud project load, lock handling | DONE: F2-02, F2-11, F2-22 |
| 2.12 | Undo/redo ([useCanvasHistory.js](frontend/src/hooks/useCanvasHistory.js)): what is/isn't captured (cases, settings), memory growth, drag coalescing | DONE: history not reset on load, gaps (F2-03) |
| 2.13 | Keyboard shortcuts ([useKeyboardShortcuts.js](frontend/src/hooks/useKeyboardShortcuts.js)): conflicts with text inputs, browser shortcuts | DONE: F2-18 |
| 2.14 | Connection validation: port types, invalid connections (pressure to signal), self-loops, duplicates, handle ID naming vs parser's `_parse_port_idx` | DONE: handle ids OK; gaps (F2-19) |
| 2.15 | Node rotation / sensing pin / port geometry: handle positions after rotation match the data sent to the backend | DONE: OK (sensing only on port 0, S3 note) |
| 2.16 | Equipment parity: all 21 node components registered in `App.jsx` nodeTypes, `Sidebar`, symbol library, details panel, and backend registry (use the DEVELOPMENT.md checklist) | DONE: all 21 types registered everywhere (matrix in 02-frontend.md) |

### 2C. Code quality and React correctness

| ID | Check | Status |
|---|---|---|
| 2.20 | `npm run lint` and `npm run build` clean; review disabled eslint rules and `// eslint-disable` comments | DONE: lint clean, 7 justified disables |
| 2.21 | Hook dependency arrays (stale closures), missing keys, effects that loop or fire needlessly | DONE: F2-09, F2-21, F2-26 |
| 2.22 | Performance: re-render storms on drag / sim result updates, memoisation of node components, large `.wlf` (100+ nodes) responsiveness | DONE (code level): F2-28; measure in Phase 3 |
| 2.23 | Monolith review: App/Sidebar/SetupPanel/DataList size, duplicated logic, dead code, unused exports (candidate refactors, not fixes now) | DONE: F2-24, F2-26 |
| 2.24 | Error boundaries and handling of API failures (401/403/409/429/500) in all modals | DONE: no error boundary, no 401 interceptor (F2-10) |
| 2.25 | Auth/session handling in the frontend (token storage, expiry, logout), admin-only UI gated server-side too | DONE: cookie/refresh OK; F2-14 |
| 2.26 | Accessibility basics in code: labels, roles, focus traps in modals, keyboard operability | DONE: F2-27 |

### 2D. Backend API and security (supporting the frontend, light pass)

| ID | Check | Status |
|---|---|---|
| 2.30 | Routers (`auth`, `admin`, `projects`, `diagrams`, `invitations`, `pipe_classes`, `fitting_standards`): authz on every endpoint, ownership checks, input validation, rate limiting | DONE: F2-12, F2-13, F2-14, F2-25 |
| 2.31 | WebSocket `/ws/simulate`: auth, payload size limits, solver timeout, concurrency | DONE: auth off in compose, no timeout (F2-13) |
| 2.32 | Secrets, CORS, JWT config, default admin setup flow, Docker/nginx config | DONE: F2-12, F2-13 |
| 2.33 | Project locking ([lock_service.py](backend/services/lock_service.py)): stale locks, takeover, release on disconnect | DONE: F2-25 |

**Phase 2 exit criteria:** all rows resolved; the node-field contract matrix (2.1) and equipment-parity matrix (2.16) completed.

---

## Phase 3: User Friendliness

Method: act as a new user (a hydraulic/process engineer who has never seen the app). Run in the browser (Claude in Chrome or manual), take notes and screenshots, and record each friction point. Per AGENTS.md rule 3, consult the `ui-ux-pro-max` skill before proposing UI changes (when it is available), and check against the Design & Styling Philosophy in AGENTS.md.

### 3A. Task-based walkthroughs (time them, count clicks and confusions)

| ID | Task | Status |
|---|---|---|
| 3.1 | First launch: what does a user see, is the purpose clear, is there onboarding / greeting canvas, is login required for basic use? | DONE: greeting canvas good; run needs login by default (F3-03); greeting not reopenable (F3-15) |
| 3.2 | Build a simple circuit from scratch: tank to pump to pipe to orifice to tank; connect, set values, run | DONE: ~12 actions, smooth; new pipe shown DN15 but solved DN50 (F3-02); zoom/fit (F3-08) |
| 3.3 | Understand a result: find pressure, flow, temperature at a point; units; what the colours and the heatmap mean | DONE: table headers shifted one column (F3-01); chart formatting (F3-14); notation (F3-11) |
| 3.4 | Handle a failed or non-converging simulation: is the message actionable (which node, what to change)? | DONE: open port -> "converged", 0 eq. (F3-04); status only in Stats tab |
| 3.5 | Change units and fluid; verify the user understands what changed | DONE: F2-01 + F2-08 confirmed live; tank units, Pa (F3-11); settings layout (F3-12) |
| 3.6 | Use operating cases: create, switch, compare | DONE: case matrix + badges good; F2-07 confirmed; pump off 0.3 L/min (F3-16) |
| 3.7 | Save, reload, export/import, cloud project, share/lock flow | DONE (partial): local draft/restore OK; cloud/lock not run (no login), F2-02 unconfirmed |
| 3.8 | Configure pipe classes / fittings (new library feature): is the concept explained? | DONE: page clear; concept unexplained, rating/temp unused (F3-17) |
| 3.9 | Open each shipped example: is it self-explanatory, does it have annotations (text bubbles)? | DONE: all converge; Multi-PSV no note, 7-8 m/s velocities, stray file (F3-15) |
| 3.10 | Admin flow: invite user, manage users | DONE (code only): approve-pending flow, no invite; see F2-14 |

### 3B. Heuristic review (Nielsen 10 + domain)

| ID | Check | Status |
|---|---|---|
| 3.20 | Visibility of system status: running / converged / warm start / failed indicators, stale-result marking | DONE: F3-04, F3-10, F2-07 |
| 3.21 | Error prevention and messages: invalid inputs (negative length, zero diameter), missing required connections, unconnected ports; validation before run | DONE: F3-04, F2-16, F2-19 |
| 3.22 | Terminology: labels vs engineering conventions (gauge/abs, Cv/Kv, "active", "forced state"), tooltips and units on every field | DONE: F3-11 |
| 3.23 | Consistency: inspector layout across equipment, button hierarchy per design guideline, naming | DONE: F3-02, F3-06, F3-13 |
| 3.24 | Discoverability: shortcuts, right-click, rotation, sensing pins, text bubbles; [HelpInfoModal.jsx](frontend/src/components/modals/HelpInfoModal.jsx) content accuracy and completeness | DONE: F3-07, F3-18 |
| 3.25 | Information density: Sidebar mixes drag cards, templates, fluid/solver settings, diagnostics (AGENTS.md says sidebar should be focused); SetupPanel and DataList complexity | DONE: F3-08, F3-12 |
| 3.26 | Diagram readability: symbol clarity (ISA/ISO P&ID conventions), labels, flow direction arrows, heatmap legend | DONE: flow arrows OK; labels unreadable at fit (F3-08) |
| 3.27 | Responsive behaviour and small-screen / laptop (1366x768) layout; zoom and pan; dark/light | DONE: no breakpoints/dark mode, fixed 350 px panel (F3-08) |
| 3.28 | Accessibility: contrast ratios against the palette, focus visibility, colour-only encodings (heatmap, status), keyboard operation | DONE: CTA 2.49:1, orange 2.49:1, red 3.76:1 (F3-09) |
| 3.29 | Documentation: README, DEVELOPMENT.md, in-app help; is there a "how the solver works and its limits" explanation (steady-state, assumptions, valid ranges)? | DONE: help outdated, no model/limits doc (F3-07) |
| 3.30 | **Trust and safety of results:** does the UI warn when the model is outside validity (fluid temp range, cavitation, velocity limits, pressure above rating, non-converged), so users do not rely on bad numbers? | DONE: only cavitation + velocity colour; no pump/class/fluid-range warnings (F3-05) |

**Phase 3 exit criteria:** each walkthrough has a short narrative with friction points ranked; top 10 UX improvements listed with effort estimates.

---

## Phase 4: Triage and Fix Roadmap

| ID | Task | Status |
|---|---|---|
| 4.1 | Consolidate all findings into `audit/findings/04-triage.md`, sorted by severity, then effort | DONE: 95 → 89 unique (6 merged); effort S/M/L; anchors (file › symbol) |
| 4.2 | Group fixes into batches (physics S1/S2 first, then contract bugs, then UX quick wins, then refactors) | DONE: B0 hotfixes, B1a–d physics, B2 contract, B3 security, B4 UX, B5 refactor, B6 scope; decisions listed per batch |
| 4.3 | For each batch write a requirement prompt and **wait for user confirmation** before editing code (AGENTS.md rule 1) | IN PROGRESS: decisions recorded in 04-triage.md; B0 prompt written, awaiting confirmation |
| 4.4 | For each physics fix, add a regression test with an independent reference value | TODO |
| 4.5 | Update CHANGELOG.md for each shipped fix (no version bump without user confirmation) | TODO |

---

## Findings Index

Add one row per finding; details live in the phase findings file. **Locations are pinned to baseline commit `3e46a3b`** and are not renumbered; use the anchor column in 04-triage.md to find the current code (see "How code references stay valid").

| ID | Phase | Severity | Title | Location | Status (open / fixed / wontfix) |
|---|---|---|---|---|---|
| F0-01 | 0 | S1 | Regulator control loop does not converge, answer depends on iteration limit, still reported as success (root cause: F1-01) | backend/simulation/solver.py:196-366 | open |
| F0-02 | 0 | S2 | File format 0.1 diagrams blocked (cloud) or silently purged (drafts); examples and local import bypass the check; no migration | constants.js, Sidebar.jsx:939, ProjectManagerModal.jsx:214, useAutoSaveSession.js:366 | open |
| F0-03 | 0 | S3 | Version drift: AGENTS.md 0.1.6/0.1 vs code 0.2.0/0.2; backend version hardcoded | AGENTS.md, constants.js, main.py:89 | open |
| F0-04 | 0 | S3 | Stray `walflow-diagram (8).wlf` in examples, not registered | frontend/src/data/examples/ | open |
| F0-05 | 0 | S2 | Earlier QA and some physics tests are self-referential (formula checked against itself) | qa_report (deleted), backend/tests | open |
| F0-06 | 0 | S3 | `warm_start_status` reports "Exact Hit" after a cache clear (last internal solve, not the request) | solver.py:1076 | to confirm |
| F0-07 | 0 | S3 | Hygiene: Pydantic v2 deprecations, 1.5 MB bundle, Node < 22.12, stale `qa_report/` | various | open |
| F1-01 | 1A | S1 | Pressure-control outer loop unstable (fixed gain); results depend on damping, iteration limit, history | solver.py:226-357 | open |
| F1-02 | 1A | S1 | At iteration limit, telemetry is not a hydraulic solution (negative abs. pressure, uphill flow) | solver.py:359-361 | open |
| F1-03 | 1A | S1 | "Forced Open" PSV/rupture disc offered in UI, solved as closed | pressure_safety_valve.py:24, rupture_disc.py:27, solver.py:1118 | open |
| F1-04 | 1A | S1 | Pop-action PSV latches open at any pressure, blowdown unused; relieved-pressure KPI non-physical | pressure_safety_valve.py:60-67 | open |
| F1-05 | 1A | S2 | TCV path ΔP in residual ignores viscosity (up to 3× too low); telemetry inconsistent | solver.py:724 | open |
| F1-06 | 1A | S2 | Absolute 10 Pa tolerance → phantom flows (150 L/min DN200 between equal tanks); user tolerance ignored < 1e-5 | solver.py:750 | open |
| F1-07 | 1A | S2 | Negative absolute pressures (−23 bar(a)) reported as converged; no global P < P_vap check | solver.py:732-740 | open |
| F1-08 | 1A | S2 | "Peak pressure" KPI is an ad-hoc pseudo-transient interpolation, mixes abs/diff pressure | solver.py:1185-1245 | open |
| F1-09 | 1A | S2 | Relief set pressure: absolute vs differential inconsistent; bar(a) instead of industry barg | pressure_safety_valve.py:62,137; SetupPanel.jsx:1053 | open |
| F1-10 | 1A | S2 | Islands without pressure reference silently dropped, reported as success | solver.py:53-119 | open |
| F1-11 | 1A | S3 | LM solver option fails on 3/10 examples; fallback not checked for physicality | solver.py:752-760 | open |
| F1-12 | 1A | S3 | Analytical Jacobian inaccurate for TCV, valves, PSV (robustness only) | solver.py:433-592 | open |
| F1-13 | 1A | S3 | Telemetry/temperature transport assume port 0 (latent multi-port bug) | solver.py:991,993,1026,1030 | open |
| F1-14 | 1A | S2 | Global warm-start cache shared across users, unsynchronised across threads, history-dependent | solver.py:28,410,780 | open |
| F1-15 | 1A | S3 | Success reported when property iteration hits the limit | solver.py:356-366 | open |
| F1-16 | 1D | S2 | Throttling heat erased in control valve, regulator, RCV, check valves, PSV, rupture disc | base_node.py:40-75 + 7 equipment files | open |
| F1-17 | 1D | S2 | No elevation except tanks; no fittings ΣK / entrance losses | pipe.py, graph_parser.py | open |
| F1-18 | 1D | S2 | Centrifugal pump: pressure (not head) curve, η fixed 0.75, stopped pump frictionless | centrifugal_pump.py, graph_parser.py:211 | open |
| F1-19 | 1D | S2 | Filter ΔP_clean water-referenced: 125–159 % of entered value in oil at design temp | filter.py | open |
| F1-20 | 1D | S3 | Inconsistent unit conventions in node data (Pa vs bar, K vs °C, field names) | graph_parser.py | open |
| F1-21 | 1D | S3 | Transition zone linear blend: +11–14 % flow vs Colebrook/Churchill | pipe.py | open |
| F1-22 | 1D | S3 | Case variables speed_rpm / flow_demand have no backend effect | case_constants.js | open |
| F1-23 | 1D | S3 | Hidden per-tank fluid_type honoured by backend, not editable | graph_parser.py:193 | open |
| F1-24 | 1D | S3 | Flow source silently saturates at 200 bar | flow_source.py | open |
| F1-25 | 1B | S2 | Classic orifice Cd too low at low Re; ΔP over-predicted up to ~27× | fluid_utils.py:262 | open |
| F1-26 | 1B | S2 | Mineral-oil viscosity too low when cold (−17…−28 %); VG32 coefficients inconsistent | fluid_utils.py:66-213 | open |
| F1-27 | 1B | S2 | Gasoline vapor pressure = n-heptane, 4–8× too low; light crude "negligible" | fluid_utils.py:327 | open |
| F1-28 | 1B | S2 | Cavitation flag is a boiling check (P<1.2·Pv), no NPSH; valves not checked | centrifugal_pump.py:54, volumetric_pump.py:115 | open |
| F1-29 | 1B | S3 | Seawater/glycol ν and cp errors away from 20 °C (PG50 −35 % cold) | fluid_utils.py:32-63 | open |
| F1-30 | 1B | S3 | Water density linear (+2.7 % at 100 °C); Antoine step at 100 °C | fluid_utils.py:27, 316 | open |
| F1-31 | 1B | S3 | No validity ranges; silent fallback for unknown fluid; properties not shown in UI | fluid_utils.py | open |
| F1-32 | 1B | S3 | Valve Fr simplified vs IEC 60534-2-1 (0.7–1.7× ΔP in viscous flow) | fluid_utils.py:275 | open |
| F1-33 | 1C | S3 | Tank: all ports at bottom pressure; no nozzle height | tank.py:39 | open |
| F1-34 | 1C | S3 | Centrifugal curve symmetric for reverse flow (running pump) | centrifugal_pump.py:31 | open |
| F1-35 | 1C | S2 | Volumetric pump passes unlimited flow when pushed (19× rated) | volumetric_pump.py:46 | open |
| F1-36 | 1C | S2 | Volumetric pump power limit silently cuts flow; KPI power = nameplate even when off | volumetric_pump.py:48, routers/simulation.py:54 | open |
| F1-37 | 1C | S2 | Regulator cannot lock up; zero demand → downstream = inlet pressure | linear_regulator.py:25, remote_control_valve.py:30 | open |
| F1-38 | 1C | S2 | PSV / rupture disc capacity % referenced to 1 bar → always "overcapacity" | pressure_safety_valve.py:165, rupture_disc.py:133 | open |
| F1-39 | 1C | S3 | ISO 5167 orifice β silently clamped to 0.1–0.75 (ΔP 2.4–9× at β 0.88–0.96) | orifice.py:186 | open |
| F1-40 | 1C | S3 | Heat exchanger accepts infeasible rated duty silently | heat_exchanger.py:101 | open |
| F1-41 | 1C | S2 | Six physics test files have no assertions | backend/tests | open |
| F2-01 | 2 | S1 | Imperial: pipe diameter/roughness from inspector divided by 39.37 twice | SetupPanel.jsx:575,730; UnitContext.jsx:300 | open |
| F2-02 | 2 | S1 | Cancel on cloud-diagram load leaves old canvas labelled as new diagram (overwrite risk; to confirm 3.7) | Sidebar.jsx:934-976; App.jsx:828 | open |
| F2-03 | 2 | S1 | Undo history survives loading another diagram; Ctrl+Z restores the previous diagram; coverage gaps | useCanvasHistory.js; App.jsx:770 | open |
| F2-04 | 2 | S2 | Heat exchanger rated dP shown 0.5 bar, solved ~0 (new nodes and all 5 example HXs) | App.jsx:1098; graph_parser.py:292 | open |
| F2-05 | 2 | S2 | Blur rewrites values with display rounding; spurious case overrides | SetupPanel.jsx:970 and others | open |
| F2-06 | 2 | S2 | Valve opening edits (slider/inspector) write base case, ignore active case | useWebSocketSimulation.js:188; SetupPanel.jsx:1039 | open |
| F2-07 | 2 | S2 | Results of another case / pre-edit shown as current; no stale marking | case_resolver.js:141,167 | open |
| F2-08 | 2 | S2 | Inputs reformat per keystroke (free ID, ambient temp, imperial length); to confirm 3.x | SetupPanel.jsx:373; Sidebar.jsx:1293; DataList.jsx:1083 | open |
| F2-09 | 2 | S2 | Relief matrix re-solves with previous forced state (stale closure) | DataList.jsx:255 | open |
| F2-10 | 2 | S2 | No error boundary, no import validation: bad file blanks app | App.jsx:770 | open |
| F2-11 | 2 | S2 | Every autosave broadcasts diagram_updated: reload prompt spam for co-viewers | diagrams.py:184; useAutoSaveSession.js:185 | open |
| F2-12 | 2 | S2 | Login rate limit bypass via spoofed X-Forwarded-For | limiter.py:7 | open |
| F2-13 | 2 | S2 | Compose: WS auth off, no secret key, backend port exposed; /batch unauthenticated; nginx 1 MB limit | docker-compose.yml, nginx.conf, routers/simulation.py:145 | open |
| F2-14 | 2 | S2 | Last admin can demote self (setup reopens); rejected users keep access; pipe_manager unassignable | admin.py:89; auth.py:134 | open |
| F2-15 | 2 | S3 | NaN in telemetry -> invalid JSON -> reply silently dropped | main.py:206; useWebSocketSimulation.js:151 | open |
| F2-16 | 2 | S3 | Zero displayed as default (||); legit 0/negative values rejected | SetupPanel.jsx | open |
| F2-17 | 2 | S3 | Cleared solver setting -> null -> validation alert per keystroke | Sidebar.jsx:1375-1424 | open |
| F2-18 | 2 | S3 | Shortcuts: Ctrl+C blocks text copy; act behind modals; bypass lock | useKeyboardShortcuts.js | open |
| F2-19 | 2 | S3 | Connection validation gaps (multi-pipe ports, self-loops, open ports, unknown types) | App.jsx:876 | open |
| F2-20 | 2 | S3 | Unit/missing-value presentation inconsistencies (relief matrix bar(a), 0 for missing) | DataList.jsx; converters.js | open |
| F2-21 | 2 | S3 | Peak scaling cache _scalingInfo stale after re-run, saved into files | case_resolver.js:41-115 | open |
| F2-22 | 2 | S3 | Results = 91 % of saved data; sent/saved on every change; silent localStorage quota failure | App.jsx:1277; useAutoSaveSession.js:81 | open |
| F2-23 | 2 | S3 | Catalog errors: SS01/DX01 DN15/20 10S wall, DN400 Sch20/30, DIN fallback rows | pipe_class_defaults.py; standards_library.js:26 | open |
| F2-24 | 2 | S3 | Duplicated sources of truth; global_roughness ignored; /fluids unused | graph_parser.py:128; fluid_library.js | open |
| F2-25 | 2 | S3 | Lock/collab authz and lifecycle gaps (standalone checkout, join_diagram, no release on disconnect) | diagrams.py:249; main.py:136; lock_service.py | open |
| F2-26 | 2 | S3 | Code health: monoliths, duplicated logic, side effects in updaters, dead code | App.jsx, SetupPanel.jsx, Sidebar.jsx | open |
| F2-27 | 2 | S3 | Accessibility basics missing (labels, dialog roles, focus) | frontend/src | open |
| F2-28 | 2 | S3 | reactflow 11 on React 19; full re-render per drag frame | package.json; App.jsx:1438-1481 | open |
| F3-01 | 3 | S1 | Pipe Network List: name column has no header, every value under the wrong label | DataList.jsx:847-856 | open |
| F3-02 | 3 | S1 | New pipes displayed as DN15/first class but simulated at DN50 (52.5 mm) | App.jsx:907; DataList.jsx:869-873 | open |
| F3-03 | 3 | S2 | Simulation needs login by default; anonymous user invited to run, gets native alert | main.py:101; GreetingCanvas.wlf | open |
| F3-04 | 3 | S2 | "Converged" for degenerate network (open port, 0 eq.); no topology validation; status only in Stats | Sidebar Stats; solver | open |
| F3-05 | 3 | S2 | No plausibility warnings (pump run-out, velocity, class rating/temp, fluid range) | DataList.jsx:968; PumpDetails.jsx | open |
| F3-06 | 3 | S2 | 86 native alert/confirm/prompt dialogs; cases created unnamed | App.jsx, ProjectManagerModal.jsx, PipeClassesPage.jsx | open |
| F3-07 | 3 | S2 | Help hidden, outdated, raw LaTeX; no model/limits documentation | HelpInfoModal.jsx:310-380; README.md | open |
| F3-08 | 3 | S2 | Fixed 350 px data panel, overlaying inspector, no fit-view on load/new drawing | DataList.jsx:389; App.jsx | open |
| F3-09 | 3 | S2 | Contrast below WCAG AA (CTA 2.49:1, orange 2.49:1, red 3.76:1); colour-only warnings | index.css palette | open |
| F3-10 | 3 | S2 | Pre-run placeholders look like results (0.00 bar(a), red -0.00 bar(d)) | nodes/*.jsx; DataList.jsx | open |
| F3-11 | 3 | S3 | Units/notation: tanks not converted in imperial, Pa field, bar(d), negative red drops, gauge/abs ambiguity | TankNode.jsx; Sidebar.jsx | open |
| F3-12 | 3 | S3 | Settings layout: Global holds only units; fluid/solver under Drawing | Sidebar.jsx:1696 | open |
| F3-13 | 3 | S3 | Defaults/labels: tank 40 C, auto tags, edge id in inspector title | App.jsx:1076-1104 | open |
| F3-14 | 3 | S3 | Pump chart raw-float ticks, clipped labels, "Load Factor — %" | PumpDetails.jsx | open |
| F3-15 | 3 | S3 | Examples: greeting not reopenable, Multi-PSV no note, 7-8 m/s, stray walflow-diagram (8).wlf | frontend/src/data/examples | open |
| F3-16 | 3 | S3 | Pump Off still passes 0.3 L/min at equal heads | centrifugal pump model | open |
| F3-17 | 3 | S3 | Pipe class concept unexplained; rating/temp/CA unused; schedule dropdown limited | PipeClassesPage.jsx; DataList.jsx | open |
| F3-18 | 3 | S3 | Discoverability: no empty-canvas hint, no context menus | App.jsx | open |
| F3-19 | 3 | S3 | Version labels: UI v0.2.0/format 0.2 vs AGENTS.md 0.1.6/0.1 | Sidebar.jsx; AGENTS.md; GreetingCanvas.wlf | open |

---

## Session Log

| Date | Conversation focus | Items completed | Next up |
|---|---|---|---|
| 2026-10-13 | Plan created from repo survey | Plan only | Phase 0 (0.1 to 0.6) |
| 2026-10-13 | Phase 0 baseline | 0.1 to 0.6; 7 findings (F0-01 to F0-07) | Phase 1A, start with 1.3 / 1.27 (F0-01), then 1.1, 1.2 |
| 2026-10-13 | Phase 1A solver core | 1.1 to 1.10 done, 1.11 partial; 15 findings (F1-01 to F1-15) | Phase 1D: 1.40 units, 1.41 gauge/abs, 1.44 independent benchmarks; then 1B fluids |
| 2026-10-13 | Phase 1D cross-cutting | 1.40–1.45 done, 1.46 partial; 9 findings (F1-16 to F1-24); benchmarks OK | Phase 1B fluid properties (1.12–1.16), then 1C equipment |
| 2026-10-13 | Phase 1B fluid properties | 1.12–1.16 done vs IAPWS/CoolProp, ISO 3448/ASTM D341, IEC 60534; 8 findings (F1-25 to F1-32) | Phase 1C equipment (1.20–1.34), start with partials 1.20 / 1.23 / 1.30 |
| 2026-10-13 | Phase 1C equipment | 1.20–1.34, 1.11, 1.46 done; 9 findings (F1-33 to F1-41); Phase 1 complete | Phase 2 frontend (2.1 field/unit contract first) |
| 2026-10-13 | Phase 2 frontend + API (all of 2A–2D) | 2.1–2.33 done; 28 findings (F2-01 to F2-28); contract and parity matrices in 02-frontend.md | Phase 3 UX walkthroughs (run app; also confirm F2-02, F2-08 in browser) |
| 2026-10-13 | Phase 3 UX (live in Chrome, WS auth off) | 3.1–3.30 done (3.7 cloud and 3.10 admin from code only); 19 findings (F3-01 to F3-19); F2-01, F2-07, F2-08 confirmed live; F2-02 still unconfirmed; top-10 list in 03-ux.md | Phase 4 triage and fix roadmap (needs user priorities) |
| 2026-10-13 | Phase 4.1/4.2 triage | 04-triage.md: 89 unique findings with effort and anchors, 10 batches (B0–B6), reference-stability policy | 4.3: commit audit baseline (on request), decisions for B0, then B0 prompt |
| 2026-10-13 | Phase 4.3 start | User decisions: new pipes DN50 STD; relief set pressure barg (examples only, no .wlf migration); anonymous simulation allowed; version 0.2.0. B0 prompt in 04-triage.md | User confirms B0, then implement B0 |

---

## Suggested Order and Effort

1. **Phase 0** (small): establishes what already passes.
2. **Phase 1A, 1D (1.40, 1.41, 1.44)** (highest value): solver and unit consistency problems invalidate everything else.
3. **Phase 1B, 1C**: model by model, roughly one conversation per 4 to 5 equipment files.
4. **Phase 2A** (contract matrix): the most likely place for silent bugs from AI-generated code.
5. **Phase 2B to 2D**, then **Phase 3** (needs the running app), then **Phase 4**.

Suggested conversation split: P0 · P1A · P1B+1D · P1C (x3) · P2A · P2B+2C · P2D · P3 (x2) · P4.
