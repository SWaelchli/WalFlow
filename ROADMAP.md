# WalFlow Roadmap & Feature Backlog

This document outlines planned features, overlays, and enhancements for the WalFlow hydraulic simulator.

---

## 🎨 Canvas & Overlays

- [ ] **🛡️ Overpressure Safety Zone Overlay (`SafetyBoundsOverlay`)**
  * **Concept:** Boundary shading defining isolated pressure zones and component design pressure limits (MAWP - Maximum Allowable Working Pressure) across the diagram canvas.
  * **Visuals & MAWP Alerts:** Semi-transparent shaded region boundaries grouped by high-pressure, pilot-pressure, and tank-return lines, with dynamic visual red flash and warning badges (`⚠️ P > MAWP`) when a component or low-pressure line experiences pressure exceeding its rated MAWP limit.
  * **Engineering Value:** Provides clarity in complex P&ID diagrams with multiple pressure levels (e.g., main supply circuit vs. pilot control circuit vs. drain/tank return) and alerts engineers to structural overpressure risks.

---

## 📁 Project Management & Collaboration

- [ ] **⚙️ User & Project Hierarchical Default Settings**
  * **Concept:** Configurable standard component parameter defaults (e.g., default pipe length, default tank temperature, default pipe diameter) customizable at both the User level and Project level.
  * **Evaluation & Fallback Hierarchy:**
    * `1. Project Setting / Default`: If configured at the project level, use project default value.
    * `2. User Setting / Default`: Elif configured in user settings, use user preferred default value.
    * `3. App Default`: Else fall back to system built-in application default value.
  * **Engineering Value:** Streamlines model building by eliminating repetitive property adjustments for standard project or user engineering conventions.

---

## ⚙️ Physics & Simulation

### 🧰 New Equipment & Component Additions

- [ ] 🔬 **Relief Device Capacity Sizing Investigation (PSVs & Rupture Discs)**
  * **Concept:** Detailed technical investigation into industry standard methodologies (e.g. API 520/526, ISO 4126, ASME Section VIII) for determining rated relief capacity ($Q_{\text{rated}}$), allowable overpressure accumulation (e.g., 10% for non-fire, 21% for fire case), and liquid vs. gas $C_v$ / coefficient of discharge ($K_d$) orifice sizing models across relief valves and burst diaphragms.
  * **Goal:** Determine standard formulas and reference pressure drops ($\Delta P_{\text{ref}}$) for assessing capacity utilization percentage ($Q_{\text{actual}} / Q_{\text{rated}}$) and overcapacity alerts for both incompressible liquids and compressible gases.
  * **Status (B1c, 2026-10-14):** liquid service done: rated flow = flow at full lift with the inlet at 110 % of set (gauge) against the actual outlet pressure, from the device's Cv / orifice. Gases, two-phase and fire-case accumulation remain open.

- [ ] **⛰️ Pipe Elevation & Fittings Losses**
  * **Concept:** Per-pipe elevation change ($\rho g \Delta Z$ term) so suction lift, siphons and NPSH at an elevated pump can be modelled, plus a fittings $\Sigma K$ (or equivalent length) per pipe and a tank-outlet entrance loss ($\approx 1.5\,\rho v^2/2$). Steady-state only.
  * **Status (B6 decision, 2026-10-15):** not implemented. Today only tanks have an elevation, pipes are straight-pipe Darcy-Weisbach, and the in-app help documents these limits. New fields would be optional (no file format bump).

- [ ] **🏷️ Certified Relief Capacity Input (PSVs & Rupture Discs)**
  * **Concept:** Optional "certified capacity (L/min)" field from the valve datasheet / nameplate (API 526 orifice letter, ASME-stamped capacity). When set, capacity utilisation and overcapacity use it instead of the Cv-derived rated flow.
  * **Engineering Value:** Matches the relief study to the purchased valve; the Cv-derived value (B1c) stays the default when no certified figure is known.

- [ ] **⚖️ Conventional vs Balanced Relief Valves (Backpressure Effect)**
  * **Concept:** Device-type option for PSVs. Today (B1c) a valve opens when its inlet gauge pressure reaches the set pressure, which is how balanced-bellows and pilot valves behave. A conventional spring valve opens at set + superimposed backpressure (differential across the seat), and built-up backpressure above ~10 % of set reduces its capacity (API 520 Kb factor).
  * **Engineering Value:** Correct opening points and capacities for relief valves discharging into a pressurised header or a long outlet line.

- [ ] **🔌 Multiple Nozzles on Fluid Sources (Tanks and Pressure Sources)**
  * **Concept:** Configurable number of inlet and outlet nozzles on a tank or pressure source (e.g. two pump suctions and a separate relief return on one tank), each a separate port with its own pipe, optionally with its own nozzle height.
  * **Today (2026-10-16):** a port takes one pipe. A line that branches needs a splitter or mixer; separate nozzles are modelled with a second tank at the same level and conditions. The solver already treats a tank or pressure source as one fixed-pressure node, so extra ports mainly need the node component, the port table in `networkValidation.js` (`PORTS_BY_TYPE`) and the parser.
  * **Engineering Value:** Drawings that match the P&ID without helper tanks or splitters.

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

- [x] **📍 Measurement Tap & Instrument Bubbles (`measure_point`, `instrument`)**
  * **Concept:** Two passive elements that read the solved state without changing it. A **Tap** marks a location in a line; an **Instrument** (ISA bubble) shows one measured variable at a location. Alarms are indication only: the solver is steady-state, so a trip never feeds back into the physics.
  * **Tap (`measure_point`):** In-line, 1 inlet and 1 outlet, zero ΔP ($P_{	ext{in}} = P_{	ext{out}}$, $Q_{	ext{in}} = Q_{	ext{out}}$), with a fixed yellow sensing pin. A pin on any equipment port is a measuring location too. A remote control valve can also sense a tap.
  * **Instrument (`instrument`):** No hydraulic ports (like a note). Its `signal-in` handle takes a SIGNAL edge from any pin; a ΔP instrument also has `signal-in-ref` (−). One bubble measures one variable, chosen in a dropdown; the ISA letters follow (`PIT`, `PDIT`, `FIT`, `TIT`; `VI` and `νI` for the two derived variables). The tag is editable and auto-numbered like other components. Several variables at one tap means several bubbles on the same pin.
  * **Variables (v1):**
    * **Pressure ($P$):** barg by default, bara per instrument.
    * **Pressure difference ($dP$):** bar (mbar for small values), pin (+) minus pin (−).
    * **Flow rate ($Q$):** L/min or m³/h. Reverse flow shows as negative.
    * **Temperature ($T$):** °C.
    * **Fluid velocity ($v$):** m/s, from the pipe ID at the pin's port (inlet-side pipe for a tap). Derived, not an ISA variable.
    * **Kinematic viscosity ($
u$):** cSt at the local temperature. Derived, not an ISA variable.
    * Reynolds number is not a v1 variable; the pipe columns already show it.
    * Imperial units follow `UnitContext`.
  * **Alarms (per instrument):** HH and LL (red), H and L (orange). Blank is off; validation requires LL < L < H < HH. Limits are stored on the instrument (same in every case); each operating case's reading is judged against them.
  * **Canvas display:** ISA circle with letters and tag, and a value badge underneath (with unit, "—" until a run has results). The badge turns orange (H/L) or red (HH/LL).
  * **Datalist:** new "Measurements" tab modelled on the relief tab: one row per instrument (tag, variable, location, editable LL/L/H/HH) and one value column per operating case, coloured by alarm state, so it shows which case trips HH.
  * **Workflow:** drag a Tap or Instrument and wire; right-click a pipe → **Insert tap** (splits the pipe in two, copying class, diameter and roughness and halving the length); right-click a tap or pin → **Add instrument** (pre-wired, auto-tagged bubble next to it).
  * **Implementation notes (minimal impact):**
    * Backend: a small `MeasurePoint` pass-through class plus an entry in `create_node`; the parser skips `instrument` like `text_bubble`; the solver is untouched. Check that a zero-ΔP element does not upset the Jacobian (add a test).
    * Frontend: a pure `instrumentReadings(telemetry, nodes, edges)` util (like `nodeReadouts.js`) so edited limits update instantly and need no re-run; `PORTS_BY_TYPE`, sidebar and symbol library entries; add `instrument` to `IGNORED_NODE_TYPES` in `resultHash.js` and to the note types in validation; `onConnect` accepts pin → `signal-in` and `signal-in-ref` only.
    * Validation warnings: unwired instrument, ΔP instrument with one input.
    * No file-format bump (new node types are additive). CHANGELOG entry on delivery.
  * **Out of scope for v1:** a transmitter wired directly into a control valve (the valve senses a pin, as today), trip actions, Reynolds number as a bubble variable.
  * **Engineering Value:** Clean P&ID telemetry tapping, custom monitoring locations and standard alarm indication across complex circuits (e.g. API 614 lube oil supply headers, filter differential pressure).

- [x] **🔀 Reducer / Expander (Area Transition w/ ASME B16.9 Database)**
  * **Concept:** Piping fitting that transitions the fluid stream between two different pipe diameters, integrating a standardized database of ASME B16.9 factory-made wrought buttwelding concentric and eccentric reducers.
  * **Physics:** Computes form friction losses using geometry-dependent $K$-factors based on the exact diameter ratios ($D_2/D_1$) retrieved from the database and expected transition angles. Solves for pressure changes due to velocity shifts via the steady-state Bernoulli equation.
  * **Engineering Value:** Vital for accurate pressure drop accounting and pump suction sizing (NPSH), allowing engineers to simulate real-world, commercially available fitting geometries (Nominal Pipe Sizes and Schedules) directly from the standard rather than relying on theoretical internal diameters.


---

## 📊 Analytics & Telemetry

- [ ] **🖥️ Server Resource Telemetry & Performance Dashboard**:
  * **System Resource Monitoring**: Track CPU % consumed by matrix calculations (SciPy/NumPy), RAM usage per active simulation WebSocket, and average solver iteration time (ms) using `psutil`.
  * **Session & User Usage Stats**: Record active connected user count, duration of simulation runs, and historical simulation sessions in the database.
  * **Live Admin Performance Dashboard**: Build an integrated admin dashboard featuring live gauges and historical charts of server compute power and active simulation sessions.

---

## 🔐 Administration & Dedicated Admin Page

- [ ] **🌐 Dedicated Standalone Admin Portal (`/admin`)**
  * **Concept:** Transition the Admin Hub from a modal dialog (`AdminHubModal`) to a full standalone subpage route (`http://localhost:5173/admin`).
  * **Functionality & Capabilities:**
    * Centralized administrative interface for managing users, server settings, database projects, and performance diagnostics.
    * Navigation bar **Admin Hub** button directs admins directly to the `/admin` subpage.
  * **Access Control & Security:**
    * Strict client-side and backend route protection—non-admin users attempting to access `/admin` are denied access and redirected.

---

## 🐛 Bug Fixes & Refactoring Backlog

- [x] **🔀 Expander Solvability Near Reservoirs (Static Pressure Model)**
  * **Problem**: With the static pressure model, only the Reducer node accounts for velocity head. An expander (e.g. DN50 → DN80) with a short pipe (< ~1.5 m) to a tank or pressure source recovers more static pressure than the system loses, so no steady-state solution exists and the solver reports non-convergence. Reducing flow (contraction) is unaffected.
  * **Fix to evaluate**: Add entry / exit losses and velocity-head handling at tanks and pressure sources (or an equivalent total-pressure formulation), then re-verify expander cases against hand calculations. Needs evaluation before implementing.
  * **Done**: Tanks and pressure sources are reservoirs at rest. A pipe end the flow leaves a reservoir through takes (1 + K)·ρv²/2 with K = 0.5 (sharp-edged entrance); flow into a reservoir keeps static = reservoir pressure (exit loss K = 1). Verified against hand calculations for 0.1–5 m upstream pipes (`test_pipe_reservoir_entry.py`).

- [x] **🔓 Public Read Access for Pipe Class Catalog**
  * **Problem**: `GET /api/pipe-classes` requires login, while the fitting standards catalog (`GET /api/fitting-standards`) does not.
  * **Fix**: Make all catalog reads (pipe classes, fitting standards) public; keep create / update / delete / import restricted to `admin` and `pipe_manager`. Add tests for anonymous read and for write rejection.

- [x] **📐 DIN Pipe Schedule Standard**
  * **Problem**: Only ASME B36.10M / B36.19M pipe schedules exist, so DIN EN pipe classes (and DIN reducers) fall back to ASME schedule data for lines without a pipe class.
  * **Fix**: Seed a DIN / EN pipe dimension standard (e.g. DIN EN 10220 / ISO 4200 series) as a `pipe_schedule` fitting standard, and use the pipe class's `schedule_standard_code` in the pipe and reducer inspectors instead of the hard-coded ASME table.

- [x] **🔥 Extend Equipment Classes to Model Temperature Changes Due to Pressure Drop**
  * **Scope**: Add or extend `calculate_temperature()` in equipment classes (e.g., `Pipe`, `Orifice`, `Filter`) to model temperature changes due to pressure drop using the formula `ΔT = ΔP / (ρ * Cp)`.
  * **Considerations**:
    - Ensure numerical stability (e.g., handle small flow rates, zero pressure drop).
    - Avoid redundancy (e.g., do not override existing `calculate_temperature()` implementations).
    - Handle bidirectional (or tridirectional for `Mixer`, `ThreeWayTCV`) flow correctly.
    - Always use the correct fluid properties (density, specific heat) for the current temperature and pressure.
    - Minimize performance impact by avoiding expensive calculations in iterative methods.
  * **Important**: The above methodology is only a suggestion and needs to be properly evaluated and adjusted as necessary. Do not implement blindly.
- [x] **⚖️ Parallel Controllers at the Same Setpoint (Non-Unique Flow Split)**
  * **Problem**: Two identical pressure regulators (PRV or BPR) in parallel with the same setpoint have no unique flow split. The controller solve picks one split (least squares), so the result for the two valves is arbitrary although the total is correct.
  * **Fix to evaluate**: Report the pair as "shared control" with an equal split, or add a proportional band (droop) to the regulator model so the split is determined. Needs evaluation before implementing.
  * **Done**: Self-sensing regulators were not affected (the pipe to the shared header fixes the split). Remote control valves sensing the same point now form tiers by setpoint: equal setpoints share one opening (one controller output), the highest PRV / lowest BPR tier regulates, tiers before it run wide open, tiers after it close. Different setpoints used to not converge. No droop, no extra report (`test_regulator_shared_sensing.py`).

- [x] **🌡️ Controller Sensitivity With Temperature-Coupled Loops**
  * **Problem**: The pressure-controller Jacobian is measured with fluid properties frozen. In strongly temperature-coupled loops (large throttling heat in oil systems) the loop converges linearly and needs a few extra iterations, and the solve is slower on the largest diagrams (about 2 s for `walflow-diagram (8)`).
  * **Status (2026-10-15):** the linear convergence on the large network was mostly a Jacobian error and is fixed (B1d/B5: complementarity rows differentiated from the node itself). `Example_Large_Reference_Network` now solves in about 1.3 s (warm). Temperature coupling is still frozen in the perturbed solves; re-measure on a strongly coupled oil loop before closing.
  * **Fix to evaluate**: Include the property update in the perturbed solves only when the previous iteration shows temperature coupling, or reuse the Jacobian between iterations (Broyden update). Measure first; do not trade away robustness.
  * **Evaluated (2026-10-19), not implemented**: Measured on all shipped examples. The frozen-property Jacobian is not what slows the loop down. Without a 3-way TCV (API 682, two controllers with throttling heat) the controllers converge almost quadratically, and the frozen temperatures cost about one iteration (about 5 ms of 43 ms). The slow linear convergence comes from the TCV: its damped update (factor 0.25) moves the mix ratio towards its end stop by a factor 0.75 per iteration, the temperatures follow, and the controllers chase that moving target. With only the TCV damping raised to 1.0, outer iterations drop from 33 to 12 (Large Reference / Case 1), from 22 to 5 (Large Reference / Both Pumps), from 26 to 6 (API 614 / TCV failed open) and from 28 to 3 (Thermal Management / TCV stuck in bypass). All cases still converged. Neither proposed fix touches this: coupled perturbed solves gain at most one iteration, and a Broyden update saves at most about 25 % of the hydraulic solves, but it would also take in the TCV-driven target movement, a robustness risk next to the backtracking and the switches between controller states. Continued under the TCV item below.

- [x] **🔁 Thermal Control Valve Loop Stops Within 0.1 K of Its Setpoint**
  * **Problem**: The 3-way thermal valve loop still uses damped substitution and stops once the outlet is within 0.1 K of the setpoint, so results shift by up to that much (and the minority-branch flow of the valve by tens of percent) depending on iteration history.
  * **Also the main cost in temperature-coupled loops (measured 2026-10-19)**: with damping 0.25 the mix ratio settles geometrically (factor 0.75 per outer iteration), and every pressure controller and the property convergence wait for it. This sets the iteration count of all TCV examples (16 to 33 outer iterations, against 3 to 12 with damping 1.0). The controllers' overshoot backtracking also halves its step repeatedly on the large network while the TCV keeps moving the target. Raising the default damping is not a safe shortcut: the damping is there to keep regulating TCVs from oscillating.
  * **Fix to evaluate**: Solve the thermal valve together with the pressure controllers (same Newton step) with a tighter tolerance, or lower the stop tolerance. This would remove both the setpoint offset and most of the outer iterations.
  * **Done (2026-10-20)**: Measured on all 29 shipped cases and 36 synthetic scenarios (`helpers/tcv_networks.py`, `bench/bench_tcv_loop.py`): setpoint position and out of reach, small inlet ΔT, port roles, inversion, valve authority, water / glycol / oils, cooler loop, PRV / BPR / PSV, TCVs in series and parallel, blocked branch. The real offset was up to 0.5 K: the update aimed at a volumetric flow ratio while the outlet mixes by mass, and saturated valves crept towards their end stop without reaching it. Three variants: lower stop tolerance (more iterations, offset stays), joint Newton with the controllers (accurate but an extra hydraulic solve per TCV and iteration, slower in 3 cases) and a secant step on the outlet error. The secant step won: within 0.01 K or exactly at the end stop in every case, 302 instead of 847 outer iterations, no failures, cases without a TCV unchanged. `damping_factor` is removed. An inverted TCV (hot port colder) still reaches either end stop depending on the start, as before.

- [x] **💤 Undefined Pressure in Stagnant Branches**
  * **Problem**: The pressure of a branch with no flow behind a closed pump or relief device is not defined by the equations. It differs between solver methods (Newton vs LM) and previous runs.
  * **Fix to evaluate**: Define it explicitly (for example equal to the upstream connection) and mark such ports as "stagnant" in telemetry.
  * **Done (2026-10-20)**: After each solve, sections shut in by a stopped PD pump, a check valve without flow or a closed relief device take the pressure behind their strongest leak path (stopped pump to its suction, then check valve, then relief seat), carried through the section at zero flow (pumps keep their shutoff head, regulators their set pressure) and held where no check valve opens and no relief device lifts; ports and pipes carry `stagnant: true`. Pruned nodes are filled the same way from the solved pressures, so nothing passes through a blocking device and no stale value stays. A flow source at zero flow is no pressure reference. Leakage alone does not open a PSV in the relief passes; the unmitigated pass shows the full leak-path pressure. Only shipped case affected: the P-2358B branch of the large reference network (was 0.45 to 5.19 bar(a) depending on method and pass, now tank pressure 1.03 bar(a)). Newton and LM now agree on every port; about 1 ms per solve. Open: temperature in stagnant sections is still undefined; no frontend marker yet.

- [x] **🏷️ Unit-Consistent Node Data Field Names (Format Break)**
  * **Problem**: Node `data` mixes units and naming (`set_pressure` in Pa vs `set_pressure_bar` / `source_pressure_bara` in bar, `flow_rated` vs `flow_rated_lmin`, tank `temperature` in K vs `set_temperature_c` in °C, `orifice_diameter` in m). B5 only documents the fields and tests the parser against that table; no renaming.
  * **Fix**: Rename to one convention (unit suffix on every dimensional field, e.g. `_pa`, `_bar`, `_lmin`, `_c`, `_m`), together with one `migrateDiagram` step for old files. Do it in the same release as the next unavoidable format break (at the latest the 1.0 format bump), not on its own, so users migrate only once.
  * **Benefit**: no silent unit mistakes when adding equipment, simpler parser and inspectors, one converter path.
  * **Done**: Values keep their unit, only the names change (pipe `roughness` in m becomes `roughness_mm`). The file format stays 0.2; 0.2 was not released yet, so files with the old names are not converted. The field tables moved from `docs/node-fields.md` to the `## Data Fields` section of each `backend/simulation/equipment/<type>.md`.

- [x] **📚 Detailed Equipment Documentation**
  * **Problem**: 16 of the equipment documents in `backend/simulation/equipment/` (tank, pumps, control valves, regulator, calibrated restriction, heat exchanger, filter, 3-way TCV, check valves, PSV, rupture disc, splitter, mixer, pipe, base node) are short stubs with an overview and the Data Fields table only.
  * **Fix**: Complete each one per `.claude/skills/equipment-creation/references/equipment-documentation-standard.md` (governing standards, equations and derivatives, thermal balance, parameter table, model boundaries, verification benchmarks), as done for orifice, reducer, pressure source, flow source and measurement tap.
  * **Benefit**: the physics behind every component is traceable for developers and engineering users.
  * **Done (2026-10-21)**: Documentation standard and equipment-creation skill updated (fixed headings, a line for sections that do not apply, benchmarks only from existing test assertions, shared documents). All 22 component documents follow it; new `relief_device.md` holds the shared PSV / rupture disc model and the relief analysis; `base_node.md` holds the solver contract (unknowns, residuals, Jacobian, outer loops, pruning). The open findings are tracked in `EQUIPMENT_FINDINGS.md` until fixed.

- [ ] **⚛️ Upgrade reactflow 11 to @xyflow/react 12**
  * **Problem**: `reactflow` 11 is the legacy package with a peer range of React 17/18, but the app runs on React 19.
  * **Benefits**: supported package on React 19, fewer re-renders per drag frame (v12 measures and updates nodes more efficiently, `useNodesData` / `useStore` selectors), better typed and documented node and edge APIs, server-side rendering and `colorMode` support, and continued security and bug fixes. A memoised v11 (done in B5) removes most of the lag, so this is for long-term maintenance, not urgent.
  * **Effort and risk**: about 2-3 days. Custom nodes, handles, edge types, `onConnect` / `isValidConnection`, context menus and the fit-view logic need re-testing; `node.width/height` becomes `node.measured`.
