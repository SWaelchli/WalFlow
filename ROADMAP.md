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

- [ ] **⛰️ Pipe Elevation & Fittings Losses (audit F1-17)**
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
  * **Today (audit F5-01, 2026-10-16):** a port takes one pipe. A line that branches needs a splitter or mixer; separate nozzles are modelled with a second tank at the same level and conditions. The solver already treats a tank or pressure source as one fixed-pressure node, so extra ports mainly need the node component, the port table in `networkValidation.js` (`PORTS_BY_TYPE`) and the parser.
  * **Engineering Value:** Drawings that match the P&ID without helper tanks or splitters.

- [ ] **🚦 Plausibility Warnings (audit F3-05)**
  * **Concept:** Non-blocking result warnings, shown in the status chip panel and the result banners: centrifugal pump run-out and minimum flow (% of rated / BEP), pipe velocity above a limit per service (e.g. suction, discharge, return), operating pressure or temperature above the pipe class P-T rating, and fluid temperature outside the property data range (`temperature_out_of_range` is already in `physical_validity`).
  * **Status (B4a decision, 2026-10-15):** moved out of the audit. The backend flags for NPSH (F1-28), fluid range (F1-31) and motor overload (F1-36) exist; thresholds (velocity limits, % of rated flow) need a decision before building the UI.

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

- [ ] **📍 In-Line Measurement Point & Instrumentation Bubble (`MeasurePoint`)**
  * **Concept:** Passive, zero-resistance pass-through sensor (1 Inlet, 1 Outlet) for monitoring local hydraulic process conditions without altering circuit physics ($P_{\text{in}} = P_{\text{out}}$, $Q_{\text{in}} = Q_{\text{out}}$).
  * **Selectable Measurements (Property Panel Checkboxes):**
    * ☐ **Pressure ($P$):** Static line pressure (bar / PSI).
    * ☐ **Flow Rate ($Q$):** Volumetric flow (L/min, m³/h, GPM).
    * ☐ **Temperature ($T$):** Operating fluid temperature (°C / °F).
    * ☐ **Fluid Velocity ($v$):** Velocity through sensor bore (m/s) for pipe erosion/sizing checks.
    * ☐ **Kinematic Viscosity ($\nu$):** Live viscosity (cSt) adjusted for operating temperature.
    * ☐ **Reynolds Number ($Re$):** Flow regime diagnostic (Laminar / Transition / Turbulent).
  * **Configurable 4-Tier Industrial Alarms (per parameter):**
    * 🔴 **HH (High-High):** Critical high trip threshold (Emergency Red).
    * 🟠 **H (High):** Warning high threshold (Caution Amber/Orange).
    * 🟠 **L (Low):** Warning low threshold (Caution Amber/Orange).
    * 🔴 **LL (Low-Low):** Critical low trip threshold (Emergency Red).
  * **Visuals & Canvas Display:**
    * ISA-style instrumentation bubble on the canvas (e.g. `PIT`, `FIT`, `TIT`).
    * Configurable live numerical callout badge under the symbol displaying all active checked measurements.
    * Real-time visual alarm state: badge dynamically highlights in **Orange** (H/L Warning) or **Red** (HH/LL Critical Trip) when thresholds are breached.
  * **Engineering Value:** Enables clean P&ID telemetry tapping, custom monitoring locations, and standard industrial alarm indication across complex circuits (e.g. API 614 lube oil supply headers and filter differential monitoring).

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

- [ ] **🔀 Expander Solvability Near Reservoirs (Static Pressure Model)**
  * **Problem**: With the static pressure model, only the Reducer node accounts for velocity head. An expander (e.g. DN50 → DN80) with a short pipe (< ~1.5 m) to a tank or pressure source recovers more static pressure than the system loses, so no steady-state solution exists and the solver reports non-convergence. Reducing flow (contraction) is unaffected.
  * **Fix to evaluate**: Add entry / exit losses and velocity-head handling at tanks and pressure sources (or an equivalent total-pressure formulation), then re-verify expander cases against hand calculations. Needs evaluation before implementing.

- [x] **🔓 Public Read Access for Pipe Class Catalog**
  * **Problem**: `GET /api/pipe-classes` requires login, while the fitting standards catalog (`GET /api/fitting-standards`) does not.
  * **Fix**: Make all catalog reads (pipe classes, fitting standards) public; keep create / update / delete / import restricted to `admin` and `pipe_manager`. Add tests for anonymous read and for write rejection.

- [ ] **📐 DIN Pipe Schedule Standard**
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
- [ ] **⚖️ Parallel Controllers at the Same Setpoint (Non-Unique Flow Split)**
  * **Problem**: Two identical pressure regulators (PRV or BPR) in parallel with the same setpoint have no unique flow split. The controller solve picks one split (least squares), so the result for the two valves is arbitrary although the total is correct.
  * **Fix to evaluate**: Report the pair as "shared control" with an equal split, or add a proportional band (droop) to the regulator model so the split is determined. Needs evaluation before implementing.

- [ ] **🌡️ Controller Sensitivity With Temperature-Coupled Loops**
  * **Problem**: The pressure-controller Jacobian is measured with fluid properties frozen. In strongly temperature-coupled loops (large throttling heat in oil systems) the loop converges linearly and needs a few extra iterations, and the solve is slower on the largest diagrams (about 2 s for `walflow-diagram (8)`).
  * **Status (2026-10-15):** the linear convergence on the large network was mostly a Jacobian error and is fixed (B1d/B5: complementarity rows differentiated from the node itself). `Example_Large_Reference_Network` now solves in about 1.3 s (warm). Temperature coupling is still frozen in the perturbed solves; re-measure on a strongly coupled oil loop before closing.
  * **Fix to evaluate**: Include the property update in the perturbed solves only when the previous iteration shows temperature coupling, or reuse the Jacobian between iterations (Broyden update). Measure first; do not trade away robustness.

- [ ] **🔁 Thermal Control Valve Loop Stops Within 0.1 K of Its Setpoint**
  * **Problem**: The 3-way thermal valve loop still uses damped substitution and stops once the outlet is within 0.1 K of the setpoint, so results shift by up to that much (and the minority-branch flow of the valve by tens of percent) depending on iteration history.
  * **Fix to evaluate**: Solve the thermal valve together with the pressure controllers (same Newton step) with a tighter tolerance, or lower the stop tolerance.

- [ ] **💤 Undefined Pressure in Stagnant Branches**
  * **Problem**: The pressure of a branch with no flow behind a closed pump or relief device is not defined by the equations. It differs between solver methods (Newton vs LM) and previous runs.
  * **Fix to evaluate**: Define it explicitly (for example equal to the upstream connection) and mark such ports as "stagnant" in telemetry.

- [ ] **🏷️ Unit-Consistent Node Data Field Names (Format Break)**
  * **Problem**: Node `data` mixes units and naming (`set_pressure` in Pa vs `set_pressure_bar` / `source_pressure_bara` in bar, `flow_rated` vs `flow_rated_lmin`, tank `temperature` in K vs `set_temperature_c` in °C, `orifice_diameter` in m). Audit F1-20. B5 only documents the fields and tests the parser against that table; no renaming.
  * **Fix**: Rename to one convention (unit suffix on every dimensional field, e.g. `_pa`, `_bar`, `_lmin`, `_c`, `_m`), together with one `migrateDiagram` step for old files. Do it in the same release as the next unavoidable format break (at the latest the 1.0 format bump), not on its own, so users migrate only once.
  * **Benefit**: no silent unit mistakes when adding equipment, simpler parser and inspectors, one converter path.

- [ ] **⚛️ Upgrade reactflow 11 to @xyflow/react 12**
  * **Problem**: `reactflow` 11 is the legacy package with a peer range of React 17/18, but the app runs on React 19. Audit F2-28.
  * **Benefits**: supported package on React 19, fewer re-renders per drag frame (v12 measures and updates nodes more efficiently, `useNodesData` / `useStore` selectors), better typed and documented node and edge APIs, server-side rendering and `colorMode` support, and continued security and bug fixes. A memoised v11 (done in B5) removes most of the lag, so this is for long-term maintenance, not urgent.
  * **Effort and risk**: about 2-3 days. Custom nodes, handles, edge types, `onConnect` / `isValidConnection`, context menus and the fit-view logic need re-testing; `node.width/height` becomes `node.measured`.
