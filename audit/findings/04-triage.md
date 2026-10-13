# Phase 4: Triage and Fix Roadmap

**Baseline commit:** `3e46a3b` · **Date:** 2026-10-13
**Scope:** 4.1 (consolidated list) and 4.2 (batches). No code has been changed. Each batch still needs a requirement prompt and user confirmation (4.3, AGENTS.md rule 1).

---

## How code references stay valid while fixing

Every `file:line` in `00`–`03` and in the AUDIT_PLAN Findings Index points to the **baseline commit `3e46a3b`**. Those files are a historical record and are **not** renumbered as the code moves. Live navigation uses the **anchor** column below.

1. **Anchor = file › symbol (+ search string).** A function, component, class or constant name (for example `solver.py › NetworkSolver._update_telemetry`, or `DataList.jsx › grep "NPS / Size"`) survives inserted or removed lines. Line numbers are only a hint.
2. **Re-resolve at the start of each batch.** Before a batch prompt is written (4.3), grep each anchor in that batch at the current `HEAD`. Write the current lines into the prompt. If an anchor no longer matches (renamed or moved), find it with `git log -S "<snippet>"` or compare with `git show 3e46a3b:<path>`.
3. **Original context is always recoverable:** `git show 3e46a3b:<path>` shows the file exactly as audited. `git diff 3e46a3b -- <path>` shows what has moved since.
4. **Closing a finding:** set its Findings Index status to `fixed (<commit>)`. From then on, the regression test (4.4) is the lasting reference, not a line number. Name tests after the finding, for example `test_f1_05_tcv_viscous_path_dp`.
5. **Prerequisite:** `AUDIT_PLAN.md` and `audit/` are untracked right now. They should be committed before the first fix, so that the baseline and the findings are versioned together. Per AGENTS.md this needs an explicit request from the user.

---

## 4.1 Consolidated findings

Effort: **S** < ½ day · **M** 1–2 days · **L** > 2 days (including the regression test). Area: **P** physics/backend model · **C** frontend–backend contract or data integrity · **U** UX · **Sec** security/deployment · **H** hygiene/refactor/docs.
Sorted by severity, then effort. 95 findings, 6 merged into others (see the end of this section), **89 unique**.

### S1: wrong physics or data loss (9)

| ID | Effort | Area | Title | Anchor | Batch |
|---|---|---|---|---|---|
| F3-01 | S | C | Pipe Network List header missing a column; every value under the wrong label | `DataList.jsx` › header row, grep `NPS / Size` | B0 |
| F3-02 | S | C | New pipes shown as DN15/CS01, solved at 52.5 mm | `App.jsx › onConnect` (`diameter: 0.05248`); `DataList.jsx` size fallback | B0 |
| F2-01 | S | C | Imperial: inspector pipe diameter divided by 39.37 twice | `SetupPanel.jsx › validateAndCommit` + `PipeSelector`; `UnitContext.jsx › fromInputValue` | B0 |
| F2-02 | S | C | Cancelling a cloud load leaves the old canvas labelled as the new diagram | `Sidebar.jsx` cloud load handler; `App.jsx › handleLoadDiagramWithCheck` | B0 |
| F1-02 | S | P | Telemetry at iteration limit uses new openings on old flows | `solver.py › NetworkSolver.solve` (end of outer loop) → `_update_telemetry` | B1a |
| F1-03 | S | P | PSV/rupture disc "Forced Open" solved as closed | `pressure_safety_valve.py` / `rupture_disc.py › __init__` (`forced_state`); `solver.py › run_sequential_relief_simulation` | B1c |
| F2-03 | M | C | Undo history survives loading another diagram; coverage gaps | `useCanvasHistory.js`; `App.jsx › loadData` | B0 |
| F1-04 | M | P | Pop-action PSV latches open at any pressure, blowdown unused | `pressure_safety_valve.py › get_effective_cv` (`_was_open`) | B1c |
| F1-01 | L | P | Pressure-control outer loop unstable, success at limit (incl. F0-01) | `solver.py › NetworkSolver.solve` (regulator opening update, "settled" test) | B1b |

### S2: wrong or misleading result in some cases (40)

| ID | Effort | Area | Title | Anchor | Batch |
|---|---|---|---|---|---|
| F1-05 | S | P | TCV path ΔP in residual ignores viscosity (one-line) | `solver.py › _solve_hydraulics_core.objective`, grep `calculate_path_dp` | B1a |
| F1-16 | S | P | Throttling heat erased in 7 valve types | `base_node.py › HydraulicNode.calculate_temperature` + `calculate()` of the 7 classes | B1a |
| F1-35 | S | P | Volumetric pump passes unlimited flow when pushed | `volumetric_pump.py › VolumetricPump.calculate_delta_p` (`max(0, …)`) | B1a |
| F1-36 | S | P | PD pump power limit silently cuts flow; KPI power = nameplate | `volumetric_pump.py › calculate_delta_p`; `routers/simulation.py › calculate_case_kpis` | B1a |
| F1-19 | S | P | Filter clean ΔP water-referenced (125–480 % in oil) | `filter.py › Filter.get_resistance_k` | B1d |
| F1-25 | S | P | Classic orifice Cd too low at low Re (ΔP up to 27×) | `fluid_utils.py › get_orifice_cd` | B1d |
| F1-27 | S | P | Gasoline vapour pressure = n-heptane (4–8× low) | `fluid_utils.py › get_vapor_pressure` | B1d |
| F1-38 | S | P | PSV/disc capacity % referenced to 1 bar → always "overcapacity" | `pressure_safety_valve.py` / `rupture_disc.py › calculate()` (capacity block) | B1c |
| F1-08 | S | P | "Peak pressure" KPI is a pseudo-transient interpolation | `solver.py › run_sequential_relief_simulation`, grep `peak_pressure` | B1c |
| F1-10 | S | P | Islands without pressure reference dropped, reported success | `solver.py › NetworkSolver.prune_topology` | B1b |
| F2-04 | S | C | Heat exchanger rated ΔP shown 0.5 bar, solved ≈ 0 | `App.jsx` drop defaults, grep `heat_duty_kw`; `graph_parser.py › create_node` (`k_factor`) | B2 |
| F2-06 | S | C | Valve opening edits write base case, ignore active case | `useWebSocketSimulation.js › handleValveChange` | B2 |
| F2-08 | S | C | Inputs reformat on each keystroke (ambient temp, free ID, imperial length) | `Sidebar.jsx`, grep `ambient_temperature - 273.15`; `SetupPanel.jsx › PipeSelector` free ID; DataList length input | B0 |
| F2-09 | S | C | Relief matrix re-solves with previous forced state | `DataList.jsx › fetchBatchSimulations` | B1c |
| F2-11 | S | Sec | Every autosave broadcasts `diagram_updated` → reload prompt spam | `routers/diagrams.py › update_diagram`; `useAutoSaveSession.js`, grep `has updated this diagram` | B3 |
| F2-12 | S | Sec | Login rate limit bypass via X-Forwarded-For | `limiter.py › get_client_ip` | B3 |
| F2-13 | S | Sec | Compose: WS auth off, no secret, port exposed; `/batch` open; nginx 1 MB | `docker-compose.yml`, `nginx.conf`, `routers/simulation.py › run_batch_simulation` | B3 |
| F2-14 | S | Sec | Last admin can demote self; rejected users keep access; `pipe_manager` unassignable | `routers/admin.py › update_user_role`, `reject_user`; `auth.py › get_current_user` | B3 |
| F3-03 | S | U | Simulation needs login by default; anonymous users invited to run | `main.py › websocket_endpoint` (`WALFLOW_REQUIRE_WS_AUTH`); `GreetingCanvas.wlf` note | B3 |
| F3-08 | S | U | Fixed 350 px data panel; no fit-view on load / new drawing | `DataList.jsx`, grep `350px`; `App.jsx › loadData` | B4 |
| F3-09 | S | U | Contrast below WCAG AA (CTA 2.49:1) | `index.css` palette tokens | B4 |
| F3-10 | S | U | Pre-run placeholders look like results | `nodes/*.jsx`, `DataList.jsx` value formatting | B4 |
| F1-06 | M | P | 10 Pa absolute tolerance → phantom flows (150 L/min DN200) | `solver.py › _solve_hydraulics_core`, grep `residual_tolerance` | B1b |
| F1-07 | M | P | Negative absolute pressure reported as converged | `solver.py › _solve_hydraulics_core.is_physical` + LM fallback | B1b |
| F1-09 | M | P | Relief set pressure abs vs diff inconsistent; bar(a) vs industry barg | `pressure_safety_valve.py › get_effective_cv`, `calculate_delta_p`; `solver.py › calculate_jacobian` (disc) | B1c |
| F1-14 | M | P | Global warm-start cache shared, unlocked, history-dependent (incl. F0-06) | `solver.py › NetworkSolver._warm_start_cache` | B1b |
| F1-18 | M | P | Pump curve in pressure not head; η fixed 0.75; stopped pump frictionless (incl. F3-16) | `centrifugal_pump.py › calculate_delta_p`; `graph_parser.py › create_node` (centrifugal) | B1a |
| F1-26 | M | P | Mineral-oil viscosity too low when cold; VG32 inconsistent | `fluid_utils.py › FluidProperties` catalog (Vogel a/b) | B1d |
| F1-28 | M | P | Cavitation flag is a boiling check, no NPSH; valves unchecked | `centrifugal_pump.py` / `volumetric_pump.py › calculate()` (`cavitation_warning`) | B1d |
| F1-37 | M | P | Regulator cannot lock up; zero demand → downstream = inlet | `linear_regulator.py` / `remote_control_valve.py › calculate_delta_p` (0.1 % clamp) | B1b |
| F1-41 | M | P | Six physics test files without assertions (incl. F0-05) | `backend/tests/test_physics_{regulator,regulator_scenarios,filters,mixing,reverse_flow,viscosity}.py` | B1a (first) |
| F0-02 | M | C | Format 0.1 blocked/purged/bypassed; no migration | `constants.js › FILE_FORMAT_VERSION`; `Sidebar.jsx`, `ProjectManagerModal.jsx`, `useAutoSaveSession.js`, grep `FILE_FORMAT_VERSION` | B2 |
| F2-05 | M | C | Blur rewrites values with display rounding; spurious overrides | `SetupPanel.jsx`, grep `toFixed(` in input `value=` | B2 |
| F2-07 | M | C | Other-case / pre-edit results shown as current | `case_resolver.js`, grep `node.data.telemetry` | B2 |
| F2-10 | M | C | No error boundary, no import validation | `App.jsx › loadData`; `main.jsx` root | B2 |
| F3-04 | M | U | "Converged" for degenerate network; status only in Stats | `Sidebar.jsx` Stats tab; depends on F1-10, F2-19 | B4 |
| F3-07 | M | U | Help hidden, outdated, raw LaTeX; no model/limits doc | `HelpInfoModal.jsx`, grep `Calculate`; `README.md` | B4 |
| F3-05 | L | U | No plausibility warnings (pump run-out, velocity, class rating, fluid range) | new warnings module; `DataList.jsx`, grep `> 4.0`; `PumpDetails.jsx` | B4 |
| F3-06 | L | U | 86 native alert/confirm/prompt dialogs | grep `window\.(alert|confirm|prompt)\|\balert\(` in `frontend/src` | B4 |
| F1-17 | L | P | No elevation except tanks; no fittings ΣK / entrance losses | `pipe.py › Pipe`; `graph_parser.py › parse_graph` | B6 (scope decision) |

### S3: minor, cosmetic or hygiene (40)

| ID | Effort | Area | Title | Anchor | Batch |
|---|---|---|---|---|---|
| F1-11 | S | P | LM option fails on 3/10 examples; fallback unchecked | `solver.py › _solve_hydraulics_core` (LM branch) | B1b |
| F1-13 | S | P | Telemetry/temperature transport assume port 0 | `solver.py › _update_telemetry`, `_propagate_properties`, grep `outlets\[0\]` | B5 |
| F1-15 | S | P | Success when property iteration hits the limit | `solver.py › NetworkSolver.solve` (`properties_converged`) | B1b |
| F1-21 | S | P | Transition zone linear blend (+11–14 %) | `pipe.py › Pipe.calculate_delta_p` | B1d |
| F1-22 | S | C | Case variables `speed_rpm` / `flow_demand` have no backend effect | `constants/case_constants.js` | B2 |
| F1-23 | S | P | Hidden per-tank `fluid_type` honoured by backend | `graph_parser.py › create_node` (tank) | B6 |
| F1-24 | S | P | Flow source silently saturates at 200 bar | `flow_source.py`, grep `_HARD_CAP_PA` | B1d |
| F1-30 | S | P | Water density linear; Antoine step at 100 °C | `fluid_utils.py › get_density`, `get_vapor_pressure` | B1d |
| F1-32 | S | H | Valve Fr simplified vs IEC 60534 (document) | `fluid_utils.py › get_valve_fr`; help text | B4 (docs) |
| F1-34 | S | P | Centrifugal curve symmetric in reverse flow | `centrifugal_pump.py › calculate_delta_p` | B1a |
| F1-39 | S | P | ISO 5167 β silently clamped to 0.1–0.75 | `orifice.py › Orifice.calculate_delta_p`, grep `0.75` | B1d |
| F1-40 | S | P | Heat exchanger accepts infeasible ratings | `heat_exchanger.py › _calculate_ua_rated` | B1d |
| F2-15 | S | C | NaN in telemetry → invalid JSON, reply dropped | `main.py › websocket_endpoint` (`json.dumps`); `useWebSocketSimulation.js` `JSON.parse` | B2 |
| F2-16 | S | C | `||` defaults hide zero; legit 0/negative rejected | `SetupPanel.jsx`, grep `\|\| 20\b`, `isCritical` | B2 |
| F2-17 | S | C | Cleared solver setting → null → alert per keystroke | `Sidebar.jsx` solver settings inputs, grep `parseFloat`; `main.py` `update_graph` | B2 |
| F2-18 | S | U | Shortcuts: Ctrl+C blocks copy, act behind modals, ignore lock | `useKeyboardShortcuts.js` | B4 |
| F2-20 | S | C | Units/missing values (relief matrix bar(a), 0 for missing) | `converters.js › paToBar`, `m3sToLmin`; `DataList.jsx` relief matrix | B2 |
| F2-21 | S | C | `_scalingInfo` cache stale, saved into files | `case_resolver.js › getActiveCaseScalingInfo`, `updateCaseTelemetry` | B2 |
| F2-23 | S | C | Catalogue data errors (10S walls, DN400 Sch20/30, DIN fallback) | `services/pipe_class_defaults.py`; `standards_library.js` | B2 |
| F3-11 | S | U | Units/notation: tanks not converted, Pa field, bar(d), red negative drops | `nodes/TankNode.jsx`; `Sidebar.jsx` atmospheric pressure input | B4 |
| F3-12 | S | U | Settings: Global holds only units; fluid/solver under Drawing | `Sidebar.jsx`, grep `Global` settings sub-tab | B4 |
| F3-13 | S | U | Defaults/labels: tank 40 °C, auto tags, edge id in inspector title | `App.jsx` drop defaults; pipe inspector title | B4 |
| F3-14 | S | U | Pump chart raw-float ticks, clipped labels, "Load Factor — %" | `details/PumpDetails.jsx` | B4 |
| F3-15 | S | U | Examples: greeting not reopenable, Multi-PSV no note, 7–8 m/s, stray file (incl. F0-04) | `frontend/src/data/examples/`; `App.jsx` example registry | B4 |
| F3-18 | S | U | No empty-canvas hint, no context menus | `App.jsx` ReactFlow wrapper | B4 |
| F3-19 | S | H | Version labels 0.2.0 vs AGENTS.md 0.1.6 (incl. F0-03) | `constants.js › APP_VERSION`; `main.py` version; `Sidebar.jsx`, grep `0.2.1`; AGENTS.md | B5 (decision) |
| F0-07 | S | H | Pydantic v2 deprecations, 1.5 MB bundle, Node < 22.12, stale `qa_report/` | various | B5 |
| F1-12 | M | P | Analytical Jacobian inaccurate for TCV, valves, PSV | `solver.py › calculate_jacobian` | B5 |
| F1-20 | M | H | Mixed units/field names in node data | `graph_parser.py › create_node` | B5 (needs format decision) |
| F1-29 | M | P | Seawater/glycol ν and cp errors away from 20 °C | `fluid_utils.py › FluidProperties` catalog | B1d |
| F1-31 | M | P | No validity ranges; silent fallback for unknown fluid | `fluid_utils.py › get_density` / `get_viscosity` fallback | B1d |
| F1-33 | M | P | Tank: all ports at bottom pressure, no nozzle height | `tank.py › Tank.calculate` | B6 |
| F2-19 | M | C | Connection validation gaps (multi-pipe ports, self-loops, open ports, unknown types) | `App.jsx › onConnect` (no `isValidConnection`); `graph_parser.py › create_node` | B4 (with F3-04) |
| F2-22 | M | C | Results = 91 % of saved data; sent/saved on every change; silent quota failure | `App.jsx` graph send effect; `useAutoSaveSession.js`, grep `setItem` | B5 |
| F2-24 | M | H | Duplicated sources of truth; `global_roughness` ignored; `/fluids` unused | `graph_parser.py › parse_graph` (0.045 mm); `fluid_library.js` | B5 |
| F2-25 | M | Sec | Lock/collab authz and lifecycle gaps | `routers/diagrams.py › checkout_diagram`, `get_diagram_lock_status`; `main.py` `join_diagram`; `lock_service.py` | B3 |
| F2-27 | M | U | Accessibility basics (labels, dialog roles, focus) | `frontend/src`, grep `<label` without `htmlFor` | B4 |
| F3-17 | M | U | Pipe class concept unexplained; rating/temp/CA unused; schedule list limited | `PipeClassesPage.jsx`; `DataList.jsx` schedule dropdown | B4 |
| F2-26 | L | H | Monoliths, duplicated logic, side effects in updaters, dead code | `App.jsx`, `SetupPanel.jsx`, `Sidebar.jsx`, `DataList.jsx`, `PipeClassesPage.jsx` | B5 |
| F2-28 | L | H | reactflow 11 on React 19; full re-render per drag frame | `package.json`; `App.jsx`, grep `interactiveNodes` | B5 |

### Merged (tracked under the canonical ID)

| Merged | Into | Reason |
|---|---|---|
| F0-01 | F1-01 | Symptom; F1-01 is the root cause |
| F0-03 | F3-19 | Same version drift |
| F0-04 | F3-15 | Same stray example file |
| F0-05 | F1-41 | Self-referential tests, fixed by the same test rewrite |
| F0-06 | F1-14 | Warm-start status, same cache |
| F3-16 | F1-18 | "Pump off" leakage comes from the stopped-pump model |

Totals: S1 9 · S2 40 · S3 40. By effort: S 55 · M 28 · L 6.

---

## 4.2 Fix batches

Order follows the plan (physics S1/S2 first, then contract bugs, then UX quick wins, then refactors), with one change: **B0** goes first. B0 holds the S1 frontend defects that take under ½ day each. They currently make the main results table and pipe sizes wrong for every user. Fixing them first costs little and does not get in the way of the physics work.

Each batch becomes one requirement prompt (4.3). Every physics fix gets a regression test against an independent reference value (4.4). Effort totals are rough and include tests.

| Batch | Theme | Findings | Effort | Decisions needed from you first |
|---|---|---|---|---|
| **B0** | S1 frontend hotfixes | F3-01, F3-02, F2-01, F2-08, F2-02, F2-03 | ~3 days | F3-02: give new pipes a default catalogue size (e.g. DN50 STD of the first class), or show "Custom ID" |
| **B1a** | Physics quick wins + honest tests | F1-41 (tests first), F1-05, F1-16, F1-35, F1-36, F1-02, F1-18, F1-34 | ~4–5 days | F1-18: head-based curve changes results for non-water fluids in existing files (acceptable?) |
| **B1b** | Solver robustness and honest status | F1-01, F1-37, F1-06, F1-07, F1-10, F1-14, F1-15, F1-11 | ~6–8 days | F1-01: setpoint-in-Newton (bigger, robust) vs bracketed secant per controller (smaller); fix the over-constrained API 682 example |
| **B1c** | Relief devices | F1-03, F1-04, F1-09, F1-38, F1-08, F2-09 | ~4–5 days | F1-09: switch set pressure to **barg** (industry practice) with file migration, or keep bar(a) and fix consistency only; F1-08: remove peak-pressure KPI or replace it |
| **B1d** | Fluid properties and component correlations | F1-25, F1-19, F1-27, F1-26, F1-28, F1-29, F1-30, F1-31, F1-39, F1-40, F1-21, F1-24 | ~6–8 days | F1-29/F1-30: tabulated data in code vs adding CoolProp as a dependency; F1-28: add NPSHr input (UI change) |
| **B2** | Contract and data-integrity bugs | F2-04, F2-06, F2-07, F2-05, F2-10, F0-02, F2-15, F2-16, F2-17, F2-20, F2-21, F2-23, F1-22 | ~6–8 days | F0-02: was the 0.1 → 0.2 format bump real? (migrate vs revert); F2-07: results keyed by input hash, or simply cleared on edit |
| **B3** | Security and deployment | F2-12, F2-13, F2-14, F2-25, F2-11, F3-03 | ~3–4 days | F3-03: allow anonymous simulation, or show "Sign in to simulate" |
| **B4** | UX (consult `ui-ux-pro-max` first) | Quick: F3-08, F3-09, F3-10, F3-11, F3-12, F3-13, F3-14, F3-15, F3-18, F2-18. Larger: F3-04 + F2-19, F3-05, F3-06, F3-07 (+F1-32 doc), F3-17, F2-27 | ~10–14 days | F3-09: darker orange or dark text on the CTA (brand); F3-05: warning thresholds (velocity limits, % of rated flow) |
| **B5** | Refactors and hygiene | F2-22, F2-24, F2-26, F2-28, F1-12, F1-13, F1-20, F0-07, F3-19 | ~8–12 days | F3-19: which version is current (0.1.6 or 0.2.0); F2-22: stop storing results in files; F1-20: unit-consistent field names need a format bump |
| **B6** | Model scope extensions | F1-17, F1-33, F1-23 | ~5+ days | Whether to add pipe elevation, fittings ΣK and nozzle heights at all, or only document the limits (steady-state remains) |

**Dependencies to respect:**
- F1-41 starts B1a, so that the existing physics tests actually guard every later physics fix.
- F3-04 (status display) builds on the stats flags added in B1b (F1-01, F1-07, F1-10, F1-15). Do B1b before the status chip in B4.
- F3-05 (warnings UI) shows the flags from F1-28 (NPSH), F1-31 (validity range) and F1-36 (motor overload). Do B1d before F3-05.
- F2-07 (stale results) and F2-22 (results in files) touch the same data path; decide F2-22 before implementing F2-07.
- F2-09 is only meaningful after F1-03 (forced open works), so it sits in B1c.
- Example files will need re-saving after F2-04, F0-02, F3-15 and possibly F1-09; do that once, at the end of B2.

**Suggested sequence:** B0 → B1a → B1b → B1c → B2 → B1d → B3 → B4 → B5 → B6. B3 can move earlier if the app is already deployed for other users.

---

## User decisions (2026-10-13)

| Topic | Decision | Consequence for the batches |
|---|---|---|
| F3-02 new pipe size | New pipes get **DN50 STD** | B0 |
| F1-09 relief set pressure | **barg**. Convert only the shipped examples; **no automatic conversion of older .wlf files**. Format 0.2 was bumped for breaking changes like this | B1c: set pressure in barg in UI, backend and examples |
| F0-02 file format | Implied by the above: 0.1 files are intentionally incompatible, with no migration | B2: apply the version check consistently on **every** load path (import, examples, drafts, cloud) with one clear message instead of silent purge; re-save examples and the greeting canvas as 0.2 |
| F3-03 anonymous simulation | **Anonymous users may run simulations** | B3: WS default allows `simulate`; collaboration messages (`join_diagram`, lock events) still need a login (F2-25); `/batch` stays open but gets a solver timeout and size limit (F2-13) |
| F3-19 / F0-03 version | Current version is **0.2.0** (release outstanding, next release number) | B5: AGENTS.md → app 0.2.0 / format 0.2; remove the hard-coded `0.2.1` in Sidebar; GreetingCanvas `app_version`; backend version read from one place |

---

## 4.3 Batch prompts

### B0: S1 frontend hotfixes (awaiting confirmation)

Anchors re-resolved at `HEAD` = `3e46a3b` (no code changed since the audit).

**Goal.** The results table, pipe sizes and imperial inputs show and store correct values. Loading a diagram can no longer silently mix or overwrite diagrams.

1. **F3-01, table headers.** `DataList.jsx:847-859`: add a sortable **Name** header (`sortKey="label"`) between Type and Flow, so the 13 cells line up with 13 headers.
2. **F3-02, new pipe size.** `App.jsx › onConnect` (`:904-909`): hydraulic pipes get **DN50 STD**:
   - From the first available pipe class if it has DN50 (with `pipe_class_id`, `pipe_class_code`, `standardDn`, `standardSch`, OD, WT, ID from OD−2·WT, and the class roughness).
   - Otherwise manual ASME B36.10M DN50 STD (OD 60.3, WT 3.91, ID 52.48 mm).
   - If custom pipes are not allowed and the class has no DN50, the nearest DN in that class.
   - **Older pipes without `standardDn`/`pipe_class_id`** (old files): `DataList.jsx:866-874` and `SetupPanel.jsx › PipeSelector :79-89` stop falling back to "first class, first size". They show the pipe as Manual with the nearest DN derived from its actual diameter, or "Custom ID xx mm" when no schedule matches. The stored diameter is never changed by just displaying it.
3. **F2-01, imperial diameter.** `SetupPanel.jsx:730`: `PipeSelector` already emits SI values, so its updates bypass `fromInputValue` (commit directly via `onUpdateEdge`). This also fixes roughness.
4. **F2-08, inputs reformatting while typing.** Use draft text while typing; convert, validate and commit on blur/Enter; Esc reverts:
   - Ambient temperature and atmospheric pressure (`Sidebar.jsx:1288-1330`).
   - Free inner diameter (`SetupPanel.jsx:366-381`).
   - DataList pipe length (`DataList.jsx:1080-1092`).
   - Validation: length > 0 and ID > 0; an invalid entry reverts to the previous value. An empty field is not stored as 0.
5. **F2-02, cancelled cloud load.** In `Sidebar.jsx › handleLoadCloudDiagram` (`:934-980`), load first, then switch project and diagram only if the load was accepted (`onLoad` returns true). Loading a cloud diagram does not show the "detach cloud sync" prompt and does not set the project to null.
6. **F2-03, undo after load.** `useCanvasHistory.js` gets a `resetHistory(nodes, edges)`. It is called at the end of `App.jsx › loadData` and in `resetCanvas`, and stores the loaded state as the first snapshot. Further changes:
   - Snapshots are also taken after node drop, connect, and delete (keyboard, ReactFlow Backspace and inspector).
   - Rotate snapshots *after* rotating.
   - Undo/redo do nothing on a read-only (locked) diagram.
   - Property edits and cases/settings are **not** part of undo in B0; they stay with the F2-26 refactor.

**Out of scope:** the other `alert()` calls (F3-06), stale results (F2-07), the version check on load (F0-02), and the 0.1 decimal rounding on blur (F2-05). These belong to later batches.

**Verification:**
- `npm run lint` and `npm run build`.
- Manual browser check: header alignment; new pipe = DN50 STD in metric and imperial; inspector DN pick in imperial gives ID 2.067 in; typing 25.5 °C gives 25.5; undo right after loading an example does nothing; cancelling the load prompt leaves the title unchanged.
- There is no frontend test runner in the repo. Adding Vitest for unit tests (unit round trip, history reset) is optional; say if you want it.
- CHANGELOG: one short "Fixed" entry. No version change.
