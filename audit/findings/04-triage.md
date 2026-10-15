# Phase 4: Triage and Fix Roadmap

**Baseline commit:** `8610e46` · **Date:** 2026-10-13
**Scope:** 4.1 (consolidated list) and 4.2 (batches). No code has been changed. Each batch still needs a requirement prompt and user confirmation (4.3, AGENTS.md rule 1).

---

## How code references stay valid while fixing

Every `file:line` in `00`–`03` and in the AUDIT_PLAN Findings Index points to the **baseline commit `8610e46`**. Those files are a historical record and are **not** renumbered as the code moves. Live navigation uses the **anchor** column below.

1. **Anchor = file › symbol (+ search string).** A function, component, class or constant name (for example `solver.py › NetworkSolver._update_telemetry`, or `DataList.jsx › grep "NPS / Size"`) survives inserted or removed lines. Line numbers are only a hint.
2. **Re-resolve at the start of each batch.** Before a batch prompt is written (4.3), grep each anchor in that batch at the current `HEAD`. Write the current lines into the prompt. If an anchor no longer matches (renamed or moved), find it with `git log -S "<snippet>"` or compare with `git show 8610e46:<path>`.
3. **Original context is always recoverable:** `git show 8610e46:<path>` shows the file exactly as audited. `git diff 8610e46 -- <path>` shows what has moved since.
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
| F2-22 | M | C | Results = 91 % of saved data; sent/saved on every change; silent quota failure. **Done in B2** except the per-tab draft key (open, B5) | `App.jsx` graph send effect; `useAutoSaveSession.js`, grep `setItem` | B5 |
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
| **B5** | Refactors and hygiene | F2-22 (rest: per-tab draft key), F2-24, F2-26, F2-28, F1-12, F1-13, F1-20, F0-07, F3-19 | ~8–12 days | F3-19: which version is current (0.1.6 or 0.2.0); F2-22: stop storing results in files; F1-20: unit-consistent field names need a format bump |
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
| F1-18 / F3-16 centrifugal pump (B1a) | Input is **rated head (m)**; older files are **not converted**: pump blocked with "rated head missing"; examples converted. Stopped pump = locked-rotor resistance (rated head at rated flow). Efficiency input, default 75 %, pump only (excl. motor) | B1a |
| F1-36 PD pump overload (B1a) | **Drive-type field**: fixed speed (default, keeps flow, "motor overloaded, would trip") or VFD power limit (flow reduced, "power-limited") | B1a |

---

## 4.3 Batch prompts

### B0: S1 frontend hotfixes (done 2026-10-13, 84ca2cc)

Anchors re-resolved at `HEAD` = `8610e46` (no code changed since the audit).

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
- Vitest is set up (user request, 2026-10-13: `npm test`; jsdom 26 because Node 22.11 cannot load jsdom 27). B0 adds unit tests for the PipeSelector SI pass-through, the default DN50 STD pipe data, and `useCanvasHistory` reset/undo.
- CHANGELOG: one short "Fixed" entry. No version change.

**B0 result (2026-10-13).**
- Done as described. Shared helpers: `utils/pipeDefaults.js` (default pipe, older-pipe display), `components/common/DraftNumberInput.jsx` (draft/commit-on-blur/Esc). History: `useCanvasHistory › requestSnapshot` records after React applies the change; `resetHistory` on load/clear.
- Small additions: the Name column sorts naturally ("Pipe 9" before "Pipe 10"); a free inner diameter that matches no schedule clears the stale DN/schedule/OD/WT; a Manual pipe in a project that disallows custom pipes shows "Manual (not allowed)" instead of pretending to be the first class; paste now records the pasted edges in undo.
- Tests (regression references): `pipeDefaults.test.js`, `useCanvasHistory.test.jsx`, `SetupPanel.test.jsx`, `DataList.test.jsx`.
- Follow-ups (user request, same day): the node's rotate handle now creates an undo step; keyboard/ReactFlow delete, paste/duplicate and rotate respect the read-only lock (`App.jsx › blockIfReadOnly`, `deleteKeyCode` off when read-only).
- **New finding F2-29 (S1)** (see 02-frontend.md), fixed on user approval: `App.jsx › handleLoadDiagramWithCheck` prompts whenever a cloud drawing or project is open; on confirm it saves pending edits to that drawing, releases its lock, and clears drawing and project before loading.

### B1a: physics quick wins and honest tests (done 2026-10-13, 5b3fe27)

Anchors re-resolved at `HEAD` = `84ca2cc` (backend unchanged since the audit, so baseline line numbers still apply).

**Goal.** The physics tests fail when the physics is wrong. Pumps, valves and the iteration limit report physically consistent numbers.

1. **F1-41 (+F0-05), tests first.** Turn the six print-only files (`test_physics_regulator.py`, `…_regulator_scenarios.py`, `…_filters.py`, `…_mixing.py`, `…_reverse_flow.py`, `…_viscosity.py`) into assertions against independent references (Crane TP-410, ISO 5167, fluid tables; the audit's `benchmarks.py` / `props_check.py` values), plus an "at setpoint" check per regulator scenario. Tests that currently encode a B1a bug are marked `xfail` with the finding ID and turned green by its fix.
2. **F1-05.** TCV path ΔP in the solver residual uses the real viscosity (`solver.py › objective`, grep `calculate_path_dp`).
3. **F1-16, throttling heat.** Control valve, regulator, RCV, check valve, check valve + orifice, PSV, rupture disc (and both TCV paths) keep their outlet temperature ΔT = ΔP/(ρ·cp). Components stay adiabatic (no heat loss to ambient), as orifice/filter already are. Magnitude test per restriction type (≈138 mK at 5.79 bar, water).
4. **F1-02, iteration limit.** Reported telemetry is always the last hydraulic solution with the openings that solution used; openings are not updated after the final solve. (Flagging "not converged" in the UI is B1b, F1-07.)
5. **F1-35 / F1-36, volumetric pump.**
   - Displacement spring acts both ways (a pushed pump brakes and passes ≈ its displacement).
   - **D3: new "Drive" field.** `fixed_speed` (default): flow stays ≈ displacement; if shaft power Q·ΔP/η exceeds the motor rating, warning "Motor overloaded (X % of rating), would trip". `vfd_power_limit`: flow is reduced to the power limit (today's behaviour) with warning "Power-limited". Warnings appear in the pump detail panel.
   - KPI pump power from the actual operating point (Q·ΔP/η) for both pump types; inactive pumps count 0. The 200 bar hard cap stays as a numerical guard.
6. **F1-18 (+F3-16) / F1-34, centrifugal pump.**
   - **D1: input is rated head (m)**, not rated pressure. Solver: H(Q) = H₀ + C·Q², ΔP = ρ(T)·g·H; "rise to shut-off" applies to head. Inspector shows the equivalent ΔP as information. New pumps default to 50 m.
   - **D1: no conversion of older files.** A pump with only `pressure_rated_bar` shows "Rated head missing" in the inspector, and the simulation refuses to run with a message naming the pump. The shipped examples and the greeting canvas are converted (head = rated pressure ÷ (ρ·g) at each example's fluid and operating temperature, so their results stay the same).
   - **D4: "Pump efficiency (%)" input**, default 75 %, labelled as hydraulic pump efficiency **excluding the motor** (used for pump heat and shaft power). The PD pump's existing efficiency field gets the same wording.
   - **D2: stopped pump = locked-rotor resistance**, ΔP = −ρ·g·H_rated·(Q/Q_rated)·|Q/Q_rated| in both directions, with an inspector note when the pump is Off.
   - Running pump in reverse flow: ΔP rises again (C_rev = −C), so a weaker parallel pump dead-heads instead of passing reverse flow at near shut-off pressure.

**Effect on existing diagrams.** Temperatures downstream of valves rise slightly; PD pumps fed from a pressurised header and stopped centrifugal pumps change most; with D1 = head-based, oil-system pump ΔP shifts ~1–2 % per 30 K away from the rating temperature. Stored results in the examples stay stale until the example re-save at the end of B2. Pumps in users' own 0.2 files need their rated head entered once (D1).

**Out of scope:** convergence/status flags (B1b), relief devices (B1c), fluid properties incl. NPSH (B1d), warning UI beyond the pump detail panel (B4, F3-05).

**Verification:** `pytest backend/tests`, every fix with a test named after its finding against an independent value; solve all 11 shipped diagrams before/after and list the changed KPIs; frontend lint/build/test for the new fields (head, efficiency, drive; consult `ui-ux-pro-max`); one CHANGELOG line.

**B1a result (2026-10-13).**
- Done as described. Regression tests (lasting references): `test_physics_{regulator,regulator_scenarios,filters,mixing,reverse_flow,viscosity}.py` (now asserting against `tests/physics_refs.py`: Darcy–Weisbach/Colebrook, adiabatic throttling, enthalpy balance), `test_f1_16_throttling_heat.py`, `test_f1_05_tcv_viscosity.py`, `test_f1_02_iteration_limit.py`, `test_b1a_pumps.py`, `test_physics_active_inactive.py › test_f3_16_…`; frontend `PumpInspector.test.jsx`.
- Found and fixed on the way: the old filter/viscosity tests never used oil (system fluid stayed water); mixer outlet reported inlet 0's density; `_get_node_p_out` matched edges by `node.id` instead of the network key (wrong check-valve outlet pressure in hand-built networks; the app was unaffected).
- Model details: stopped centrifugal pump = locked-rotor loss with 5 % linear share (keeps zero flow well defined; loss at rated flow = rated head); PD pump `pressure_cap_reached` flag at the 200 bar guard; `ModelInputError` passes input errors (missing head) to the user on explicit runs only (graph updates every 250 ms stay silent).
- Shipped diagrams (21 cases): all solve. Expected changes only: valve outlets 0.05–0.5 K warmer (F1-16); API 682 min pressure −2.22 → 1.09 bar(a) (F1-02); API 614 cold-start peak 9.81 → 7.86 bar(a), the old peak was a TCV-inlet artifact (F1-05); TCV flows ±1 % (F1-05); pump power KPI = shaft power (e.g. 37 → 3.2–8.6 kW). Converted pumps: results unchanged.
- **New finding F1-42 (S3)**, mixing with constant cp; strict-xfail test; proposed for B1d.
- **Notes for B1b:** solver residual tolerance leaves ~5 Pa (≈0.02 L/min at a stopped pump); outer loop at its limit leaves a property lag of up to ~3 % in laminar-oil pipe ΔP (F1-15); `test_f1_02_…` allows 5 % until then.

### B1b: solver robustness and honest status (done 2026-10-14, 36de94b)

Anchors at `HEAD` = `5b3fe27`. Decisions (user, 2026-10-14): D1 bracketed secant, D2 regulators may lock up, D3 results plus flags (hard error only for islands), D4 swap the API 682 PD pump for a centrifugal one.

**Goal.** The solver either returns a consistent answer that meets its own criteria, or says plainly what it could not do. No result depends on click history.

1. **F1-01 (+F0-01), control loop (D1).** Replace the fixed 15 %/bar damped step (`solver.py › solve`, regulator block) with a bracketed secant per controller on the opening (monotone, bounded by 0 and 100 %). Saturation (wide open or closed with the setpoint unreachable) is detected and reported, not iterated. Stats gain `controls_converged` and `saturated_controllers[]` (name, which end, setpoint, achieved pressure). The loop stops on a setpoint error below tolerance, not on the opening step size. `damping_factor` stays accepted in files but has no effect on the result. TCV loop is left as is.
2. **F1-37, lock-up (D2).** Regulator and RCV opening may reach 0 %. With no demand the regulator closes and the downstream side holds at its setpoint (P_out <= P_set, Q >= 0, complementarity as for check valves/PSVs). Setpoint missed because the source is too low = saturated open, flagged.
3. **F1-06, tolerance.** Newton converges on the step size relative to the flow scale as well as the residual; the user tolerance is honoured (no 10 Pa floor). Equal-level tanks join with Q = 0 on DN200 (150 L/min today). Stopped-pump leakage from B1a falls to below 0.001 L/min.
4. **F1-07, physical validity (D3).** After the final solve every port is checked (P < 0 bar(a), P below vapour pressure, oils below 0.1 bar(a)); stats carry `physical_validity` with the affected ports. The LM fallback result goes through the same check. `success` stays true; the UI banner is B4 (F3-04).
5. **F1-10, islands (D3).** A circuit without tank or pressure source gives `success: false` and the message "Circuit with X, Y has no tank or pressure source; its pressure level is undefined." (explicit run only; graph updates stay silent, as in B1a).
6. **F1-15, property loop.** `properties_converged` is reported in stats; at the iteration limit success stays true with `properties_converged: false`. Removes the up-to-3 % property lag where possible by iterating properties to the requested limit.
7. **F1-14 (+F0-06), warm start.** The cache is per solver call or locked and keyed by the network; a result no longer depends on the previous run (first click equals second click). `warm_start_status` reports the first solve of the run.
8. **F1-11, LM.** The LM option and fallback use the same validity and convergence checks; the three examples that LM misses (Multi_PSV, Pump_Comparison, walflow-diagram (8)) solve, or the failure is reported honestly.
9. **API 682 example (D4).** The PD pump becomes a centrifugal pump (head chosen for about the same flow) so the PRV and BPR are both well-posed; stored results stay stale until the B2 re-save.

**Effect on existing diagrams.** API 682 changes most (new pump). Regulator examples (PressureReg, API 614 PRV) settle to the setpoint within the tolerance instead of within 0.013 bar. Examples with regulators and closed consumers show lock-up instead of leakage.

**Out of scope:** relief devices (B1c), fluid properties (B1d), the status chip and banners (B4, F3-04/F3-05), TCV loop rewrite.

**Verification:** `pytest backend/tests` with a test named after each finding against an independent value (equal-level tanks Q = 0; PRV at setpoint; lock-up; negative-pressure flag; island message; first click equals second click); all shipped diagrams solved before/after with the changed KPIs listed; one CHANGELOG line.

**Review suggestion.** F1-01 (secant loop with saturation, interacting PRV + BPR) and F1-06 (convergence criterion) are the delicate parts. I recommend a second look by Opus on those two after implementation; the rest is mechanical.

**B1b result (2026-10-14).**
- Done as described, with one change to item 1 (needs a second look): the control loop is **Newton on v = ln(opening)** with a finite-difference Jacobian over all controllers, a trust region (opening changes by at most ×10 per step), backtracking, and end stops at 0.05 % and 100 %. With one controller it behaves like a secant. A per-controller bracketed secant converged for PRV or BPR alone but not for the API 682 pair in series (PRV and BPR, 100 iterations without settling), so the controllers are solved together. Tolerance 1e-4 bar on the sensed pressure.
- **Lock-up (F1-37):** a PRV whose error is still above the setpoint at its end stop switches to lock-up. Its outlet is pinned at the setpoint and the loop leaves lock-up as soon as the solved flow exceeds 6e-5 L/min (the opening is then computed from the Cv equation). A PRV in a dead end (pruned) reports min(inlet, setpoint). The model's "closed" control valve still leaks (Δp = 1e12·Q), so the audit's C3 now gives downstream = 5.000 bar(a) with the PRV at 0.02 %; true lock-up needs a leak-free consumer. RCV and BPR have no lock-up: they close to the end stop and are reported as `closed`.
- **Convergence (F1-06):** Newton converges when the residual is below the user tolerance (scaled units, no 10 Pa floor) and the next step moves no flow by more than the tolerance (L/s scaled). Flow steps only: floating pressures of stagnant branches showed rounding noise. Equal-level tanks give 0 L/min (was 4.7 / 150), and `tolerance = 1e-9` now takes effect.
- **Jacobian (part of F1-12):** complementarity rows (check valves, closed relief devices) are differentiated numerically from the node's own function. The analytic form described a different branch when the inlet pressure crossed the set pressure mid-iteration, which made `walflow-diagram (8)` converge linearly (25× too small steps). The rest of F1-12 stays in B5.
- **Status (F1-07, F1-10, F1-15):** `stats` gains `controls_converged`, `saturated_controllers[]` (wide_open / closed / lock_up), `properties_converged`, `physical_validity {valid, issues[]}` (negative pressure, below vapour pressure, below 0.1 bar(a) for oils). A circuit without a pressure reference returns `success: false`, `error_kind: no_pressure_reference` and a message naming the nodes; WebSocket and batch runs show it as an error. At the iteration limit the openings are frozen and the fluid properties are iterated to consistency (pipe ΔP within 1 % of its own model).
- **Warm start (F1-14, F0-06):** all cache access under a lock; only the final solution of a solve is stored (not intermediate control iterations); `warm_start_status` is the status of the user's first solve.
- **LM (F1-11):** Newton and LM are each other's fallback with the same convergence and physical checks; all 21 shipped cases solve with either.
- **API 682 example:** PD pump → centrifugal (35 L/min, 130 m); PRV 10.000 bar(a) and BPR 8.000 bar(a) now both hold. The original PD configuration is a test (`test_pd_pump_fixes_the_flow_so_the_prv_cannot_regulate`): PRV reported `wide_open`, BPR holds.
- Shipped diagrams (21 cases): all solve and all converge (before: 6 ended at the iteration limit). API 614 20 °C start: cooler bypass 1.37 → 0.47 L/min (was unconverged); fouled filter and TCV failed-open cases: flows within 0.2 %, temperatures within 0.1 K (regulators now at setpoint instead of within 0.013 bar); walflow-diagram (8): ≤ 0.2 % and 0.1 K (TCV loop, untouched, stops within its 0.1 K tolerance). Run time: 8.9 s total for all cases (7.8 s before); the slowest case 2.7 s.
- Tests (lasting references): `test_f1_01_controls.py`, `test_f1_37_lockup.py`, `test_f1_06_tolerance.py`, `test_f1_07_physical_validity.py`, `test_f1_10_islands.py`, `test_f1_11_solver_methods.py`, `test_f1_14_warm_start.py`, `test_f1_15_properties.py`; `test_f1_02_…` tightened from 5 % to 1 %. The warm-start performance test now allows 8 evaluations (was 5) because the step test costs ~2 more.
- Seen on the way (not fixed): relief-device status flips inside Newton iterations (PSV objective switches branch when the inlet pressure crosses the set pressure; B1c); the TCV loop stops at 0.1 K from its setpoint, so results shift by that much with iteration history (B5 F2-26 refactor or a TCV tolerance decision); pressure of a stagnant branch behind a closed pump or relief device is undefined and differs between solver methods.
- Not in B1b: UI for the new flags (status chip and banners are B4, F3-04/F3-05). Until then a non-converged run, a vacuum suction and a lock-up are visible only in the stats object.

**B1b review (2026-10-14, second pass on the control loop and the convergence criterion).**
- *Backtracking on a moving target (fixed).* The loop halved a Newton step whenever the error grew, but an error also grows while fluid temperatures are still settling. In API 614 the first correct step was undone five times while the error kept rising. It now backtracks only on overshoot (an error changes sign and grows). API 614 base case 18 → 16 iterations, fouled filter 19 → 11.
- *Backtracking state indexed by position (fixed).* The stored step was applied by list position; if a controller saturated between iterations, the step of one controller could be applied to another. It is now keyed by controller and used only when the set of active controllers is unchanged.
- *Lock-up against a higher downstream pressure (fixed).* Two PRVs in parallel (5.2 and 5.0 bar(a)): pinning the lower one at 5.0 bar(a) drew reverse flow, which threw it wide open and cycled (56 iterations). Reverse flow in lock-up now means "downstream held above this setpoint": the PRV is closed (16 iterations, same answer).
- *Lock-up exit below the end stop (fixed).* A tiny demand can need an opening below the 0.05 % search stop, which would bounce between lock-up and regulating. The stop is lowered to that opening, with a cap of three lock-up exits as a guard.
- *Report at the iteration limit (fixed).* The report now classifies against the restored (reported) state, so it never claims a lock-up that the reported pressures do not show; a PRV stopped before lock-up was applied counts as not converged.
- *Wrong-acting controllers (flagged).* A downstream-mode RCV sensing a point upstream of itself runs to an end stop (as a real wrong-acting loop would); the saturation entry now carries `reverse_acting: true`.
- *Convergence criterion (checked, capped).* Over all 343 hydraulic solves of the shipped diagrams the flow-step test costs 0.18 extra Newton iterations on average (max 2), and every solve ends as a clean convergence. A cap of 50 iterations once the residual is within tolerance stops a non-settling step from running to the iteration limit. The numerical Jacobian of complementarity rows now includes the TCV path loss when such an edge feeds a 3-way TCV (it matched the objective otherwise).
- Results of all shipped diagrams unchanged by the review fixes; total solve time 6.7 s (8.9 s before the review, 7.8 s before B1b). New regression tests: parallel PRVs, report consistency at iteration limits 1–8, wrong-acting RCV (217 tests pass).
- Known limits, unchanged: identical controllers in parallel at the same setpoint have no unique split (least-squares picks one); controller sensitivity is measured with properties frozen, so strongly temperature-coupled loops converge linearly over a few extra iterations.

### B1c: relief devices (done 2026-10-14; F1-08 in 7edb53d, the rest not yet committed)

All six findings done: F1-08 first, then F1-03, F1-04, F1-09, F1-38, F2-09 (below).

**F1-08 result (2026-10-14).** Decision (user, 2026-10-14): replace the KPI, not remove it. "Peak system pressure" means the system pressures at the moment a PSV or rupture disc opens; after opening they may fall again.
- *Removed:* the interpolation `P_min + S·(P_max − P_min)` in `solver.py › run_sequential_relief_simulation`, and the matching frontend scaling of the unmitigated telemetry (`case_resolver.js › scaleTelemetryItem`, `getActiveCaseScalingInfo`).
- *Replaced by a solved steady state (quasi-static ramp, no time-stepping).* Each case is analysed from its own final configuration: auto devices open or stay closed as the relieved simulation says, and there is no separate "normal" case. The case's pressure drivers are scaled by a load factor λ from 0 (at rest) to 1 (case values). For each opening group, in the existing order (lowest set pressure first), λ is bisected until the device inlet equals its set or burst pressure: at most 24 solves, tolerance 100 Pa or 1e-4 in λ. Earlier groups stay on auto and later ones are held closed. The peak is the highest system pressure over these opening snapshots and the relieved state.
- *Driver flag (opt-in for future equipment).* `HydraulicNode.is_relief_driver` plus `apply_relief_ramp(lam)` / `reset_relief_ramp()` (`base_node.py`):
  - centrifugal pump: affinity laws, Q ∝ λ and H ∝ λ²; skipped when off;
  - volumetric pump and flow source: flow ∝ λ, stiffness referenced to the nominal flow;
  - pressure source: P_atm + λ·(P − P_atm);
  - tank: not a driver.

  A per-instance, per-case field `relief_ramp_enabled` ("Ramp during relief analysis", default on for all drivers including pressure sources) lets the user hold a receiver at its set value. The solver reads only the flag; documented in DEVELOPMENT.md (classification attributes) and `RELIEF_DRIVER_TYPES` in `case_constants.js`.
- *Isolation.* The ramp runs on `copy.deepcopy(network)` with its own solver (`persist_warm_start = False`), so the relieved results, the pump-power KPIs and the warm-start cache are unchanged.
- *Honest status.* Without an enabled driver the peak is reported "Not available" with the reason. If no device opens, the peak equals the relieved state.
- *Results contract.* `run_sequential_relief_simulation` returns a 5-tuple with a new `telemetry_peak` (None when the peak equals the relieved state or is unavailable). It is sent by the WebSocket and by `/batch` (`BatchCaseResult.telemetry_peak`). `telemetry.relief` carries:
  - `peak {available, reason, pressure_bara, source, device_ids, ramp_pct}`;
  - per device: `status`, `opening_order`, `opening_ramp_pct`, inlet pressure at opening, relieved and unmitigated, and relief flow.
- *UI.*
  - The Peak view in the Scenario & Case Manager shows the solved snapshot (fallback: the relieved state, with a note).
  - The Relief Analysis Matrix shows per-device badges with text (Open/Burst/Overcapacity/Closed/Forced closed + order), load % and inlet pressures; a Peak row with "At opening of X · N % load"; and a new "First relief opening" row.
  - Results from before this change show "Re-run the simulation".
  - File format unchanged (0.1); old stored peak values are ignored until the case is re-run.
- *Shipped diagrams.* Multi_PSV peak 21.18 → **20.00 bar(a)**, which is exactly PSV-101's set pressure, reached at 23.6 % load (relieved 1.77, unmitigated 201.2 bar(a)); about 60 ms extra. walflow-diagram (8): no device opens, so peak = relieved.
- *Tests (lasting references).*
  - `test_f1_08_relief_peak.py` (8 tests). The key analytic check: a dead-headed pump opens its PSV at λ² = (P_set − P_tank)/(P_unmit − P_tank). The others cover a rupture disc on a pressure source (linear λ), staggered PSVs opening in order, no driver, no opening, and the network left untouched.
  - Frontend: `case_resolver.test.js` and the relief cases in `DataList.test.jsx`.
  - Totals: 225 backend tests pass, 1 xfailed; frontend lint, build and Vitest (33) are clean. Not yet checked in the browser.
- *Still open in B1c.*
  - F1-03: the matrix option "Forced Open" still maps to auto in the backend.
  - F1-09: set pressures stay in bar(a) for now, and the opening criterion uses the absolute inlet pressure, consistent with the breach check. The barg switch will move the opening points.
  - The PSV status flips inside Newton noted under B1b.

**B1c remaining prompt (confirmed 2026-10-14).** Anchors at `HEAD` = `0bbf096`. Decisions (user, 2026-10-14): D1 rename the keys to `set_pressure_barg` / `burst_pressure_barg` (older 0.2 files: "Set pressure (barg) missing", no run); D2 a pop valve that would cycle is solved like a modulating valve at about set pressure with status `chatter`; D3 opening reference is inlet gauge pressure (roadmap note for conventional valves under backpressure); D4 rated capacity from Cv only (roadmap note for a certified-capacity input).

1. **F1-03, Forced Open.** `forced_open` accepted (PSV full lift, disc burst regardless of pressure). Pass 1 (unmitigated) holds every device closed; afterwards non-auto devices return to their user state. The F1-08 ramp keeps `forced_open` devices open.
2. **F1-09, barg.** Set and burst pressure in barg/psig. Opening criterion P_in − P_atm ≥ P_set in status, closed-device complementarity, sequential breach check and F1-08 ramp margin. UI, node cards, detail panels and matrix show barg/psig; telemetry also carries the set pressure in bar(a). Shipped examples converted as value − 1.01325.
3. **F1-04, pop action.** No latch. Reseat = set·(1 − blowdown) (gauge). Closed below set; at set, full lift; full-lift inlet ≥ reseat → open; below reseat → `chatter` (D2).
4. **F1-38, capacity.** Rated flow at full lift with ΔP = 1.1·P_set(g) + P_atm − P_out (reduced-bore disc: orifice flow at that ΔP). Overcapacity = flow above rated (inlet above 110 % of set).
5. **Status inside Newton.** Device states are decided between solves and held fixed during a Newton solve.
6. **F2-09.** `fetchBatchSimulations` takes the next cases/nodes; the active-case re-run happens after the state has settled.

**Out of scope:** warning UI (B4, F3-05), example result re-save (B2), gas/two-phase relief sizing.

**B1c remaining result (2026-10-14).**
- *Model.* New shared base `equipment/relief_device.py › ReliefDevice` for PSV and rupture disc. Inside a Newton solve a device is a flow equation Q = lift·√(Δp/c(Q)) with c(Q) = Δp_open(Q)/Q² (Cv / orifice loss as before), no reverse flow, exactly zero flow when closed (the old closed seat leaked through 1e10 Pa·s/m³). Lift is 0, 1 or the modulating lift (linear from set to +10 %). The solver treats every relief row as a complementarity row (numerical Jacobian, B1b).
- *State between solves (item 5).* `solve()` resets every relief device at the start of the run and calls `update_relief_state(p_in)` after each hydraulic solve; the loop does not stop while a state changed. Transitions are monotone (closed → open → cycling; intact → burst), so they end. When a state changes, branches at exactly zero flow restart from the initial flow guess (a dead-headed pump has zero curve slope at Q = 0, which made the first Newton step singular).
- *F1-09.* `set_pressure_barg` / `burst_pressure_barg` in UI, parser, model, telemetry (`set_pressure_barg`, `set_pressure_bara`) and relief matrix; the F1-08 ramp and the sequential breach check use the same absolute set pressure (barg + global atmospheric pressure). A missing key is a `ModelInputError` naming the device; the inspector shows "Set Pressure (barg) missing … had X bar(a)". New devices drop with 20 barg / 25 barg. Examples: Multi_PSV 18.98675 / 23.98675 / 28.98675 barg, walflow-diagram (8) 8.98675 barg.
- *F1-04.* Pop action: closed until set, then full lift; if the full-lift inlet falls below reseat, status `cycling` with the modulating law (inlet between set and +10 %). Inspector shows the reseat pressure; detail panel, node card and matrix show "Cycling" as text with an explanation. Renamed from "chatter" to "cycling" after review (user, 2026-10-14): the steady-state check detects open/close cycling of an oversized valve (API 520 terminology); rapid chatter from inlet loss or backpressure is dynamic and not predicted.
- *F1-38.* Rated flow = full-lift flow with ΔP = 1.1·P_set(g) + P_atm − P_out at the current loss coefficient; `capacity_utilization_pct`, `rated_flow_lmin`, `lift_pct` in telemetry; overcapacity = flow above rated.
- *F1-03.* `forced_open` accepted; pass 1 (unmitigated) still holds all devices closed, then every device returns to the user's state.
- *F2-09.* `fetchBatchSimulations({ cases, nodes })`; the active-case re-run waits in an effect until `effectiveForcedState` (now in `case_resolver.js`) in the props equals the chosen value.
- *Shipped diagrams (18 cases, all solve).* Only Multi_PSV changes: PSV-101 (pop, Cv 12, PD pump 91.5 L/min) cycles with inlet 20.23 bar(a) (was "cracked" at 1.71 bar(a), 115 L/min, below reseat); relieved / peak KPI 1.77 / 20.00 → 20.27 / 20.27 bar(a); capacity 66.5 → 11.6 %. walflow-diagram (8) unchanged (no device opens). Total solve time 10.8 → 10.3 s.
- *Tests (lasting references).* `test_b1c_relief.py` (17): opening at 10 barg = 11.013 bar(a) and with 0.9 bar(a) ambient; capacity 100 % at 10 % overpressure (audit C4) against the US Cv definition Q[gpm] = Cv·√(ΔP[psi]/SG); overcapacity ratio √(30/22); reduced-bore disc ratio; pop full lift above reseat and cycling below; first run = second run; forced open / closed; state constant within each hydraulic solve; old bar(a) key rejected. `test_physics_rupture_disc.py` and `test_physics_psv.py` now assert numbers; F1-08 tests use barg inputs with the same bar(a) references (the oversized pop valve now cyclings, so its peak is the relieved state). Frontend: `ReliefInspector.test.jsx` (4), matrix barg/cycling/missing and F2-09 in `DataList.test.jsx`. Totals: backend 259 passed, 1 xfailed; Vitest 40; lint and build clean.
- *Not checked in the browser:* loading the example would have replaced the canvas open in the user's session.
- *Roadmap (D3, D4):* conventional vs balanced valves under backpressure; certified-capacity input.

### B1d: fluid properties and component correlations (implemented 2026-10-14, not committed)

Anchors at `HEAD` = `b4973cc`, clean tree. Decisions (user, 2026-10-14): D1 tabulated data in code, **no CoolProp dependency**; D2 NPSHr input with **editable margin**, IEC 60534 FL/choked flow goes to the roadmap; D3 fixed representative RVP per catalog fluid; D4 filter reference viscosity field, default = system fluid at 40 °C (oils) / 20 °C (water), heat exchangers unchanged; D5 unknown fluid id is an error, **no extra code for old-file compatibility** (old files need not load); D6 Churchill friction factor in the transition zone is acceptable (+11–14 % flow at Re 2000–4000).

**Goal.** Fluid properties match published data within a stated tolerance. An out-of-range temperature or an unknown fluid is reported, not silently extrapolated or replaced by water. Cold-start and oil results become more conservative.

**Order of work.** F1-42 and F1-30 first (other items use their values), then the rest in the order below.

1. **F1-42, mixing.** `base_node.py › HydraulicNode.calculate_temperature`: enthalpy balance weighted by ṁ·cp(T) (cp linear in T for oils: solve exactly). Turns the strict-xfail `test_f1_42_…` in `test_physics_mixing.py` green (VG46 810 L/min at 80 °C + 1097 L/min at 20 °C → 45.74 °C).
2. **F1-30, water.** `fluid_utils.py › get_density` / `get_vapor_pressure` / `get_specific_heat`: Kell (1975) density, one continuous saturation curve (Wagner–Pruss or IF97, no 100 °C step), temperature-dependent cp. Reference values from IAPWS-95 as a static table in the tests.
3. **F1-26, ISO VG oils.** ν from Walther/ASTM D341 using ν40 (ISO grade) and ν100 per grade (typical VI ≈ 100). Fixes VG32/VG46. Check against the audit table (−10 to −28 % today at 0 to −10 °C).
4. **F1-29, aqueous solutions.** Seawater, EG 30/50 %, PG 50 %: tabulated ν, cp, Pv scale with interpolation (data from Sharqawy 2010 / Melinder 2010, copied once into the code; no runtime dependency).
5. **F1-27, vapour pressure of fuels.** Gasoline from RVP and T (API MPMS 19.2 / Nelson), representative RVP about 60 kPa; light crude finite; diesel/kerosene n-decane-like.
6. **F1-31, validity.** `t_min` / `t_max` per fluid; leaving the range adds an entry to `physical_validity` (as in B1b), the run continues. Unknown `fluid_type` raises `ModelInputError` naming the fluid; the silent water fallbacks in `get_density`, `get_viscosity`, `get_vapor_pressure`, `get_specific_heat` are removed. No compatibility code for old files.
7. **F1-25, orifice Cd.** `get_orifice_cd`: Cd = Cd_t·tanh(0.2·√Re/Cd_t) (Wuest laminar law blended into the turbulent value). Used by calibrated restriction, check valve + orifice, rupture disc (orifice mode) and orifice with `classic_cd`.
8. **F1-19, filter.** `filter.py`: new field "ΔP reference viscosity" (D4); the model returns the entered ΔP at that viscosity.
9. **F1-28, NPSH.** Pumps (centrifugal and volumetric) report NPSHa = (P_in − Pv)/(ρg) always. Optional NPSHr input (m) plus an editable margin; warning when NPSHa < NPSHr + margin. The old "P < 1.2·Pv" flag is replaced. Valves and orifices: flag an outlet below Pv. FL/choked flow: roadmap.
10. **F1-39, ISO 5167 orifice.** Outside the ISO limits (β 0.1–0.75, d ≥ 12.5 mm, D 50–1000 mm, Re_D ≥ 5000) use a thin-orifice loss (Idelchik) and set a `validity` flag; no silent clamping.
11. **F1-40, heat exchanger.** Reject or warn when the rated duty exceeds ṁ·cp·(T_in − T_medium); warn at effectiveness > 0.95.
12. **F1-21, transition zone.** `pipe.py › calculate_delta_p`: Churchill friction factor instead of the linear 2000–4000 blend (derivative kept consistent).
13. **F1-24, flow source.** Re-scoped (see below): `pressure_cap_reached` flag when the source sits at its `max_discharge_pressure`.

**F1-24 re-scoping (answer to "is the 200 bar cap obsolete?").** The two clamps in `flow_source.py › calculate_delta_p` sit on opposite sides. The 200 bar `_HARD_CAP_PA` clamps the **positive** ΔP side (flow above target, outlet below the source reference); a physical solution would need −200 bar absolute there, so it is only a numerical guard during the Newton search and can no longer cause the silent saturation the audit describes. The silent saturation F1-24 is about now happens at `max_discharge_pressure` (573772c), which is user-configurable, but the flow source does not report it (unlike the PD pump's `pressure_cap_reached`). So: keep the guard as a numerical constant (renamed/commented, not a model limit), and add the flag and telemetry for `max_discharge_pressure`.

**Effect on existing diagrams.** Oil systems at low temperature: higher ΔP (viscosity up to ~25 % at 0 °C for VG68–220). Hot water: density −2.7 % at 100 °C. Orifice restrictions in viscous service: ΔP lower or higher depending on Re (up to 3–4× at cold start). Filter ΔP in oil falls to the datasheet value. Seawater/glycol viscosity changes. Mixing temperatures shift by up to ~1 K. Transition-zone flows +11–14 %. Stored results in the examples stay stale until the example re-save at the end of B2; files with unknown fluid ids will not run.

**Out of scope:** warning and property-table UI (B4: F3-05, F1-31 table), F1-32 (documentation), per-tank fluid (F1-23, B6), IEC 60534 FL/choked flow (roadmap), HI 9.6.7 pump viscosity correction, heat-exchanger viscosity reference.

**Verification.**
- `pytest backend/tests`, one test per finding named `test_f1_xx_…` against independent values: IAPWS (density, Pv, cp at 20/80/100/150 °C), Walther (VG15–220 at −10/40/100 °C), CoolProp INCOMP values as static tables (seawater, glycol), EN 228 RVP, Wuest Cd at Re_d 10–3000, filter ΔP at its reference viscosity, mixing enthalpy balance, Churchill f at Re 2000/3000/4000, NPSHa, validity flags, unknown fluid error.
- Solve all shipped diagrams before/after; list the changed KPIs.
- Frontend lint, build and Vitest for the new fields (NPSHr, margin, filter reference viscosity); consult `ui-ux-pro-max` first.
- One CHANGELOG line.

**Review suggestion.** Second look at the fluid data tables (items 3, 4) against the references, and at the Cd blend inside calibrated restrictions (item 7).

**Implementation notes (B1d).**
- Backend suite 366 passed; frontend lint, build and Vitest (40) clean. One test file per finding (`test_f1_19`, `21`, `24`, `25`, `26`, `27_31`, `28`, `29`, `30`, `39`, `40`); F1-42 turned green in `test_physics_mixing.py`.
- *Data are representative, not datasheet values.* ν100 per ISO VG grade (VI ≈ 100), glycol and seawater tables are typical ASHRAE / Melinder / Sharqawy values entered from memory (web search returned no clean by-mass tables); RVP 60 kPa (gasoline) and 40 kPa (light crude). Re-check against a reference before relying on a specific product.
- *F1-31.* Ranges are limited by pour point or data span (`_T_RANGE_C` at the end of `fluid_utils.py`); `temperature_out_of_range` entries in `physical_validity` (no UI yet, B4/F3-05). Unknown fluid ids raise `UnknownFluidError` / `ModelInputError`.
- *F1-28.* `npshr_m` (default 0) and `npsh_margin_m` (default 0.5 m) on both pump types; telemetry `npsha_m`, `npshr_m`, `npsh_margin_m`; valves, regulators, orifices, restrictions: `flashing_warning` (also counted in `has_cavitation_warning`). Pump inspector fields and NPSHa read-out added.
- *F1-39.* Instead of an Idelchik loss the RG correlation is evaluated at the true β (0.01–0.99) and `iso_validity` (list of violated ISO 5167-2 limits) is reported in telemetry; the inspector already warns for β > 0.75.
- *F1-40.* `rating_status` (`ok` / `high_effectiveness` / `infeasible`) and `design_effectiveness` in telemetry, with an inspector notice; the solver still clamps effectiveness.
- *F1-24.* `pressure_cap_reached` and `max_discharge_pressure_bara` in flow source telemetry, inspector notice; `_HARD_CAP_PA` kept as a documented numerical guard.
- *F1-19.* New `ref_viscosity` field (mPa·s, 0 = auto); K is calibrated to the datasheet dP at the reference fluid state. The filter chart scales its curves to pass through the solved operating point.
- *Shipped diagrams, before vs after (KPI changes):* API 614 LOS −1 to +4 % flow (fouled/clogged filter cases +2 to +4 % flow, −0.2 to −0.35 bar max pressure), API 682 seal flush flow 32.9 → 35.4 L/min and max pressure 12.4 → 12.1 bar, other examples ≤ 0.1 % in flow and power. `walflow-diagram (8)` min pressure drops (1.03 → 0.44 bar) only at the stopped, zero-flow pump B, whose pressure is undefined. No example gains or loses a cavitation warning; all still converge.

### B2: contract and data-integrity bugs (implemented 2026-10-14, not committed)

Anchors at `HEAD` = `97cca37`, clean tree. Decisions (user, 2026-10-14): F2-22 is **combined into B2** (results leave the files, hash-tagged per case); heat exchanger examples get **0.5 bar(d)**; a draft in another format is **shown as a message once, then discarded** (no second storage key).

**Result.**
- *F0-02.* `utils/diagramFile.js › checkFormatVersion / checkDiagramFile` is the single gate: `App.jsx › loadData` (import, drop, examples, project, admin hub, draft) and `handleLoadDiagramWithCheck` (before any cloud project is detached); Sidebar and ProjectManagerModal no longer have their own check and set the active drawing only after the loader accepted the file. A draft in another format shows the message once at boot and is removed. Shipped files re-saved as 0.2 / 0.2.0.
- *F2-10.* Structural validation (nodes/edges lists, unique ids, known types, finite positions, edges pointing at existing nodes) with a message listing the first five problems; `ErrorBoundary` in `main.jsx` (reload and restore draft, export draft, discard draft); axios 401 interceptor logs out once with "Your session has expired".
- *F2-22 + F2-07.* Results live only in `case.telemetry*` / `case.kpis` with `case.result_hash` (input hash from `utils/resultHash.js`: nodes, pipes, global settings and that case's overrides; ignores positions, labels, rotation, notes, display units). `node.data.telemetry` is no longer written; `getEffective*Data` have no cross-case fallback. Files, drafts, cloud saves, `update_graph` and `/batch` payloads are built by `serializeDiagram` / `toSolverGraph` without results. A run is tagged with the case and hash it was *sent* with. A loaded diagram is solved automatically when the solver is connected (silent: errors are logged, not alerted). Out-of-date results: canvas banner with Run button, "Out of date" label on matrix columns, dimmed results table. Unmitigated telemetry for the inspector comes from the active case, not from the last run. localStorage quota failure now sets the save status to `error`. Not done from the F2-22 suggestion: one draft key per tab.
- *F2-04.* Drop defaults `HEAT_EXCHANGER_DEFAULTS` (rated dP 0.5 bar); the parser uses 0.5 bar when the key is missing (no `k_factor` fallback); examples carry `rated_dp_bar: 0.5`.
- *F2-06.* The inspector typing path no longer writes the base case (`handleValveChange` is a backend preview only); the value is stored case-aware on blur. The canvas slider was fixed in b4973cc.
- *F2-05.* `validateAndCommit` returns when the field has no draft, so an untouched blur never rewrites a value. Regulator setpoint shows up to 3 decimals (2.25 stays 2.25).
- *F2-15.* `sanitize_result` replaces NaN/Infinity with null in WebSocket and `/batch` replies and lists the fields in `stats.non_finite_fields`; the client shows an unreadable reply as a message. (UI for `non_finite_fields`: B4.)
- *F2-16.* `||` replaced by `??` for the listed fields; `temp_base_c` accepts any temperature above absolute zero, `cracking_pressure_bar` accepts 0.
- *F2-17.* Solver settings use draft-and-commit with ranges (`utils/solverSettings.js`); `update_graph` errors carry `context: update_graph`, are shown in the canvas banner and no longer alert; the backend acknowledges accepted graphs with `graph_accepted`.
- *F2-20.* Converters return "—" for missing values; DataList shows "—" instead of 0 bar / 20 °C and sorts empty rows last; heat duty in imperial is BTU/h (inspector, canvas node). The relief matrix and rupture disc default were already fixed in B1c. Not changed: `GenericDetails` falls back to atmospheric pressure / 20 °C for a port without telemetry.
- *F2-21.* No code mutates `_scalingInfo` any more (removed with F1-08); the key is stripped from loaded cases and from the shipped files.
- *F2-23.* 10S walls DN15/DN20 = 2.11 mm (backend seed), DN400 Sch 20/30 = 7.92/9.53 mm, bundled DIN EN 10253-2 table regenerated from the backend seed (37 rows).
- *F1-22.* `speed_rpm` and `flow_demand` removed from the case variables.

**Effect on shipped diagrams (heat exchanger 0.5 bar instead of ~0).** Chilled Water Loop total flow 746 -> 625 L/min (max pressure 5.87 -> 6.19 bar); API 614 base 837 -> 829 L/min, TCV-failed-open 834 -> 798 L/min; Thermal Management 281.5 -> 279.2 L/min; walflow-diagram (8) max pressure 3.44 -> 3.77 bar (flows unchanged). Stored results were removed from all files (API 614 432 -> 34 kB, walflow-diagram (8) 918 -> 66 kB); other cases of a multi-case example show no results until "run all cases" or a switch + run.

**Tests (lasting references).** Backend `test_f2_15_non_finite.py`, `test_f2_04_heat_exchanger_default.py`, `test_f2_23_catalog.py`, `test_f0_02_shipped_files.py` (385 pass). Frontend `diagramFile.test.js` (also checks every shipped file), `resultHash.test.js`, `solverSettings.test.js`, additions to `SetupPanel.test.jsx`, `case_resolver.test.js`, `converters.test.js` (77 pass); lint and build clean. Not checked in the browser.

**Open for later batches.** Tab-specific draft key (F2-22 remainder, assigned to B5: one localStorage key per browser tab so two tabs no longer overwrite each other's draft); UI for `non_finite_fields` and `physical_validity` (B4); the autosave still fires when results arrive (F2-11, B3); `alert()` replacement (F3-06).

### B3: security and deployment (implemented 2026-10-15, not committed)

Anchors checked at `HEAD` = `af4e168`, clean tree. Decision already taken (user, 2026-10-13): anonymous users may run simulations; collaboration still needs a login; `/batch` stays open with a timeout and size limit.

**Goal.** A default `docker compose up` deployment is safe to expose: the rate limit cannot be spoofed, secrets and ports are set sensibly, a disabled user really loses access, and collaboration events no longer leak or spam.

1. **F2-12, rate-limit key.** `limiter.py › get_client_ip` takes the first `X-Forwarded-For` entry (client-controlled). Change to: use the entry `N` hops from the **right**, `N = WALFLOW_TRUSTED_PROXY_HOPS` (default 1 = the nginx container; 2 behind an extra reverse proxy; 0 = ignore the header). Fewer entries than hops: fall back to the socket peer. Do not publish the backend port in compose (see 2). `nginx.conf` keeps `$proxy_add_x_forwarded_for`.
2. **F2-13, compose and nginx.**
   - `docker-compose.yml`: remove `WALFLOW_REQUIRE_WS_AUTH=false` (obsolete after 6); add `ENVIRONMENT=production` and `WALFLOW_SECRET_KEY=${WALFLOW_SECRET_KEY:?set it in .env}` (fails fast); bind the backend port to `127.0.0.1:5701` (or drop it).
   - `nginx.conf`: `client_max_body_size 5m;` (results are no longer in saved files since B2, so this is generous) with a comment. Add the same to `/ws/` is not needed.
   - Secure cookies follow `WALFLOW_SECRET_KEY` (`routers/auth.py:31-36`): a plain-HTTP LAN install then cannot log in. README: say that HTTPS is expected, otherwise set `WALFLOW_SECURE_COOKIES=false`. Update the README env table and `.env` example.
3. **F2-13, `/batch` and solver limits.**
   - Keep `/batch` open (30/min limit stays). Add a size limit: reject graphs above `WALFLOW_MAX_NODES` (default 500) / `WALFLOW_MAX_CASES` (default 20) with HTTP 413/422 and a clear message.
   - Solver timeout `WALFLOW_SOLVE_TIMEOUT_S` (default 60). A thread cannot be killed, so add a **cooperative deadline** checked between cases/relief stages and in the `NetworkSolver` iteration loop; on expiry return `stats.error_kind = "timeout"` with a message (WebSocket: shown like other model errors; batch: per-case `status="error"`).
   - Global cap on concurrent solves (semaphore, default = CPU count) so anonymous load cannot starve the event loop's thread pool.
   - WebSocket: `--ws-max-size` 2 MiB in `Dockerfile.backend` CMD (the default is 16 MiB).
4. **F2-14, admin and user lifecycle.** `routers/admin.py`, `auth.py › get_current_user`, `routers/auth.py` (`/refresh`):
   - `update_user_role`: refuse to demote the last admin (also self-demotion when last). Accept `pipe_manager`.
   - `reject_user`: refuse for an admin who is the last admin or yourself; works on approved users and means "disabled".
   - `get_current_user` and `/refresh`: require `user.status == "approved"` (403 "Account disabled"); revoke the current token on reject if cheap.
   - Frontend `AdminHub`: role dropdown gets `pipe_manager`; the action on an approved user is labelled **Disable** (same endpoint), with a re-enable (approve).
5. **F2-25, locks and collaboration.**
   - `checkout` and `lock-status`: for standalone diagrams require `diagram.user_id == current_user.id` (403 otherwise). Factor one `assert_diagram_access(db, diagram, user)` helper used by GET, PUT, checkout, checkin, lock-status and `join_diagram`.
   - `join_diagram` over the WebSocket: needs a valid login (cookie/token, user approved) and the same access check; otherwise reply `{"status":"error","context":"join_diagram"}` and do not subscribe. Anonymous simulation is unaffected.
   - Release on disconnect: when a socket that joined a diagram closes and its user holds the lock and has no other socket on that diagram, release it and broadcast `lock_released`. Add a `navigator.sendBeacon` check-in on `pagehide` for tab close.
   - Not changed: a save without a lock still takes the lock for the saver (documented). In-memory locks and token revocation: README states that WalFlow runs as **one worker** (the Dockerfile already does) unless Redis is configured.
6. **F3-03, anonymous simulation.** `main.py › websocket_endpoint`: `WALFLOW_REQUIRE_WS_AUTH` default becomes **false** (`true` forces a login for everything on the socket). `join_diagram` always needs a login (item 5). Frontend: `GreetingCanvas.wlf` note and the "not connected" alert in `useWebSocketSimulation.js:164` drop the "you are logged in" wording; if the server rejects the socket for auth, show "Sign in to simulate" (banner, not `alert`). Update `test_auth_and_diagrams.py` (the "defaults to true" case) and README.
7. **F2-11, autosave and broadcast spam.**
   - Frontend: skip the cloud autosave when the serialized diagram (without timestamp and viewport) equals the last saved one; this also stops the save after each simulation result and selection change (open point from B2).
   - Backend `update_diagram`: broadcast only if `diagram_data` actually changed, at most once per 10 s per diagram (trailing coalesce), and exclude the saver's own socket.
   - Frontend `useAutoSaveSession.js:180-186`: replace `window.confirm` by a non-blocking banner "<name> saved changes. Reload" (dismissable; unsaved local edits are mentioned). Replace the `alert` on forced release by the same banner.

**Tests (lasting references).** Backend: `test_f2_12_client_ip.py` (hops, spoofed header, short header), `test_f2_13_limits.py` (size limit, timeout returns error and frees the slot), `test_f2_14_user_lifecycle.py` (last admin, disabled user token refused, `pipe_manager`), `test_f2_25_collab_authz.py` (standalone checkout by non-owner, anonymous/unauthorised `join_diagram`, release on disconnect), `test_f3_03_anonymous_simulation.py`, and the broadcast coalescing for F2-11. Frontend: autosave no-op on unchanged hash, banner instead of confirm. Then `npm run lint`, `npm run build`, backend suite, and a manual `docker compose config` check.

**Version and docs.** `CHANGELOG.md` entries (brief). No version bump, no format change, no commit unless you ask.

**Open questions (need your answer before I start).**
- **A. Proxy hops (item 1):** is WalFlow deployed behind another reverse proxy (Traefik, NPM, Cloudflare) in front of the nginx container? If yes, default `WALFLOW_TRUSTED_PROXY_HOPS` should be 2 in compose. I assume **1**.
- **B. Plain HTTP (item 2):** is the production install reached over HTTPS? If it is HTTP-only, compose must also set `WALFLOW_SECURE_COOKIES=false`, otherwise nobody can log in after the secret key is set. I assume **HTTPS**.
- **C. Existing deployments:** setting `WALFLOW_SECRET_KEY` as required means the next `compose pull` fails until `.env` has one. Acceptable? I assume **yes** (fail fast, noted in changelog).
- **D. Limits:** 500 nodes, 20 cases, 60 s, 2 MiB WS message, 5 MB body. OK, or other values?
- **E. Save without lock (item 5):** keep (silently takes the lock) or reject saves from users who hold no lock on project diagrams? I assume **keep**.

**Effort.** ~3-4 days; B3 is independent of B4/B5.

**Answers (user, 2026-10-14).**
- A: `WALFLOW_TRUSTED_PROXY_HOPS`, default 1, documented in README and compose.
- B: `WALFLOW_SECURE_COOKIES` passed through compose as `${WALFLOW_SECURE_COOKIES:-true}`; documented.
- C: `WALFLOW_SECRET_KEY` is **required** in compose (`:?` fail-fast); README, compose comment and `.env.example` explain it; changelog notes the one-time logout.
- D: all limits configurable with clearly named variables: `WALFLOW_MAX_NODES`, `WALFLOW_MAX_CASES`, `WALFLOW_SOLVE_TIMEOUT_S`, `UVICORN_WS_MAX_SIZE`, `NGINX_MAX_BODY_SIZE` (nginx template, checked against `Dockerfile.frontend`); defaults as in item 3 and 2.
- E: keep "save takes the lock". Proposed addition (item 8, pending): optimistic version check on `PUT /diagrams/{id}` (client sends loaded `updated_at`; newer server copy returns 409 and shows the reload banner), covering stale-lock and standalone two-tab overwrites; test `test_f2_25_stale_save_rejected`; ~0.5 day.

**Decision (user, 2026-10-15).** E: follow the recommendation, including item 8 (version check on save).

**B3 result.**
- *F2-12.* `limiter.py › get_client_ip` takes the `X-Forwarded-For` entry `WALFLOW_TRUSTED_PROXY_HOPS` from the right (default 1); fewer entries than hops falls back to the socket peer. Backend port bound to 127.0.0.1 in compose.
- *F2-13.* Compose: `ENVIRONMENT=production`, `WALFLOW_SECRET_KEY` required (`:?`), `WALFLOW_SECURE_COOKIES`, `WALFLOW_TRUSTED_PROXY_HOPS`, `WALFLOW_REQUIRE_WS_AUTH` and the limits passed through with defaults; `.env.example` added and `.env` git-ignored. nginx config is a template (`NGINX_MAX_BODY_SIZE`, default 5m); `UVICORN_WS_MAX_SIZE` 2 MiB in `Dockerfile.backend`. New `simulation/limits.py`: `WALFLOW_MAX_NODES` (500), `WALFLOW_MAX_CASES` (20), `WALFLOW_SOLVE_TIMEOUT_S` (60, 0 = off), `WALFLOW_MAX_CONCURRENT_SOLVES` (CPUs). The deadline is checked in the solver's residual function (every Newton/LM iteration), so a run stops within one iteration; it is a ContextVar and follows `asyncio.to_thread`. `/batch` answers 413 above the node/case limits and reports a timeout as a per-case error; the WebSocket reports it like other model errors.
- *F2-14.* `get_current_user` (so also `/refresh`) refuses accounts that are not `approved` (403 "Account disabled"). Last approved admin cannot be demoted, disabled or deleted. `pipe_manager` assignable. Admin Hub: **Disable** / **Enable** buttons and a Pipe Manager role option.
- *F2-25.* `user_can_access_diagram` / `require_diagram_access` used by checkout and lock-status (standalone diagrams are owner-only) and by `join_diagram`, which now needs a login. The lock is released when the last socket of the holder closes (`release_lock_after_disconnect`) and by a `sendBeacon` check-in on `pagehide`. Item 8: `PUT /diagrams/{id}` takes `base_updated_at`; a newer server copy returns 409 with header `X-Walflow-Conflict: stale` and the client shows a banner instead of overwriting.
- *F3-03.* `WALFLOW_REQUIRE_WS_AUTH` defaults to false; `true` closes the socket with 1008 and the client then says that signing in is required. The greeting note never mentioned a login, so it was left as is.
- *F2-11.* The server broadcasts only when title, description or data changed, at most once per `WALFLOW_COLLAB_BROADCAST_INTERVAL_S` (10 s) per diagram with a trailing notice, tagged with the saving tab's client id. The client skips an autosave when the content (without timestamp and viewport) equals the last saved version, and shows a non-blocking `CollabNotice` banner instead of `window.confirm` / `alert`.

**Tests (lasting references).** Backend `test_b3_security.py` (18 tests; also covers F3-03, F2-11), `test_auth_and_diagrams.py` updated for the new WebSocket default (403 pass in total). Frontend `useAutoSaveSession.test.jsx` (5 tests; 82 pass in total); lint and build clean. `docker compose config` and a real nginx start were not run (no Docker here), and nothing was checked in the browser.

**Limits of this batch.** A restored local draft that is linked to a cloud diagram carries no server version, so its first save is not version-checked (the edit lock still applies). Behind a proxy the header can only be trusted if the backend port is not reachable directly, hence the 127.0.0.1 binding. Redis is still optional; locks and revoked tokens are in memory for the single worker.

---

### B4a: UX quick wins and settings levels

**Decisions (user, 2026-10-15).** F3-09: orange fill kept, dark text (`#1C2B2C`, 5.9:1). F3-05 (new plausibility warnings) is **not** in B4; moved to the roadmap. F3-12: three settings levels. Drawing (`.wlf`): title, description, fluid, ambient, atmospheric pressure, solver group with "use drawing solver settings". Project (database, `projects.settings`): pipe specs, custom pipes, solver group with "use project solver settings", owner edits. Global (database, `users.settings`; localStorage for anonymous users): units (display only, no longer in the `.wlf`) and the always-active solver group. Precedence Drawing > Project > Global, whole group per level. New drawings always start from the built-in defaults. F3-15: `walflow-diagram (8).wlf` became `Example_Large_Reference_Network.wlf`. B4 is split into B4a (this) and B4b.

**B4a result (not committed).**
- *F3-12.* `services/settings_schema.py` (validated ranges), `routers/settings.py` (`GET/PUT /api/settings`, `stored` flag so a local preference moves up on first login), `settings` on `PUT /api/projects/{id}` (owner only), light migration for both columns. Frontend: `utils/settingsLevels.js` (precedence, migration), `hooks/useSettingsLevels.js`, `SolverSettingsGroup.jsx` shared by the three tabs (greyed out with "from <level>" when unticked). Solver messages and the result hash use the effective settings. Old files: their solver values become a ticked drawing override; stored unit system ignored. Loading or resetting a drawing now replaces the drawing settings instead of keeping the previous ones.
- *F3-08.* `usePanelHeight` (drag handle, arrow keys, collapse, remembered; default 40 % of the window, 300 to 480 px); fit-view after load, example and new drawing.
- *F3-09.* Tokens `--color-primary-text` (#B45309, 5.0:1) and `--color-danger-text` (#B91C1C, 6.5:1) replace orange and red as text colour; primary button dark text; hover and pressed shades keep at least 4.5:1; velocity shows a marker and tooltip (above 2.5 / 4 m/s), not colour only.
- *F3-10, F3-11.* `utils/nodeReadouts.js`: missing results are "-"; drops and pump rises shown as positive "ΔP"; neutral colour; `bar(d)` replaced by `bar` / `barg`; tanks convert in imperial; atmospheric pressure in bar(a) / psi(a); regulator set label follows the unit system; example labels say `bar(a)`.
- *F3-13, F3-14.* Tank default temperature = ambient; auto tags like "Centrifugal Pump 3"; pipe inspector title uses the name; pump chart with round ticks and axis titles; Motor Load tooltip.
- *F3-15.* Notes say what to check, with measured velocities (up to 7.9 m/s in the regulation example); Multi-PSV note added; welcome canvas and large network listed.
- *F3-18, F2-18.* Context menus (component, pipe, canvas), empty-canvas hint; shortcuts are inactive behind dialogs and leave Ctrl+C to the browser while text is selected (the lock was already checked).

**Tests.** Backend `test_f3_12_settings_levels.py`; frontend `settingsLevels`, `autoTag`, `chartTicks`, `nodeReadouts`, `usePanelHeight`, `useKeyboardShortcuts`, `CanvasContextMenu`, `SolverSettingsGroup`. Lint, build, 121 frontend and 408 backend tests pass. Browser check at 1366x768 (panel, collapse, context menu, settings, markers); 1920x1080 and a login/migration round trip were not run.

**Roadmap (moved out of B4).** F3-05 plausibility warnings (pump run-out, velocity limits, class rating, fluid range).
