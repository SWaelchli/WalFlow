# WalFlow Roadmap & Feature Backlog

This document outlines planned features, overlays, and enhancements for the WalFlow hydraulic simulator, grouped by the release they are planned for.

| Release | Scope |
|---|---|
| **0.2.1** | Patch: bug fixes and small finishing work after 0.2.0. |
| **0.2.x** | Small additive features; no file format change. |
| **0.3.0** | Next feature release: physics depth (elevation, fittings, valves, pumps) and result warnings. |
| **Later** | Not scheduled yet. |

Items move between releases as priorities change.

---

## 0.2.1

- [x] **🌡️ Sensing Pins on All Three 3-Way TCV Ports**
  * **Concept:** Give the 3-way temperature control valve a sensing pin on each of its 3 ports.
  * **Today:** it has only 2 sensing pin options.

- [x] **🔀 Switch Cases from the Data List Header**
  * **Concept:** In the Cases, Measurements and Relief tabs of the data list, selecting a case header switches to that case.

- [x] **▶️ Solve All Cases Button in the Data List**
  * **Concept:** Add the Solve all cases button back to the Cases, Measurements and Relief tabs of the data list, at the top right and with the same styling as the Auto sort button.

- [x] **🎯 Scroll the Data List to the Selected Item**
  * **Concept:** When a pipe or piece of equipment is selected on the canvas and its data list tab (Pipes or Equipment) is open, the list scrolls to that item.

- [x] **🐛 Bug: Pipe Class Selection in Project Settings Not Saved**
  * **Today:** the pipe classes selected in Project settings are not being saved.

- [x] **🐛 Bug: New Drawing Opens with the Content of the Previous Drawing**
  * **Steps:** with a drawing open on the canvas, create a new project, create a new drawing in it and open that drawing.
  * **Today:** the new drawing opens with the same content as the drawing that was open before.
  * **Expected:** a new drawing is always empty, unless it was explicitly created as a copy (see Create a Drawing as a Copy under 0.2.x).

- [x] **🐛 Bug: File › New Drawing Deletes the Content of the Previous Drawing**
  * **Steps:** with a drawing open, create a new drawing with File › New Drawing, then switch back to the old drawing.
  * **Today:** the new drawing opens with an empty canvas as it should, but the old drawing is now empty too and its content is lost.
  * **Expected:** the old drawing keeps its content.

- [x] **🐛 Bug: Empty Drawing Receives a Copy of the Drawing Opened After It**
  * **Steps:** with a drawing with an empty canvas open, switch to a drawing with content, then switch back.
  * **Today:** the formerly empty drawing now contains a copy of the drawing just opened.
  * **Expected:** the empty drawing stays empty.

- [x] **🐛 Bug: Switching to an Empty Drawing Deletes the Content of the Previous Drawing**
  * **Steps:** with a drawing with content open, switch to a drawing with an empty canvas, then switch back.
  * **Today:** the empty canvas opens as it should, but the original drawing is now empty too and its content is lost.
  * **Expected:** the original drawing keeps its content.

---

## 0.2.2


### 📊 Analytics & Telemetry

- [ ] **📏 Valve Results Chart (Differential Pressure & Flow vs. Cv Characteristic)**
  * **Concept:** Switch the Results tab chart for control valves and regulators (`linear_control_valve`, `linear_regulator`, `remote_control_valve`) from an absolute pressure envelope ($P_{\text{in}}$ or $P_{\text{out}}$ in bara/psia) to an interactive, dual-mode performance chart with a toggle button:
    1. **$\Delta P$ vs. Flow ($Q$) mode:** Hydraulic resistance curve at current opening vs. wide-open limit curve ($\Delta P_{\text{100\%}}$), operating point $(Q_{\text{op}}, \Delta P_{\text{op}})$, and flow capacity headroom.
    2. **Flow ($Q$) vs. $C_v$ mode:** Valve travel characteristic with $C_v$ on the X-axis (from 0 to $C_{v,\max}$, representing 0% to 100% opening) and Flow $Q$ on the Y-axis under the current operating $\Delta P_{\text{op}}$, pinpointing the operating point $(C_{v,\text{op}}, Q_{\text{op}})$ along the sizing and controllability range.
  * **Today:** The chart converts backend differential pressures into absolute pressures ($P_{\text{in}}$ or $P_{\text{out}}$), assuming a fixed boundary pressure upstream or downstream. At high operating pressures (e.g. 50 bara), small valve pressure drops (e.g. 0.5 bar) appear virtually flat. Furthermore, the curve sample grid cuts off at $2 \times Q_{\text{op}}$, so when a valve is throttled low (e.g. 15% opening), the 100% full-open operating capacity is clipped off-screen. There is no visualization of flow vs. valve $C_v$ / travel.
  * **Change:**
    1. **Chart View Switcher Button:** Add a compact toggle button group (e.g. `ΔP – Flow` / `Flow – Cv`) in the Results card header to easily switch between the hydraulic loss curve and the sizing travel curve.
    2. **Mode 1 ($\Delta P$ vs. Flow $Q$):**
       - **Y-Axis:** Valve differential pressure $\Delta P$ in display units (`labels.pressureDiff`, e.g. bar or psi) starting from 0.
       - **Curves:** Current opening resistance $\Delta P_{\text{current}}(Q)$, wide-open body limit $\Delta P_{\text{100\%}}(Q)$, operating point cross marker $(Q_{\text{op}}, \Delta P_{\text{op}})$, and a horizontal dashed headroom vector from $(Q_{\text{op}}, \Delta P_{\text{op}})$ to $(Q_{\text{max, 100\%}}, \Delta P_{\text{op}})$.
       - **Flow Range:** Extended in `valve_curves()` to span from 0 to $\max(2 \times Q_{\text{op}}, 1.25 \times Q_{\text{max, 100\%}})$.
    3. **Mode 2 (Flow $Q$ vs. $C_v$ / Travel):**
       - **X-Axis:** Valve flow coefficient $C_v$ from 0 to $C_{v,\max}$ (0% to 100% travel), with dual tick markers indicating opening percentage.
       - **Y-Axis:** Flow rate $Q$ in display units (`labels.flow`, e.g. L/min, m³/h, US gpm) from 0 to $Q_{\text{max, 100\%}}$.
       - **Curve:** Flow $Q(C_v)$ through the valve across the travel range under the current solved $\Delta P_{\text{op}}$, computed using the IEC 60534-2-1 formulation with Reynolds factor $F_R$.
       - **Operating Point:** Highlighted operating marker at $(C_{v,\text{op}}, Q_{\text{op}})$, clearly indicating whether the valve operates in the recommended control band (20%–80%) or risks poor control (<20%) or saturation (>80%).
    4. **Telemetry & Result Table Additions:**
       - $\Delta P$ across the valve (`formatDiffPressurePa`).
       - Max flow at current $\Delta P$ ($Q_{\text{max, 100\%}}$).
       - Valve capacity utilization %: $Q_{\text{op}} / Q_{\text{max, 100\%}}$ (flow headroom indicator).
       - Cavitation / choked flow alert indicator when $\Delta P \ge F_L^2 (P_1 - F_F P_v)$ (IEC 60534-2-1).
  * **Implementation notes:** 
    - Frontend: `frontend/src/components/details/ValveDetails.jsx` (view toggle state, dual Recharts configurations) and `ValveDetails.test.jsx`.
    - Backend: `backend/services/simulation_service.py` (`valve_curves` returning extended flow points and $C_v$ grid points) and `backend/tests/scenarios/test_valve_curves.py`.
    - Component docs: `backend/simulation/equipment/{linear_control_valve,linear_regulator,remote_control_valve}.md`.
  * **Engineering Value:** Delivers a complete valve evaluation tool: the $\Delta P$ chart shows hydraulic system loss and wide-open flow capacity, while the $C_v$ chart gives immediate insight into valve sizing quality, travel margin, and throttling authority.

---

## 0.2.x

### ⚙️ Physics & Simulation

- [ ] **📈 Pump Curve from Datasheet Points**
  * **Concept:** Enter a centrifugal pump curve as several (flow, head) points in a table in the pump inspector, with paste from the clipboard (e.g. columns copied from a datasheet or spreadsheet), and fit the model curve through them. Today the curve cannot be entered point by point (UX audit 2026-10-28, deferred from the findings list).
  * **Implementation notes:** backend fit in the pump model and its `.md`; frontend point table and clipboard paste parser in the pump inspector. Tests: reference rows for the fitted curve through datasheet points in the pump's unit tests (keep the pump in `PUMP_DATA`), Vitest cases for the paste parser.
  * **Engineering Value:** Models a real pump from its vendor datasheet without hand-deriving curve coefficients.

- [ ] **🏷️ Certified Relief Capacity Input (PSVs & Rupture Discs)**
  * **Concept:** Optional "certified capacity (L/min)" field from the valve datasheet / nameplate (API 526 orifice letter, ASME-stamped capacity). When set, capacity utilisation and overcapacity use it instead of the Cv-derived rated flow.
  * **Engineering Value:** Matches the relief study to the purchased valve; the Cv-derived value (B1c) stays the default when no certified figure is known.

- [ ] **🔄 Hydraulic Power Recovery Turbine (Expander)**
  * **Concept:** Add a hydraulic turbine / expander component to model energy recovery from high-pressure liquid letdown streams. Operates as the inverse of a centrifugal pump, extracting hydraulic head to calculate recovered mechanical shaft power ($P_{\text{shaft}} = \eta \cdot \rho g Q H$) rather than dissipating energy as waste heat across a throttling valve.
  * **Implementation notes:** Backend equipment model in `backend/simulation/equipment/` with steady-state head-extraction vs. flow characteristic curve ($\Delta H = -f(Q)$) and efficiency $\eta$; telemetry output for generated power; equipment documentation `.md`; frontend node, inspector, and palette registration.
  * **Engineering Value:** Essential for energy efficiency audits and modeling power recovery in high-pressure letdown stations, reverse osmosis units, and process loops.

### 📊 Analytics & Telemetry

- [ ] **📏 Valve Opening Instrument**: Add instrument functionality to measure valve opening (control valves, regulators, 3-way TCV), so the opening of each valve can be compared per operating case in the Measurements tab, with alarm limits like the other instruments.

- [ ] **📤 Rework of CSV Reports**
  * **Concept:** Today File › Export table as CSV exports only the Pipes or Equipment table of the results panel, whichever tab is open. Rework it into an export dialog with scope settings (which list, active case or all cases, selected items or the whole drawing, units as displayed or SI) and more result lists to export (cases matrix, relief summary, measurements, per-equipment results).
  * **Implementation notes:** one command in the File menu opening a dialog (per the `walflow-ui-layout` skill); the CSV builders move out of `DataList.jsx` into a shared export module; Vitest cases per list and scope.
  * **Engineering Value:** Results go into reports and spreadsheets without copying tables by hand.

### 📁 Project Management & Collaboration

- [ ] **📄 Create a Drawing as a Copy**
  * **Concept:** Let users explicitly create a new drawing as a copy of an existing one. Every other new drawing starts empty.
  * **Today:** only the admin area has a duplicate action (`POST /api/admin/diagrams/{id}/duplicate`); regular users have none.
  * **Engineering Value:** Variants of a system can start from an existing drawing without redrawing it.

- [ ] **🧰 Allowed Pipe Classes in the Project Manager**
  * **Concept:** Let project owners change the allowed pipe classes in the Project Manager modal.
  * **Today:** they can only be changed in the sidebar, under Settings › Project.
  * **To decide:** whether the Project Manager adds to the sidebar control or replaces it.

### 🐛 Maintenance

- [ ] **⚛️ Upgrade reactflow 11 to @xyflow/react 12**
  * **Problem**: `reactflow` 11 is the legacy package with a peer range of React 17/18, but the app runs on React 19.
  * **Benefits**: supported package on React 19, fewer re-renders per drag frame (v12 measures and updates nodes more efficiently, `useNodesData` / `useStore` selectors), better typed and documented node and edge APIs, server-side rendering and `colorMode` support, and continued security and bug fixes. A memoised v11 (done in B5) removes most of the lag, so this is for long-term maintenance, not urgent.
  * **Effort and risk**: about 2-3 days. Custom nodes, handles, edge types, `onConnect` / `isValidConnection`, context menus and the fit-view logic need re-testing; `node.width/height` becomes `node.measured`.

---

## 0.3.0

### ⚙️ Physics & Simulation

- [ ] **⛰️ Pipe Elevation & Fittings Losses**
  * **Concept:** Per-pipe elevation change ($\rho g \Delta Z$ term) so suction lift, siphons and NPSH at an elevated pump can be modelled, plus a fittings $\Sigma K$ (or equivalent length) per pipe and a tank-outlet entrance loss ($\approx 1.5\,\rho v^2/2$). Steady-state only.
  * **Status (B6 decision, 2026-10-15):** not implemented. Today only tanks have an elevation, pipes are straight-pipe Darcy-Weisbach, and the in-app help documents these limits. New fields would be optional (no file format bump).

- [ ] **📒 Fitting Loss Coefficient (K) Catalogue and Junction Port Losses**
  * **Concept:** A new "Fitting K factors" tab on `/catalogue`, next to the geometric fitting and schedule libraries (that tab to be renamed so it reads as geometry only). Entries per source (built-in Crane TP-410, user sets), rows per fitting type (tee run / branch, elbow, bend, entrance, exit, ...) with a method: fixed K, Crane $n\,f_T$ ($f_T$ from the connected pipe size), later Hooper 2-K and Darby 3-K for viscous fluids at low Re. The multi-port junction gets an optional constant K per port, picked from a tee row with a run / branch role per port (copied into the node like the control valve style); the default stays an ideal junction.
  * **Notes (2026-10-26):** tables give K per path, the junction needs K per port. Splitting Crane as run end $10\,f_T$ and branch end $50\,f_T$ reproduces run-run $20\,f_T$ and run-branch $60\,f_T$ for single-feed patterns; merging and dividing flow stay approximate. Per-pipe fittings $\Sigma K$ (see Pipe Elevation & Fittings Losses) can use the same catalogue. Every seeded value needs a `standard-verification` check; Hooper and Darby are new register entries.
  * **Fix first (2026-10-27):** a few solver spots still take a node's first inlet as its upstream side: `_edge_weights` (inlet volume flow factor from `src.inlets[0].density`) and `_get_node_p_out` (density and viscosity from `node.inlets[0]`). Harmless for the ideal junction today, which has no pressure term, but a junction with a K per port would read the fluid of whichever pipe was drawn in first. Base them on the port the flow enters by (as `Pipe.upstream_port` does), with a drawn-direction test on a junction carrying port losses and streams at different temperatures.
  * **Engineering Value:** Traceable fitting losses from one library instead of hand-placed restrictions on branches.

- [ ] **🚦 Plausibility Warnings**
  * **Concept:** Non-blocking result warnings, shown in the status chip panel and the result banners: centrifugal pump run-out and minimum flow (% of rated / BEP), pipe velocity above a limit per service (e.g. suction, discharge, return), operating pressure or temperature above the pipe class P-T rating, and fluid temperature outside the property data range (`temperature_out_of_range` is already in `physical_validity`).
  * **Status (B4a decision, 2026-10-15):** moved out of the audit. The backend flags for NPSH, fluid range and motor overload exist; thresholds (velocity limits, % of rated flow) need a decision before building the UI.

- [ ] **🛢️ Pump Viscosity Correction (HI 9.6.7)**
  * **Concept:** Correct centrifugal pump head, flow and efficiency for viscous fluids (Hydraulic Institute 9.6.7 correction factors $C_H$, $C_Q$, $C_\eta$ from the water curve). Today the curve is head-based (B1a), so density is handled, but viscosity does not change the curve.
  * **Engineering Value:** Realistic duty points for cold lube and seal oils (VG32 to VG220), where the uncorrected water curve over-predicts head and efficiency.

- [ ] **💧 Valve Choked Flow & Cavitation (IEC 60534 $F_L$, $F_F$)**
  * **Concept:** Liquid pressure-recovery factor $F_L$ and critical pressure ratio $F_F$ per valve: choked-flow limit $\Delta P_{\max} = F_L^2 (P_1 - F_F P_v)$, flashing and cavitation onset indices.
  * **Status (B1d, 2026-10-14):** valves, regulators and orifices only flag an outlet pressure below the vapour pressure (`flashing_warning`); the flow is not limited by choking.

- [ ] **🎛️ Advanced Control Valve (Custom $C_v$ Trim Curves)**
  * **Concept:** Throttling flow control valve supporting custom inherent flow characteristics (Equal Percentage, Quick Opening, and Linear trims).
  * **Physics:** Computes effective flow coefficient $C_v(x)$ dynamic curves based on valve stem opening percentage $x$, with optional choked flow detection for compressible/high-$\Delta P$ regimes.
  * **Engineering Value:** Enables accurate modeling of dynamic process control loops, valve sizing, and loop gain linearity across varying valve positions.

### 📁 Project Management & Collaboration

- [ ] **⚙️ User & Project Hierarchical Default Settings**
  * **Concept:** Configurable standard component parameter defaults (e.g., default pipe length, default tank temperature, default pipe diameter) customizable at both the User level and Project level.
  * **Evaluation & Fallback Hierarchy:**
    * `1. Project Setting / Default`: If configured at the project level, use project default value.
    * `2. User Setting / Default`: Elif configured in user settings, use user preferred default value.
    * `3. App Default`: Else fall back to system built-in application default value.
  * **Engineering Value:** Streamlines model building by eliminating repetitive property adjustments for standard project or user engineering conventions.

- [ ] **🔖 Drawing Revisions**
  * **Concept:** Release a revision of a drawing, which is permanently saved as read-only. The work-in-progress version can always be modified. A drawing can store multiple revisions, e.g. Rev 00, Rev 01, Rev 02, Rev A, Rev B.
  * **Engineering Value:** Issued revisions stay on record exactly as released while work on the drawing continues.

### 🐛 Maintenance

- [ ] **⏱️ Potential Improvement: Faster Opening of Large Drawings**
  * **Problem:** Opening the Large Reference Network (54 nodes, 57 edges) blocks the page for about 0.2-3 s on a production build, usually 1.5-3 s (2026-11-02, corporate PC, spread is large).
  * **Findings:** One profile shows most of the time in React rendering and commit, with no single slow function; `DataList` is the largest app code at about 8 %. A real gain likely means changing how the canvas and data list render. The reactflow upgrade (see 0.2.x) may help. One load during a heavy CPU run froze the tab for about 30 s and showed "Solver not connected"; this did not recur and the cause is unknown.
  * **Decision needed:** Measure again first, and only build this if the delay still matters in use.

---

## Later

### 🎨 Canvas & Overlays

- [ ] **🛡️ Overpressure Safety Zone Overlay (`SafetyBoundsOverlay`)**
  * **Concept:** Boundary shading defining isolated pressure zones and component design pressure limits (MAWP - Maximum Allowable Working Pressure) across the diagram canvas.
  * **Visuals & MAWP Alerts:** Semi-transparent shaded region boundaries grouped by high-pressure, pilot-pressure, and tank-return lines, with dynamic visual red flash and warning badges (`⚠️ P > MAWP`) when a component or low-pressure line experiences pressure exceeding its rated MAWP limit.
  * **Engineering Value:** Provides clarity in complex P&ID diagrams with multiple pressure levels (e.g., main supply circuit vs. pilot control circuit vs. drain/tank return) and alerts engineers to structural overpressure risks.

### ⚙️ Physics & Simulation

- [ ] **🚰 Pressure-Dependent Demand**
  * **Concept:** A demand whose draw-off depends on the local pressure (orifice or emitter to atmosphere, $Q = K\sqrt{\Delta p}$), next to the fixed demand of the flow boundary.
  * **Today:** the flow boundary set to draw is a fixed demand (`flow_boundary.md`, "Not modelled").
  * **Engineering Value:** Leakage, sprinklers and outlets in distribution networks whose flow follows the network pressure.

- [ ] **🔱 Flow-Ratio Dependent Tee Losses (Idelchik / Miller)**
  * **Concept:** Tee loss coefficients for the combining and dividing flow patterns from Idelchik (diagrams 7-x) and Miller, as a function of flow ratio, area ratio and branch angle. Geometry fixes the run and branch legs; the flow pattern is found from the solved flow signs. 3-port tees only (crosses where data exist); larger headers keep the constant K per port.
  * **Notes (2026-10-26):** a leg's loss depends on the flows in the other legs, which couples the junction's edges in the Jacobian (today one diagonal entry per edge). Pattern switches at flow reversal need smoothing near zero flow for Newton convergence. The run coefficient in combining flow can be negative (ejector effect). Needs its own validation cases from the tables.
  * **Engineering Value:** Realistic header and manifold distribution where the tee losses decide the flow split.

- [ ] **🔁 Direction-Dependent Control Valve Behaviour (Flow to Open / Flow to Close)**
  * **Concept:** A globe control valve behaves differently with flow under the plug (flow to open) and over the plug (flow to close): $C_v$ and $F_L$ per direction, and the flow-to-close stability limit near the seat (plug slam at small openings). Each valve gets a flow-direction setting (flow to open / flow to close) for its forward direction; reverse flow through the valve uses the other set.
  * **Today (2026-10-27):** the linear control valve and the remote control valve use the same law in both directions (`linear_control_valve.md` reverse-flow notes). Their ports keep the inlet / outlet role (see Neutral Ports), so the direction model needs no drawing change.
  * **Open:** source of the per-direction data (IEC 60534-2-1 $F_L$ tables per flow direction, vendor data) via `standard-verification`; whether the style catalogue (IEC 60534-2-1 Table D.2) gets a direction column.
  * **Engineering Value:** Correct capacity and choked-flow limits for valves installed or operated against their design flow direction.

- [ ] **🔥 Direction-Dependent Heat Exchanger Behaviour**
  * **Concept:** A heat exchanger's process nozzles have fixed roles; with a finite utility stream, reversing the process flow turns counter-current into co-current (or the reverse), which lowers or raises the effectiveness. Model the utility side as a finite capacity rate with its own flow direction, and the flow arrangement (counter-current, co-current, cross-flow, TEMA shell passes), and pick the effectiveness-NTU relation from the actual flow direction.
  * **Today (2026-10-27):** the utility side is an infinite-capacity medium ($C_{\min}/C_{\max} \to 0$), where every arrangement has the same effectiveness, so forward and reverse flow give the same duty (`heat_exchanger.md` reverse-flow note). The ports keep the inlet / outlet role (see Neutral Ports).
  * **Engineering Value:** Realistic duty for exchangers with a limited utility flow, and for exchangers operated in reverse.

- [ ] 🔬 **Relief Device Capacity Sizing Investigation (PSVs & Rupture Discs)**
  * **Concept:** Detailed technical investigation into industry standard methodologies (e.g. API 520/526, ISO 4126, ASME Section VIII) for determining rated relief capacity ($Q_{\text{rated}}$), allowable overpressure accumulation (e.g., 10% for non-fire, 21% for fire case), and liquid vs. gas $C_v$ / coefficient of discharge ($K_d$) orifice sizing models across relief valves and burst diaphragms.
  * **Goal:** Determine standard formulas and reference pressure drops ($\Delta P_{\text{ref}}$) for assessing capacity utilization percentage ($Q_{\text{actual}} / Q_{\text{rated}}$) and overcapacity alerts for both incompressible liquids and compressible gases.
  * **Status (B1c, 2026-10-14):** liquid service done: rated flow = flow at full lift with the inlet at 110 % of set (gauge) against the actual outlet pressure, from the device's Cv / orifice. Gases, two-phase and fire-case accumulation remain open.

- [ ] **⚖️ Relief Valve Capacity Corrections (Balanced Bellows and API 520 Liquid Factors)**
  * **Concept:** Apply the capacity corrections a liquid relief valve gets in API 520 Part I: the balanced-bellows backpressure correction $K_w$, the liquid discharge coefficient $K_d$ and the viscosity correction $K_v$, and check the 3 % inlet pressure loss rule (API 520 Part II).
  * **Today (0.2.0):** PSVs have a valve type. A conventional valve opens at set pressure plus the superimposed backpressure above its design value (`design_superimposed_bp_barg`), and built-up backpressure while relieving reduces its lift; balanced bellows and pilot-operated valves open on inlet gauge pressure. Superimposed, built-up and total backpressure are reported with the 10 % (conventional) and 50 % (balanced) limits (`pressure_safety_valve.md`, `relief_device.md`). Not modelled: $K_w$, $K_d$, $K_v$ and the inlet loss rule.
  * **Open:** the correction curves and factors need a `standard-verification` check against API 520 before seeding.
  * **Engineering Value:** Capacity utilisation that matches an API 520 relief study for balanced valves into a pressurised header and for viscous liquids.

- [ ] **📏 Nozzle Height per Tank Port**
  * **Concept:** Each tank port gets its own nozzle height, so a side or top nozzle sees a different static head than the bottom outlet.
  * **Today (2026-10-28):** tanks have 1 to 8 neutral ports (see Multiple Nozzles on Fluid Sources), all at the tank bottom.

- [ ] **🌡️ Temperature in Stagnant Sections**
  * **Concept:** Define the temperature of a section shut in at zero flow explicitly, as the pressure already is (see Undefined Pressure in Stagnant Branches).
  * **Today (2026-10-20):** ports without flow take the temperature of their nearest live neighbour or boundary; a physically defined value (e.g. ambient after heat loss, or the leak-path temperature) is open.

- [ ] **💤 Stagnant Sections in the User Interface**
  * **Concept:** Mark ports and pipes that the solver flags `stagnant: true` (sections shut in by a stopped PD pump, a check valve without flow or a closed relief device, see Undefined Pressure in Stagnant Branches) with a "shut in" flag, and grey out their values in the data list, so an assumed zero-flow pressure and temperature do not read as calculated results.
  * **Today (2026-11-05):** the flag is in the telemetry; the frontend does not show it. Do together with Temperature in Stagnant Sections.

### 📊 Analytics & Telemetry

- [ ] **🖥️ Server Resource Telemetry & Performance Dashboard**:
  * **System Resource Monitoring**: Track CPU % consumed by matrix calculations (SciPy/NumPy), RAM usage per active simulation WebSocket, and average solver iteration time (ms) using `psutil`.
  * **Session & User Usage Stats**: Record active connected user count, duration of simulation runs, and historical simulation sessions in the database.
  * **Live Admin Performance Dashboard**: Build an integrated admin dashboard featuring live gauges and historical charts of server compute power and active simulation sessions.

### 🔐 Administration

- [ ] **🌐 Dedicated Standalone Admin Portal (`/admin`)**
  * **Concept:** Transition the Admin Hub from a modal dialog (`AdminHubModal`) to a full standalone subpage route (`http://localhost:5173/admin`).
  * **Functionality & Capabilities:**
    * Centralized administrative interface for managing users, server settings, database projects, and performance diagnostics.
    * Navigation bar **Admin Hub** button directs admins directly to the `/admin` subpage.
  * **Access Control & Security:**
    * Strict client-side and backend route protection—non-admin users attempting to access `/admin` are denied access and redirected.
