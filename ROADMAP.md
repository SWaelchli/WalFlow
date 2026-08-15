# WalFlow Roadmap & Feature Backlog

This document outlines planned features, overlays, and enhancements for the WalFlow hydraulic simulator.

---

## 🚀 Production Readiness & QA Audit Actions

> [!NOTE]
> All actionable items identified in the Master QA Synthesis & Audit Report (App version `0.1.3`) have been fully implemented and verified. The temporary `qa_report/` directory has been retired and deleted.

- [x] **🔐 Enforce 8-character password policy & reduce JWT lifespan to 60 minutes with sliding session renewal** (SEC-03 / SEC-04)
  * **Scope**: Increase minimum password length validation to 8 characters and reduce JWT token expiration duration from 7 days to 60 minutes with background sliding refresh during active use for higher account security.
- [x] **🚫 Implement in-memory/Redis JWT revocation blacklist on logout** (SEC-03)
  * **Scope**: Keep track of logged-out token identifiers in an in-memory storage (with Redis support) to invalidate JWT sessions immediately upon logout.
- [x] **🧹 Sanitize backend exception handlers to strip stack traces from client payloads** (SEC-06)
  * **Scope**: Catch raw backend exceptions and format standard user-friendly messages for client payloads, stripping internal code stack traces and database paths to prevent data leakage.
- [x] **🛑 Add rate-limiting middleware (slowapi) to endpoints** (R4 / Security)
  * **Scope**: Add rate limit restrictions to authentication (`/login`, `/register`, `/setup-admin`) and simulation endpoints to prevent automated brute-force attacks and CPU-exhaustion DoS.

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

### 💧 Multi-Fluid Simulation & Boundary Fluid Selection

- [ ] **💧 Per-Boundary Fluid Selection, Multi-Fluid Topological Domain Propagation & Fluid Mixing Abort**
  * **Concept:** Transition from a single drawing-wide system fluid to per-boundary fluid assignment, allowing complex P&IDs with multiple independent hydraulic circuits (e.g. an ISO VG 46 lube oil lubrication loop and a chilled water cooling loop) to solve simultaneously on a single canvas.
  * **Core Engineering & Physics Architecture:**
    * **Boundary Fluid Selection**: Boundary components (`Tank`, `PressureSource`, `FlowSource`) can explicitly assign a fluid (e.g. Water, Seawater, Glycol 30%/50%, ISO VG 15/22/32/46/68, Diesel) or choose `Inherit Primary Fluid` (`system`).
    * **Primary System Fluid Fallback**: Canvas-level Global Settings dropdown renamed from "System Fluid" to "Primary System Fluid", acting as the default fallback for newly placed boundaries and closed circuits lacking explicit boundary sources.
    * **Topological Domain Propagation**: A pre-simulation graph analysis traces hydraulic fluid domains across connected nodes and pipes. Heat Exchangers maintain isolated internal passages (channel 1 vs. channel 2) to permit separate fluids (e.g. oil on tube side, water on shell side) without cross-contamination.
    * **Fluid Mixing Detection & Abort**: Because the static solver does not model dynamic miscible fluid blending, if streams carrying different fluids intersect or meet at any node/junction, the pre-solve checker immediately halts the simulation and returns a descriptive error naming the conflicting components, pipe IDs, and fluid names, triggering an actionable UI warning modal.
    * **Multi-Domain Steady-State Physics**: When multiple independent loops coexist, each equipment node and pipe evaluates its physical equations ($\rho, \mu, C_p$, vapor pressure, $\Delta P$, friction factor, pump curves, cavitation margins) using its domain's assigned fluid properties.
  * **UI & Visual Representation:**
    * **Fluid Heatmap Mode**: Adds a dedicated "Fluid Type" heatmap mode (`fluid`) assigning high-contrast, distinct colors per fluid (e.g., Electric Blue for Water, Warm Amber for ISO VG oils, Bright Teal for Glycols, Coral for Fuels).
    * **Active Fluids Heatmap Legend**: In Fluid heatmap mode, the overlay legend displays discrete swatches showing only the fluids actively present on the canvas.
    * **DataList Tables**: Adds a dedicated **Fluid** column to both the **Pipe Network List** and **Full Equipment & Pipeline Data** tables (with filter, sort, and CSV export support).
    * **Component Panels**:
      - **Sidebar**: Renames "System Fluid" to "Primary System Fluid".
      - **SetupPanel**: Adds fluid dropdown to `Tank`, `PressureSource`, and `FlowSource` with `Inherit Primary Fluid ([Current Fluid])` as the default option.
      - **InspectorPanel & Telemetry**: Displays assigned fluid type and localized physical properties for selected pipes and nodes.
  * **Target Files & Key Modifications:**
    * `backend/simulation/equipment/tank.py`, `pressure_source.py`, `flow_source.py`: Support `fluid_type` parameter and port property assignment.
    * `backend/simulation/graph_parser.py`: Multi-domain graph propagation, Heat Exchanger channel isolation, and `FluidMixingError` detection.
    * `backend/simulation/solver.py`: Domain-aware property propagation and telemetry enrichment (`fluid_type`, `fluid_name`).
    * `backend/simulation/fluid_utils.py`: Color token definitions and catalog metadata.
    * `backend/tests/test_physics_multi_fluid.py`: Unit tests for multi-loop solves, boundary inheritance, and mixing aborts.
    * `frontend/src/App.jsx`: State management, mixing abort handling, and heatmap mode registration.
    * `frontend/src/edges/PipeEdge.jsx`: Fluid color-mapping logic in `getHeatmapColor`.
    * `frontend/src/components/overlays/HeatmapLegend.jsx`: Fluid mode tab and active-fluids legend swatches.
    * `frontend/src/components/panels/DataList.jsx`: Fluid column addition in Pipe Network and Equipment lists.
    * `frontend/src/components/panels/Sidebar.jsx` & `SetupPanel.jsx`: Dropdown selectors and labels.

### 🧰 New Equipment & Component Additions

- [ ] 🔬 **Relief Device Capacity Sizing Investigation (PSVs & Rupture Discs)**
  * **Concept:** Detailed technical investigation into industry standard methodologies (e.g. API 520/526, ISO 4126, ASME Section VIII) for determining rated relief capacity ($Q_{\text{rated}}$), allowable overpressure accumulation (e.g., 10% for non-fire, 21% for fire case), and liquid vs. gas $C_v$ / coefficient of discharge ($K_d$) orifice sizing models across relief valves and burst diaphragms.
  * **Goal:** Determine standard formulas and reference pressure drops ($\Delta P_{\text{ref}}$) for assessing capacity utilization percentage ($Q_{\text{actual}} / Q_{\text{rated}}$) and overcapacity alerts for both incompressible liquids and compressible gases.

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

- [ ] **🔀 Reducer / Expander (Area Transition w/ ASME B16.9 Database)**
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

- [ ] **🔥 Extend Equipment Classes to Model Temperature Changes Due to Pressure Drop**
  * **Scope**: Add or extend `calculate_temperature()` in equipment classes (e.g., `Pipe`, `Orifice`, `Filter`) to model temperature changes due to pressure drop using the formula `ΔT = ΔP / (ρ * Cp)`.
  * **Considerations**:
    - Ensure numerical stability (e.g., handle small flow rates, zero pressure drop).
    - Avoid redundancy (e.g., do not override existing `calculate_temperature()` implementations).
    - Handle bidirectional (or tridirectional for `Mixer`, `ThreeWayTCV`) flow correctly.
    - Always use the correct fluid properties (density, specific heat) for the current temperature and pressure.
    - Minimize performance impact by avoiding expensive calculations in iterative methods.
  * **Important**: The above methodology is only a suggestion and needs to be properly evaluated and adjusted as necessary. Do not implement blindly.