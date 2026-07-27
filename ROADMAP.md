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

- [ ] **📁 Multi-PFD Diagrams per Project Container**
  * **Concept:** Expand `ProjectManagerModal` and workspace model so a single Project container can store multiple PFD diagrams (e.g. Main Loop, Pilot System, Lube Subsystem).
  * **Architecture:** Projects will act as top-level parent entities containing an array of PFD diagrams, accessible via tabbed navigation within the workspace.

- [ ] **👥 Shared Project Access & Multi-User Collaboration**
  * **Concept:** Project owners can share project access with other registered WalFlow users via email/username invites with role-based access control.
  * **Permissions Matrix:**
    * **Owner:** Full management, deletion, and sharing permissions.
    * **Editor:** Real-time editing and auto-sync to project PFDs.
    * **Viewer:** Read-only canvas access and simulation execution.

---

## ⚙️ Physics & Simulation

### 🧰 New Equipment & Component Additions

- [ ] **🌊 Universal Fluid Source (`FluidSource`)**
  * **Concept:** Single fluid supply component featuring an active mode selector:
    * **Constant Pressure Mode (bar):** Fixed pressure Dirichlet boundary condition (e.g. plant water main, utility header).
    * **Constant Flow Mode (L/min):** Fixed flow rate Neumann boundary condition (e.g. dosing pump, regulated feed line).
  * **Physics:** Backend graph parser inspects `source_type` property and dynamically registers either a pressure or flow constraint in the SciPy linear solver matrix.
  * **Engineering Value:** Compact component palette and seamless toggling between pressure-driven and flow-driven supply scenarios without re-piping.

- [ ] **🛡️ Pressure Safety Relief Valve (`PSV` / `PRV`) & Emergency Relief Analysis**
  * **Concept:** Emergency pressure relief valve featuring action mode toggles, capacity sizing metrics, dual-pass safety analysis, and global workspace telemetry mode switching.
  * **Action Modes (Property Dropdown):**
    * **Pop Action (Snap-Open):** Snaps 100% open at $P_{\text{set}}$ with adjustable blowdown reset percentage (e.g. 7–10%).
    * **Modulating (Proportional):** Throttles lift proportionally based on overpressure above $P_{\text{set}}$.
    * **Rupture Disc:** Mechanical pressure relief diaphragm. Evaluates as intact at the start of each simulation run; if burst pressure ($P_{\text{burst}}$) is reached, it bursts 100% open for that run.
  * **Dual-Pass Safety Analysis & Multi-PSV Contingency:**
    * **Mitigated Relief Pass:** Calculates operating pressure, relief flow rate ($Q_{\text{relief}}$), and relief line backpressure.
    * **Global Unmitigated Pass (All PSVs Locked Closed):** Calculates worst-case hydrostatic overpressure potential across all system nodes if relief protection fails completely.
    * **Targeted PSV Failure ($N-1$ Contingency):** Selectable failure check in PSV inspector (`Simulate Failure of: [ Tag ]`) to analyze localized overpressure when specific valves fail to pop.
    * **Relief Capacity Sizing:** Computes orifice capacity utilization percentage ($Q_{\text{actual}} / Q_{\text{rated}}$) to verify if the PSV can handle incoming flow without exceeding allowable accumulation.
  * **Global Telemetry Mode Switcher & Visual Indicators:**
    * **Navbar Global Mode Toggle:** Prominent top Navbar control (`[ 🟢 Mitigated (Normal) ]` vs `[ 🔴 Unmitigated (Overpressure Mode) ]`) that globally switches telemetry across the entire workspace:
      * **Canvas Lines & Badges:** Displays unmitigated line pressures, velocities, and tooltips on all canvas components.
      * **Heatmap Overlays:** Recolors pipe gradients to highlight overpressurized headers.
      * **Bottom Data Panel (DataList):** Updates process value tables, pressure drops, and operating cases matrix to display unmitigated state metrics.
    * **PSV Canvas Badges:**
      * 🟢 **CLOSED (Sealed)** — Normal operation ($P < P_{\text{set}}$).
      * 🟡 **CRACKED / RELIEVING** — Active relief discharge ($P \ge P_{\text{set}}$).
      * 🔴 **OVERCAPACITY / OVERPRESSURE** — Undersized PSV ($Q_{\text{incoming}} > Q_{\text{rated}}$).
  * **Engineering Value:** Enables true P&ID overpressure safety compliance, relief capacity sizing, and HAZOP failure analysis without manually re-piping or disabling components.

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
    * ☒ **Pressure ($P$):** Static line pressure (bar / PSI).
    * ☒ **Flow Rate ($Q$):** Volumetric flow (L/min, m³/h, GPM).
    * ☒ **Temperature ($T$):** Operating fluid temperature (°C / °F).
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

- [ ] **🐛 Case Variable Reset & Base Value Equivalence Check (`Case Resolver`)**
  * **Issue:** Manually editing a case variable in a secondary operating case back to match the exact value of the Base Case does not reset or remove the case override. The `⚡ Case Variable` badge remains highlighted in the Property Editor and canvas inspectors.
  * **Planned Fix:** Update `updateCaseOverride` (or property change handlers) to perform a base-equivalence check: if a new case variable value equals the base case value (within numeric tolerance for floating-point numbers or exact match for strings/enums), automatically invoke `removeCaseOverride` to clear the override.

- [x] **🐛 Duplicate Edge/Pipe ID Sanitization Guard (`Example PFD Template Fix`)**
  * **Fix Summary:** Audited and sanitized all 10 `.wlf` example files. Implemented an automated **ID Deduplication Guard** inside `loadData()` in `App.jsx` that automatically resolves duplicate node/edge IDs upon diagram loading/importing.



