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

- [ ] **🔥 Extend Equipment Classes to Model Temperature Changes Due to Pressure Drop**
  * **Scope**: Add or extend `calculate_temperature()` in equipment classes (e.g., `Pipe`, `Orifice`, `Filter`) to model temperature changes due to pressure drop using the formula `ΔT = ΔP / (ρ * Cp)`.
  * **Considerations**:
    - Ensure numerical stability (e.g., handle small flow rates, zero pressure drop).
    - Avoid redundancy (e.g., do not override existing `calculate_temperature()` implementations).
    - Handle bidirectional (or tridirectional for `Mixer`, `ThreeWayTCV`) flow correctly.
    - Always use the correct fluid properties (density, specific heat) for the current temperature and pressure.
    - Minimize performance impact by avoiding expensive calculations in iterative methods.
  * **Important**: The above methodology is only a suggestion and needs to be properly evaluated and adjusted as necessary. Do not implement blindly.