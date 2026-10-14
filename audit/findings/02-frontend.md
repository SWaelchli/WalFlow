# Phase 2: Frontend Implementation (and supporting backend API)

**Commit:** `8610e46` · **Date:** 2026-10-13

Method: code reading of `frontend/src` and the backend routers, plus throwaway scripts in the session scratchpad that run the real parser/solver with the inputs the UI produces:
`catalog_check.py` (2.6), `edge_inputs.py` (2.3, 2.1 heat exchanger), `connect_check.py` (2.14). Run with `.venv/Scripts/python <script> <repo root>`.
Browser-only behaviour (typing into inputs, dialogs) is marked **"to confirm in Phase 3"** where it is derived from code, not observed.

---

## 2A. Frontend-to-backend contract

### 2.1 Node-field contract matrix

Units: the backend reads node `data` in mixed units (F1-20). The table lists what the parser reads ([graph_parser.py:185-387](../../backend/simulation/graph_parser.py#L185-L387)), what the frontend writes (drop defaults in [App.jsx:1076-1104](../../frontend/src/App.jsx#L1076-L1104), inspector in [SetupPanel.jsx](../../frontend/src/components/panels/SetupPanel.jsx)), and the result.

| Type | Keys read by backend (unit) | Frontend writes | Status |
|---|---|---|---|
| tank | `level` m, `elevation` m, `temperature` K, `fluid_type` (hidden) | same; temp entered °C/°F → K | OK (hidden `fluid_type`: F1-23) |
| centrifugal_pump / pump | `flow_rated_lmin`, `pressure_rated_bar` (d), `rise_to_shutoff_pct`, `active` | same | OK; `rise_to_shutoff_pct = 0` displays 20 (F2-16) |
| volumetric_pump | `flow_rated` L/min, `motor_power` kW, `efficiency` %, `active` | same | OK |
| linear_control_valve | `max_cv`, `opening` % | same | Key OK; case handling broken (F2-06) |
| linear_regulator / remote_control_valve | `max_cv`, `set_pressure` **Pa**, `backpressure` | same; setpoint entered bar(a)/psi(a) → Pa in the input handler | Key OK; blur rounding (F2-05) |
| orifice | `orifice_diameter` m, `standard`, `pipe_diameter` (overwritten by connected pipe) | same + dead `standardDn/Sch` | OK |
| calibrated_restriction | `flow_base_lmin`, `inlet/outlet_pressure_base_bar` (a), `temp_base_c`, `restriction_model`, `fluid_type` | same | OK; 0 °C rejected (F2-16); 4 fluids only (F2-24) |
| reducer / expander | `diameter_in/out` m, `length` m, `cone_angle_deg`, `reducer_type`, `standard`, `dn_*`, `sch_*`, `roughness` | same + `length_mm`, `nps_*`, `orientation` (display only) | OK |
| heat_exchanger | `rated_cooling_kw`, `rated_flow_lmin`, `design_inlet/outlet_temp_c`, `medium_temp_c`, **`rated_dp_bar` or legacy `k_factor`**, `cooler_type`, `rating_method`, `ua_direct_w_k`, `active` | drop writes only dead `heat_duty_kw: -10`; inspector shows defaults | **Mismatch (F2-04)** |
| filter | `dp_clean`, `dp_terminal` bar(d), `flow_ref` L/min, `clogging` % | same | OK |
| three_way_tcv | `max_cv`, `set_temperature_c`, `hot_port_idx` | same | OK |
| check_valve | `cv`, `cracking_pressure_bar` (d) | same | OK; 0 bar rejected (F2-16) |
| check_valve_orifice | `cv`, `cracking_pressure_bar`, `orifice_diameter` m, `pipe_diameter` (auto) | same | OK |
| pressure_safety_valve / psv | `set_pressure_bar` (a), `cv`, `action_mode`, `blowdown_pct`, `forced_state` | inspector only (no drop defaults; same fallback values 20/10/pop/7/auto) | Keys OK; `forced_open` not implemented (F1-03) |
| rupture_disc | `burst_pressure_bar` (a), `bore_type`, `cv`, `orifice_diameter`, `forced_state` | same | Keys OK; DataList shows default 30 vs backend 25 (F2-20) |
| pressure_source | `source_pressure_bara`, `temperature` K | same | OK |
| flow_source | `source_flow_lmin`, `temperature` K | same | OK |
| splitter / mixer | none (2 ports fixed) | none | OK |
| text_bubble | skipped by parser | — | OK |
| **edge (pipe)** | `length` m, `diameter` m, `roughness_mm` (preferred) or `roughness` m, `friction_factor` (unused by solver), `type: SIGNAL` | `length`, `diameter`, `roughness_mm`+`roughness`, pipe class fields | **Imperial diameter bug (F2-01)**; default diameter differs (FE 0.05248 m, parser fallback 0.1 m), only matters for hand-written files |
| global settings | `fluid_type`, `ambient_temperature` K, `atmospheric_pressure` Pa, `global_roughness`, solver settings | same | `global_roughness` is never used by the parser (F2-24); cleared numeric field → `null` → validation error (F2-17) |

Unknown node types (typo in an imported file) become a generic `HydraulicNode` without ports, and the solve fails with `IndexError` → generic "Graph configuration error" (F2-19).

### 2.2 Unit conversion

Conversion constants in [converters.js](../../frontend/src/utils/converters.js) are correct (US gallon, mechanical hp, psi = 6894.757 Pa, °F/K). Problems are in how they are applied:

- In imperial mode the pipe diameter chosen in the inspector is converted twice (F2-01).
- Display rounding is written back on blur (F2-05), and some inputs reformat while typing (F2-08).
- Many inputs hard-code their own factors (`14.5037738`, `0.264172052`, `39.37007874`) instead of using [UnitContext.jsx](../../frontend/src/context/UnitContext.jsx); `toDisplayValue` is never used (F2-26).
- Missing values format as `0.00` instead of `—` in `paToBar`, `m3sToLmin` etc. (F2-20).

### 2.3 Result mapping

Every telemetry key the frontend reads (`inlets/outlets[].pressure|flow_rate|temperature|density|viscosity`, `opening_pct`, `status`, `cavitation_warning`, `actual_duty_kw`, `sensed_pressure`, `pipe_diameter`, `capacity_utilization_pct`, `standard`, `kpis`) is produced by [extract_telemetry](../../backend/routers/simulation.py#L80-L123) ✔. Pump curve formulas in [PumpDetails.jsx](../../frontend/src/components/details/PumpDetails.jsx) match the backend models ✔ (duplicated, F2-24). Issues: NaN handling (F2-15), wrong-case/stale results (F2-07), missing values shown as 0 (F2-20).

### 2.4 WebSocket hook

Reconnect after 3 s, except after close code 1008 (auth) ✔. Replies cannot arrive out of order (the server handles one socket sequentially) ✔. Issues:
- No request id or "stale" marking (F2-07).
- An `update_graph` parse error raises an `alert()` on every edit (F2-17).
- Non-convergence is shown only in the sidebar diagnostics, and the result is still applied to the canvas (UX, Phase 3).
- The full graph including all results is sent 250 ms after every state change, including selection, drag and incoming results (F2-22).

### 2.5 Operating cases

The frontend resolver ([case_resolver.js](../../frontend/src/utils/case_resolver.js)) and backend resolver ([graph_parser.py:29-73](../../backend/simulation/graph_parser.py#L29-L73)) agree: node overrides are layered on base data, in base units ✔. Global-setting overrides are honoured by the backend, but no UI can create them (`getEffectiveGlobalSettings` is unused). Issues: F2-05 (spurious overrides), F2-06, F2-07, F2-09, F2-21.

### 2.6 Fitting / pipe catalog data

Checked by `catalog_check.py` against ASME B36.10M/B36.19M values:
- `ASME_B36_10M_SCHEDULES` (frontend) is identical to the backend `PIPE_SCHEDULES_DATA`: 20 sizes, 0 deviations, ID = OD − 2·WT everywhere ✔.
- B16.9 reducer lengths H are correct, and cone angles agree with the OD-based formula within 0.15° on all 71 rows ✔.
- Errors are listed in F2-23.

### 2.7 Fluid library

The frontend list and the backend catalog have the same 23 ids and names today ✔. But they are two hand-maintained copies, and the backend `GET /api/simulation/fluids` endpoint exists but is not used (F2-24).

---

## 2B. State, persistence, canvas

- **2.10 Import/export:**
  - No schema validation or error boundary (F2-10).
  - The version check is inconsistent (F0-02).
  - Stale results and the `_scalingInfo` cache are saved into files (F2-21, F2-22).
  - Duplicate node ids are renamed on load, but edges keep pointing at the first node with that id.
- **2.11 Autosave:**
  - Debounced writes: local after 1 s, cloud after 2 s (only with the lock) ✔.
  - Problems: one localStorage key shared by all tabs; a failed write because the quota is full is silent and the status still says "saved" (F2-22); every cloud save triggers reload prompts for co-viewers (F2-11); cancelling a cloud-diagram load (F2-02).
- **2.12 Undo/redo:** F2-03.
- **2.13 Keyboard shortcuts:** F2-18.
- **2.14 Connections:** signal↔hydraulic mixing is blocked ✔, and handle ids match `_parse_port_idx` ✔. Gaps are listed in F2-19.
- **2.15 Rotation / sensing pins:** handles rotate with the node, `updateNodeInternals` is called on rotation ✔, and the backend uses only handle ids, not geometry ✔. Sensing can be toggled only on `inlet-0`/`outlet-0`; ports like a mixer's `inlet-1` cannot be sensed (S3, UX).
- **2.16 Equipment parity:** see the matrix below.

### 2.16 Equipment parity matrix

| Type | `nodeTypes` (App) | Sidebar card | Inspector (SetupPanel) | Results panel | Backend `create_node` |
|---|---|---|---|---|---|
| tank | ✔ | ✔ | ✔ | Generic | ✔ |
| centrifugal_pump (+ legacy `pump`) | ✔ | ✔ | ✔ | PumpDetails | ✔ |
| volumetric_pump | ✔ | ✔ | ✔ | PumpDetails | ✔ |
| orifice | ✔ | ✔ | ✔ | OrificeDetails | ✔ |
| calibrated_restriction | ✔ | ✔ | ✔ | Generic | ✔ |
| reducer (+ `expander`) | ✔ | ✔ | ✔ | Generic | ✔ |
| linear_control_valve | ✔ | ✔ | ✔ | ValveDetails | ✔ |
| linear_regulator | ✔ | ✔ | ✔ | ValveDetails | ✔ |
| remote_control_valve | ✔ | ✔ | ✔ | ValveDetails | ✔ |
| three_way_tcv | ✔ | ✔ | ✔ | JunctionDetails | ✔ |
| check_valve | ✔ | ✔ | ✔ | Generic | ✔ |
| check_valve_orifice | ✔ | ✔ | ✔ | Generic | ✔ |
| pressure_safety_valve (+ `psv`) | ✔ | ✔ | ✔ | PSV details | ✔ |
| rupture_disc | ✔ | ✔ | ✔ | RuptureDisc details | ✔ |
| filter | ✔ | ✔ | ✔ | FilterDetails | ✔ |
| heat_exchanger | ✔ | ✔ | ✔ (defaults mismatch F2-04) | Generic | ✔ |
| splitter / mixer | ✔ | ✔ | (no params) | JunctionDetails | ✔ |
| pressure_source / flow_source | ✔ | ✔ | ✔ | Generic | ✔ |
| text_bubble | ✔ | ✔ | ✔ | — | skipped ✔ |

All 21 hydraulic types are registered everywhere. `HelpInfoModal` does not describe the newer types (pressure/flow source, reducer, calibrated restriction, rupture disc); this is a Phase 3 item (3.24).

## 2C. Code quality

- **2.20:** `npm run lint` is clean. Seven `eslint-disable` lines, all justified, but App.jsx:1310 duplicates `effectiveSelectedNode`. `no-unused-vars` ignores names starting with a capital or underscore, which hides unused constants.
- **2.21–2.22:** F2-21, F2-26, F2-28.
- **2.23:** F2-26.
- **2.24:** F2-10. API errors are handled per call with `alert()` or inline messages. There is no shared axios interceptor, so an expired session (e.g. after laptop sleep) shows up only as a generic "error" save status.
- **2.25:**
  - The token is in an httpOnly, SameSite=Lax cookie ✔, refreshed every 20 min ✔.
  - The admin router is gated server-side ✔.
  - Issues: F2-14.
- **2.26:** F2-27.

## 2D. Backend API and security (light pass)

- **2.30:** Every write endpoint requires auth ✔. Issues:
  - Diagram/project ownership checks are present, with gaps (F2-25).
  - Admin lifecycle (F2-14).
  - Rate-limit bypass (F2-12).
  - `/api/simulation/batch` is unauthenticated (F2-13).
  - Read endpoints of the pipe-class / fitting catalogs are public (probably intended).
- **2.31:** WS auth is on by default but disabled in `docker-compose.yml` (F2-13). There is no solver timeout. The message size limit is the uvicorn default (16 MiB). The warm-start cache is shared (F1-14).
- **2.32:** F2-13.
- **2.33:** F2-25.

---

## Findings

#### F2-01  Imperial units: pipe diameter (and roughness) picked in the inspector is stored 39.37× too small
- **Severity: S1**
- Location: [SetupPanel.jsx:730](../../frontend/src/components/panels/SetupPanel.jsx#L730) passes `PipeSelector` updates to `validateAndCommit(updates)`. The object branch runs `fromInputValue(f, v)` on every key ([SetupPanel.jsx:575](../../frontend/src/components/panels/SetupPanel.jsx#L575)). In imperial mode, `fromInputValue('diameter', x)` returns `x / 39.37` ([UnitContext.jsx:300-306](../../frontend/src/context/UnitContext.jsx#L300-L306)).
- But `PipeSelector` already sends metres: class size `(od−2wt)/1000` ([SetupPanel.jsx:109](../../frontend/src/components/panels/SetupPanel.jsx#L109)), schedule preset `id_mm/1000` ([:151](../../frontend/src/components/panels/SetupPanel.jsx#L151)), and the free-ID field converts inches to metres itself ([:377](../../frontend/src/components/panels/SetupPanel.jsx#L377)). `roughness` (also in metres) is divided again too; the parser prefers `roughness_mm`, so that half is harmless.
- Effect: with units set to imperial, any pipe size chosen in the inspector becomes e.g. DN50 → 1.33 mm bore. Turbulent ΔP scales with d⁻⁵, so it is ~10⁸× too high. The DataList size selectors call `updateEdgeData` directly and are not affected, which makes the bug look intermittent. Metric mode is not affected.
- Suggested fix: `PipeSelector` should emit base units and bypass `fromInputValue`, or `validateAndCommit` should accept an "already base units" flag. Add a unit round-trip test.

#### F2-02  Cancelling a cloud-diagram load leaves the old canvas labelled as the new diagram (overwrite risk)
- **Severity: S1** (data loss path; to confirm in Phase 3, 3.7)
- Location: [Sidebar.jsx:934-976](../../frontend/src/components/panels/Sidebar.jsx#L934-L976) sets `activeProject` and `activeDiagram` to the new diagram **before** calling `onLoad`. `onLoad` is `handleLoadDiagramWithCheck` ([App.jsx:828-847](../../frontend/src/App.jsx#L828-L847)), which still sees the old project in its closure and asks "Loading … will detach cloud sync for project X".
- Effect:
  - **Cancel:** the canvas still shows diagram A while the app treats diagram B as active (title, lock, autosave target). If the user then checks B out (or already holds its lock), autosave PUTs A's content into B.
  - **OK:** B loads, but its project is set to `null`, contrary to the message.
- Suggested fix: confirm first, then switch project/diagram and load in one step. Skip the "detach" prompt when loading another cloud diagram.

#### F2-03  Undo history survives loading another diagram; Ctrl+Z puts the previous diagram back
- **Severity: S1** (data loss)
- Location: [useCanvasHistory.js](../../frontend/src/hooks/useCanvasHistory.js). The history stack is a ref that is never cleared: `loadData` ([App.jsx:770-826](../../frontend/src/App.jsx#L770-L826)) and `resetCanvas` do not reset it.
- Effect: after a few drags/deletes in diagram A, loading B (example, file or cloud) and pressing Ctrl+Z restores A's nodes and edges, combined with B's cases and settings. B's loaded state was never snapshotted, so redo cannot bring it back. Autosave then writes the mixture locally, and to the cloud if the lock is held.
- Coverage gaps:
  - No initial snapshot, so the first action after load cannot be undone.
  - Not captured: dropping a node, connecting, property edits, the inspector Delete button, ReactFlow's own Backspace delete.
  - `rotateSelectedNode` snapshots the state *before* rotating ([App.jsx:669-675](../../frontend/src/App.jsx#L669-L675)), so undo skips a step.
  - Undo/redo ignore the read-only lock.
- Suggested fix: reset history on every load/new drawing and push an initial snapshot. Snapshot after every committed change, including cases and settings, or move to a reducer-based store.

#### F2-04  Heat exchanger: rated ΔP shown as 0.5 bar, solved as ≈ 0 bar (new nodes and all shipped examples)
- **Severity: S2**
- Location: drop defaults write only `heat_duty_kw: -10` ([App.jsx:1098](../../frontend/src/App.jsx#L1098)); this key is unused by the backend. Without `rated_dp_bar`, the parser falls back to `k_factor` (default 10, in Pa per (m³/s)²) ([graph_parser.py:292-296](../../backend/simulation/graph_parser.py#L292-L296)). The inspector displays `rated_dp_bar || 0.5` ([SetupPanel.jsx:1365](../../frontend/src/components/panels/SetupPanel.jsx#L1365)).
- Evidence (`edge_inputs.py`): freshly dropped HX → solver `rated_dp = 6.9e-9 bar` at 500 L/min, display 0.5 bar(d). All 5 example heat exchangers (API 614 cooler, both Chilled Water units, Thermal Management cooler, `walflow-diagram (8)`) have no `rated_dp_bar`. They are all solved with essentially zero pressure drop. Clicking into the field and out again commits 0.5 bar and changes the result without the user typing anything.
- Suggested fix: write the full default set on drop (same values as the inspector shows). Migrate `k_factor` files explicitly. Make the inspector display what the solver will use.

#### F2-05  Leaving an input rewrites its value with display rounding (setpoints, small flows) and creates spurious case overrides
- **Severity: S2**
- Location: every input commits on blur, even if unchanged, using the *displayed* string. Rounded displays:
  - Regulator/RCV setpoint `toFixed(1)` bar in **metric** ([SetupPanel.jsx:970-977](../../frontend/src/components/panels/SetupPanel.jsx#L970-L977)).
  - Imperial flows `toFixed(1)` gpm (e.g. [:795](../../frontend/src/components/panels/SetupPanel.jsx#L795), [:1564](../../frontend/src/components/panels/SetupPanel.jsx#L1564)).
  - Imperial pressures `toFixed(1)` psi.
  - Orifice bore `toFixed(2)` mm.
- Effect:
  - A 2.25 bar(a) setpoint becomes 2.3 bar(a) after a click.
  - In imperial, a 1 L/min calibrated-restriction base flow becomes 0.3 gpm = 1.14 L/min (+14 %); 6.0 bar becomes 5.998 bar.
  - In a non-base case each such drift creates an "Overridden" badge, because the value no longer equals the base value.
- Suggested fix: commit only when the draft differs from the displayed string. Keep full precision internally and round only the display.

#### F2-06  Control-valve opening edits ignore the active operating case
- **Severity: S2**
- Location: canvas slider ([LinearControlValveNode.jsx:36](../../frontend/src/nodes/LinearControlValveNode.jsx#L36)) and inspector `onChange` ([SetupPanel.jsx:1039-1044](../../frontend/src/components/panels/SetupPanel.jsx#L1039-L1044)) both call `handleValveChange` ([useWebSocketSimulation.js:188-206](../../frontend/src/hooks/useWebSocketSimulation.js#L188-L206)). That writes `opening` into the **base** node data. On blur, `updateNodeData` compares the case value to that already-changed base value and removes the override ([App.jsx:964-973](../../frontend/src/App.jsx#L964-L973), [case_resolver.js:269](../../frontend/src/utils/case_resolver.js#L269)).
- Effect: in "Case 2", moving a valve opening changes Case 1 (base) and every case that does not override it. Case 2 ends up with no override. When Case 2 already has an override, the slider shows the override and seems not to move. The slider also ignores the read-only lock.
- Suggested fix: route slider/inspector changes through `updateNodeData` (case-aware). Keep `update_valve` only as a live-preview message.

#### F2-07  Results from another case, or from before an edit, are shown as current
- **Severity: S2**
- Location: [case_resolver.js:141](../../frontend/src/utils/case_resolver.js#L141), [:167](../../frontend/src/utils/case_resolver.js#L167). The case telemetry falls back to `node.data.telemetry`, which holds whatever case was solved last. Telemetry is never cleared or marked stale after edits, topology changes, unit or fluid changes, and examples ship with stored results ([2.10](#2b-state-persistence-canvas)).
- Effect: switching to an unsolved case shows the previous case's pressures and flows under the new case name. After any edit, the canvas, DataList and inspector keep showing the old solution with no hint.
- Suggested fix: store results only per case, keyed with a hash of the inputs. Grey out or label results whose hash no longer matches. Do not fall back to `node.data.telemetry` across cases.

#### F2-08  Some numeric inputs reformat on every keystroke and cannot be typed normally
- **Severity: S2** (to confirm in Phase 3)
- Location: the free pipe inner diameter commits on each keystroke and is displayed as `toFixed(2)` ([SetupPanel.jsx:373-380](../../frontend/src/components/panels/SetupPanel.jsx#L373-L380)). The same applies to ambient temperature `toFixed(1)` ([Sidebar.jsx:1293-1303](../../frontend/src/components/panels/Sidebar.jsx#L1293-L1303)), atmospheric pressure in imperial, and DataList pipe length in imperial ([DataList.jsx:1083-1084](../../frontend/src/components/panels/DataList.jsx#L1083-L1084)).
- Effect: React rewrites the field because the string differs (`"2" → "2.0"`). Typing "25" for ambient temperature yields 2.0 → 2.05 → shown 2.0/2.1; typing "60" for a free ID yields 6.00 mm. In metric the DataList length field also accepts empty input as 0 m, and negative lengths are solved without complaint.
- Suggested fix: use the draft/commit-on-blur pattern already used elsewhere in SetupPanel, and validate ranges.

#### F2-09  Relief matrix: changing a forced state re-solves with the previous state
- **Severity: S2**
- Location: [DataList.jsx:255-258](../../frontend/src/components/panels/DataList.jsx#L255-L258) calls `fetchBatchSimulations(nextCases, nextNodes)`, but the function takes no arguments and uses the stale closure state ([:142-175](../../frontend/src/components/panels/DataList.jsx#L142-L175)). The follow-up `runSimulation` after 50 ms is also the previous render's function and sends the old graph.
- Effect: the matrix shows results for the setting before the change. (With F1-03, `forced_open` has no effect at all anyway.)
- Suggested fix: let the batch call take the new payload explicitly, or trigger it from an effect after state settles.
- **Status: fixed 2026-10-14 (B1c).** The batch call takes the new cases/nodes; the active case re-runs once the new state is in the props.

#### F2-10  No error boundary and no import validation: a bad file or any render error blanks the app
- **Severity: S2**
- Location: there is no `ErrorBoundary` in the tree. `loadData` ([App.jsx:770-826](../../frontend/src/App.jsx#L770-L826)) accepts any JSON with truthy `nodes`/`edges`. A node without `position`, `nodes` that is not an array, or an unknown handle crashes rendering or throws inside a `setTimeout`.
- Effect: white screen. The user must reload; the last local draft (≤ 1 s old) is restored. API errors are handled per call with `alert()`, and there is no global handler for 401 (expired session).
- Suggested fix: add a top-level error boundary with "reload last draft / export JSON". Validate imported files against a schema with clear messages, and add an axios 401 interceptor.

#### F2-11  Every autosave broadcasts "diagram updated"; co-viewers get a blocking reload prompt every few seconds
- **Severity: S2**
- Location: `PUT /api/diagrams/{id}` always broadcasts `diagram_updated` ([diagrams.py:184-192](../../backend/routers/diagrams.py#L184-L192)). The editor's autosave fires 2 s after any change, including selection, drag and each simulation result. Other clients show `window.confirm("Co-editor … has updated this diagram. Reload?")` ([useAutoSaveSession.js:185-191](../../frontend/src/hooks/useAutoSaveSession.js#L185-L191)).
- Suggested fix: debounce or coalesce broadcasts, show a non-blocking banner, and do not autosave on results-only or selection-only changes.

#### F2-12  Login rate limit can be bypassed with a spoofed X-Forwarded-For header
- **Severity: S2** (security)
- Location: [limiter.py:7-12](../../backend/limiter.py#L7-L12) keys on the **first** `X-Forwarded-For` entry, which the client controls. nginx's `$proxy_add_x_forwarded_for` appends to the client's header, and `docker-compose.yml` also exposes the backend directly on port 5701.
- Effect: the 10/min limit on `/login`, `/register` and `/setup-admin` is per spoofed value, so it does not stop password guessing.
- Suggested fix: trust only the last hop added by your proxy (or use uvicorn `--proxy-headers` with `--forwarded-allow-ips`), and do not publish the backend port.

#### F2-13  Deployment defaults weaken the documented security model
- **Severity: S2** (security / operations)
- Location: [docker-compose.yml](../../docker-compose.yml), [nginx.conf](../../nginx.conf), [routers/simulation.py:145-147](../../backend/routers/simulation.py#L145-L147).
- Details:
  - `WALFLOW_REQUIRE_WS_AUTH=false`, so the simulation WebSocket (and `join_diagram`) is open to anonymous users, contrary to SEC-02.
  - No `WALFLOW_SECRET_KEY`: a random key per container start logs everybody out on restart, and the auth cookie is not `Secure`.
  - `POST /api/simulation/batch` needs no login at all, and solves have no timeout.
  - nginx keeps the default 1 MB `client_max_body_size`. Cloud saves include all results: 0.55 MB for the 49-node, 4-case `walflow-diagram (8)`. Larger diagrams will get HTTP 413, shown only as a red "error" save status.
- Suggested fix: set a secret key and WS auth in compose, protect `/batch`, add a solver timeout, raise or justify the body limit, and stop storing results in saved diagrams (F2-22).

#### F2-14  Admin and user lifecycle: the last admin can demote themselves; rejected users keep access
- **Severity: S2** (security)
- Location: [admin.py:89-100](../../backend/routers/admin.py#L89-L100) has no "last admin" guard, so an admin can demote themselves. `get_current_user` ([auth.py:134-171](../../backend/auth.py#L134-L171)) and `/refresh` do not check `user.status`. `reject` can be applied to an already approved user.
- Effect:
  - With no admin left, `AdminSetupModal` and `/setup-admin` / `/register` reopen and the next visitor becomes admin.
  - "Rejecting" an active user does not end their session; the 20-minute refresh renews it indefinitely.
  - The `pipe_manager` role used by the catalog routers cannot be assigned through the API or UI (`role not in ["admin", "user"]`).
- Suggested fix: block demotion or deletion of the last admin, check `status == approved` in `get_current_user`, add `pipe_manager` to the role API and AdminHub, and add an explicit "disable user".

#### F2-15  NaN or Infinity in results produce invalid JSON; the frontend drops the reply silently
- **Severity: S3**
- Location: the backend has no NaN guard anywhere. `json.dumps` emits `NaN` ([main.py:206](../../backend/main.py#L206)), the browser's `JSON.parse` fails, and the hook only logs to the console ([useWebSocketSimulation.js:151-154](../../frontend/src/hooks/useWebSocketSimulation.js#L151-L154)).
- Evidence (`edge_inputs.py`): HX with `rated_flow_lmin = 0` (blocked in the inspector but possible in files) → `NaN` in telemetry. The spinner stops and nothing is shown.
- Suggested fix: sanitise non-finite numbers server-side (and report them as a solver error). On the client, show parse failures to the user.

#### F2-16  Zero is displayed as the default, and some legitimate values are rejected
- **Severity: S3**
- Location: `value || default` patterns. For example `rise_to_shutoff_pct` ([SetupPanel.jsx:816](../../frontend/src/components/panels/SetupPanel.jsx#L816)), `medium_temp_c`, `design_inlet/outlet_temp_c`, `set_temperature_c`: entering 0 shows 20 / 10 / 50 / 40 / 40, while the backend uses 0.
- Critical validation rejects ≤ 0 for `temp_base_c` (0 °C or −10 °C calibration temperature) and for check-valve `cracking_pressure_bar = 0`, even though the input says `min="0"`.
- Suggested fix: use `??` and per-field ranges instead of a blanket "> 0".

#### F2-17  Clearing a numeric solver setting sends `null`; the backend rejects the graph with an alert on every keystroke
- **Severity: S3**
- Location: [Sidebar.jsx:1375-1424](../../frontend/src/components/panels/Sidebar.jsx#L1375-L1424): `parseFloat('')` → `NaN` → JSON `null` → Pydantic error → `update_graph` error → `alert("Simulation Engine Error…")` ([main.py:151-157](../../backend/main.py#L151-L157)). There is no range check either (e.g. damping 0 or 5, tolerance negative).
- Suggested fix: draft-and-commit with range validation. Do not `alert()` for `update_graph` parse errors; show an inline status instead.

#### F2-18  Keyboard shortcut side effects
- **Severity: S3**
- Location: [useKeyboardShortcuts.js](../../frontend/src/hooks/useKeyboardShortcuts.js).
- Details:
  - Ctrl+C calls `preventDefault()` whenever focus is not in an input, so users cannot copy numbers from the Results panel or the DataList.
  - Delete/Backspace, R, Ctrl+V and Ctrl+Z act on the canvas while a modal is open, and bypass the read-only lock (as does ReactFlow's built-in Backspace delete).
  - Keyboard delete has no confirmation, while the inspector button has one, and undo often cannot restore the deletion (F2-03).
- Suggested fix: skip handling when there is a text selection or an open modal, and check the lock.

#### F2-19  Connection validation gaps
- **Severity: S3**
- Location: [App.jsx:876-913](../../frontend/src/App.jsx#L876-L913); no `isValidConnection`.
- Evidence (`connect_check.py`):
  - Several pipes can attach to one port; the solver treats it as an implicit tee (two tanks → one pump inlet: 227 + 227 L/min).
  - A self-loop on a pump solves (480 L/min recirculation).
  - An unconnected outlet is silently a closed end (success, 0 L/min).
  - An unknown node type causes `IndexError` → generic error.
- Suggested fix: optionally limit one pipe per port (with a tee hint), warn on self-loops and open ports before running, and validate types on import.

#### F2-20  Unit and missing-value presentation inconsistencies
- **Severity: S3**
- Details:
  - The relief matrix hard-codes `bar(a)` and is not converted in imperial ([DataList.jsx:702-703, 780, 798](../../frontend/src/components/panels/DataList.jsx#L702-L703)).
  - The rupture disc rating shows a default of 30 bar while the backend uses 25.
  - `paToBar` / `m3sToLmin` return `"0.00"` for missing values. DataList shows 0 bar and 20 °C for nodes without results ([DataList.jsx:322-331](../../frontend/src/components/panels/DataList.jsx#L322-L331)), and GenericDetails falls back to 1.01325 bar / 20 °C.
  - Heat duty is shown in HP in imperial (BTU/h is customary).
- Suggested fix: use `—` for missing values, and route every displayed quantity through `UnitContext`.

#### F2-21  Peak-mode scaling cache is stale after re-runs and is saved into files
- **Severity: S3**
- Location: `getActiveCaseScalingInfo` mutates the case object (`_scalingInfo`) inside `useMemo` ([case_resolver.js:41, 75, 107-115](../../frontend/src/utils/case_resolver.js#L41)). `updateCaseTelemetry` copies the old `_scalingInfo` into the updated case ([:183-188](../../frontend/src/utils/case_resolver.js#L183-L188)), so "Peak" view keeps the first run's scaling. It also ships in saved files (all 4 cases of `walflow-diagram (8)`) and leaves a `console.log` in the render path. (The peak model itself is F1-08.)
- Suggested fix: compute without mutating, keyed to the telemetry object.

#### F2-22  Stored results bloat every save and message; a full localStorage fails silently
- **Severity: S3**
- Evidence: results are 91 % of `Example_API_614_LOS.wlf` (253 kB with results vs 23 kB without). The whole state, including all cases' results, is sent over the WebSocket 250 ms after each change ([App.jsx:1277-1294](../../frontend/src/App.jsx#L1277-L1294)), stringified to localStorage after 1 s, and PUT to the cloud after 2 s.
- If `localStorage.setItem` throws (quota of about 5 MB), the status still reads "saved" ([useAutoSaveSession.js:81-90](../../frontend/src/hooks/useAutoSaveSession.js#L81-L90), [:274-279](../../frontend/src/hooks/useAutoSaveSession.js#L274-L279)). All tabs share one draft key, so the last tab to save wins.
- Suggested fix: exclude results from saved files and graph messages (re-solve on load instead), report storage failures, and use a key per tab or per diagram.

#### F2-23  Catalog data errors
- **Severity: S3**
- Evidence (`catalog_check.py`):
  - The `SS01` and `DX01` seed pipe classes list DN15/DN20 "10S" with 1.65 mm walls. That is the 5S value; 10S is 2.11 mm. The bore is about 0.9 mm too large, so DN15 ΔP is about 20–25 % low ([pipe_class_defaults.py](../../backend/services/pipe_class_defaults.py)).
  - `standards_library.js` DN400 Sch 20/30 = 9.53/12.70 mm; the correct values are 7.92/9.53 mm ([standards_library.js:26](../../frontend/src/utils/standards_library.js#L26)). This table is used only for nearest-size matching and the manual DN list.
  - The bundled DIN EN 10253-2 fallback has 22 rows versus 37 in the backend seed, so 15 combinations disappear when the API is unreachable.
  - Cone angles differ by ≤ 0.06° between the backend and the bundled copies (harmless).
- Suggested fix: correct the values, and generate the frontend bundle from the backend seed (or drop it and rely on the API).

#### F2-24  Several sources of truth; unused settings and endpoints
- **Severity: S3**
- Details:
  - Fluid list duplicated FE/BE, and `/api/simulation/fluids` is unused. The calibration-fluid select offers only 4 of 23 fluids ([SetupPanel.jsx:1552-1555](../../frontend/src/components/panels/SetupPanel.jsx#L1552-L1555)).
  - Three pipe-dimension tables (`ASME_B36_10M_SCHEDULES`, `ASME_PIPE_STANDARDS`, backend seed).
  - Pump-curve formulas duplicated in PumpDetails.
  - Default global settings defined three times (App state, new drawing, Sidebar delete).
  - `global_roughness` is stored and sent but ignored by the parser, which hard-codes 0.045 mm ([graph_parser.py:128](../../backend/simulation/graph_parser.py#L128)).
  - The edge `friction_factor` is unused.
- Suggested fix: serve catalogs from one place (the API, with a generated bundle as fallback). Use `global_roughness` as the fallback or remove it.

#### F2-25  Lock and collaboration authorisation/lifecycle gaps
- **Severity: S3** (security, low exploitability: ids are UUIDs)
- Details:
  - `checkout` and `lock-status` do not check ownership for standalone diagrams ([diagrams.py:249-257](../../backend/routers/diagrams.py#L249-L257)), so any user who knows the id can lock someone else's drawing.
  - `join_diagram` over the WebSocket has no authorisation ([main.py:136-140](../../backend/main.py#L136-L140)), so lock and update events (usernames, user ids) leak.
  - A lock is not released on WebSocket disconnect or tab close; it stays up to 15 min.
  - Locks and the token-revocation list are in-memory unless Redis is configured; with more than one worker they are not shared.
  - A save with no lock silently acquires one for the saver.
- Suggested fix: apply the same access check as `GET /diagrams/{id}` to checkout/lock-status/join, release on disconnect, and document single-worker operation or require Redis.

#### F2-26  Code health (candidate refactors, not fixes)
- **Severity: S3**
- Monoliths:
  - `SetupPanel.jsx` (2161 lines), `PipeClassesPage.jsx` (2340), `Sidebar.jsx` (1993), `App.jsx` (1970), `DataList.jsx` (1106).
  - Heatmap range logic is duplicated inside App (`computeGlobalHeatmapRange` vs `computedHeatmapRange`).
  - Pipe-class selection logic is duplicated (`PipeSelector` vs DataList).
- Side effects inside state updaters:
  - `setSelectedNode` inside `setNodes` ([App.jsx:944-946](../../frontend/src/App.jsx#L944-L946)).
  - `setActiveCaseId` inside `setCases` ([App.jsx:325-330](../../frontend/src/App.jsx#L325-L330)).
- Dead code:
  - `toDisplayValue` and most converter helpers are unused.
  - `getReducerCombinations/getReducerEntry` and `getEffectiveGlobalSettings` are unused.
  - `heat_duty_kw`, orifice `standardDn/Sch`, `hasPsv`.
- Hard-coded `app_version: '0.2.1'` in [Sidebar.jsx:995](../../frontend/src/components/panels/Sidebar.jsx#L995) (APP_VERSION is 0.2.0).

#### F2-27  Accessibility basics missing in code
- **Severity: S3**
- Evidence: 85 `<label>` but 1 `htmlFor`, so inspector fields have no accessible names. There are 0 `role="dialog"`/`aria-modal` and no focus trap or focus return in modals; 2 `aria-label`; 9 `outline: 'none'`; several clickable `div`/`td`/`span` are not keyboard reachable. Status is shown by colour only in the cases matrix and the heatmap. Phase 3.28 will check contrast and keyboard use in the browser.

#### F2-28  Platform and performance risks
- **Severity: S3**
- Details:
  - `reactflow` 11 (legacy package, peer range React 17/18) runs on React 19.2. Upgrading to `@xyflow/react` 12 is the supported path.
  - `interactiveNodes`/`styledEdges` rebuild every node's and edge's `data` object on every `nodes` change (each drag frame, each selection). The heatmap range loops over edges × cases, and the WS/autosave pipeline (F2-22) runs after each change. Expect lag with 100+ nodes; measure in Phase 3.
- Suggested fix: memoise per node, keep results out of `nodes`, and debounce the save/send pipeline on real edits only.

#### F2-29  Loading an example or file while a cloud diagram is open keeps that diagram as the autosave target
- **Severity: S1** (data loss; found while implementing B0, 2026-10-13, at `8c09b2d`)
- Location: `App.jsx › handleLoadDiagramWithCheck`. With an active project it asks to "detach cloud sync" but only calls `setActiveProject(null)`; `activeDiagram` and the lock stay. Without an active project (diagram not in a project) there is no prompt at all.
- Effect: if the user holds the lock, autosave PUTs the example/file content into the open cloud diagram ~2 s later, overwriting it.
- Suggested fix: when a non-cloud load replaces an open cloud diagram, prompt in both cases and clear `activeDiagram` (and check the lock in) on confirm.
