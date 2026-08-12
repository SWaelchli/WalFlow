# WalFlow Roadmap & Feature Backlog

This document outlines planned features, overlays, and enhancements for the WalFlow hydraulic simulator.

---

## 🚀 Production Readiness & QA Audit Actions

> [!NOTE]
> This section tracks actionable items identified in the [Master QA Synthesis & Audit Report](file:///c:/Users/c563871/Coding/WalFlow/qa_report/QA_SUMMARY_REPORT.md) (App version `0.1.3`).
> Future AI agents and developers should refer directly to the detailed reports in `qa_report/` (including `engineering`, `ui`, `performance`, and `security` sub-folders) to implement these changes correctly and efficiently.
> Once all of these changes are implemented, the `qa_report/` directory can be deleted.

- [x] **⚠️ [URGENT] Block application start if `WALFLOW_SECRET_KEY` is missing in production** (SEC-01)
  * **Scope**: Modify `backend/main.py` or initialization scripts to detect if the environment is production and abort starting the application if the default development fallback secret key is in use.
- [x] **⚠️ [URGENT] Enforce `WALFLOW_REQUIRE_WS_AUTH=true` by default** (SEC-02)
  * **Scope**: Change the default behavior of the backend WebSocket simulation authentication so that it requires authentication by default unless explicitly disabled, preventing unauthorized simulation triggers.
- [x] **⚠️ [URGENT] Refactor `useWebSocketSimulation.js` with `useRef` to eliminate socket churn** (R3 / Performance)
  * **Scope**: Redesign the WebSocket hook connection lifecycle so that changing `telemetryMode` or `activeCaseId` updates refs rather than tearing down and recreating the WebSocket, eliminating socket connection churn.
- [ ] **🇺🇸 Implement Imperial/US Customary unit conversions** (R2 / UI)
  * **Scope**: Expand `frontend/src/utils/converters.js` to implement conversions for `psi`, `gpm`, `m³/h`, and `HP`, and update the UI controls (PropertyEditor, Sidebar, etc.) to display them correctly.
- [ ] **🌐 Build global unit system selector (SI vs Imperial) in the top navbar** (R2 / UI)
  * **Scope**: Add a global unit switch toggler to the navbar that propagates selected system units (Metric SI vs Imperial US) across the application panels and tooltips.
- [x] **⚡ Implement analytical sparse Jacobian calculation in the backend solver** (R3 / Performance)
  * **Scope**: Derive and implement analytical derivatives for equipment equations to calculate the sparse Jacobian directly, instead of using finite differences.
- [x] **🏎️ Transition to `scipy.sparse` Newton-Krylov solver** (R3 / Performance)
  * **Scope**: Integrate a sparse Newton-Krylov solver to scale calculations efficiently, reducing solver execution times for 100+ nodes to less than 200ms.
- [x] **🌡️ Implement Warm-Start Initial State Vector Caching** (R3 / Performance)
  * **Scope**: Cache the converged solution vector $x_{conv}$ from the previous simulation run. When a user adjusts a valve slider or operating case, reuse $x_{conv}$ as the initial guess $x_0$ to reduce iteration count (targeting >80% reduction). Additionally, ensure the caching scheme is compatible with and optimized for batch solving (the operating cases matrix) by storing case-specific converged state vectors to seed consecutive batch sweeps.
- [ ] **🔐 Enforce 8-character password policy & reduce JWT lifespan to 60 minutes** (SEC-03 / SEC-04)
  * **Scope**: Increase minimum password length validation to 8 characters and reduce JWT token expiration duration from 7 days to 60 minutes for higher account security.
- [ ] **🚫 Implement in-memory/Redis JWT revocation blacklist on logout** (SEC-03)
  * **Scope**: Keep track of logged-out token identifiers in an in-memory storage (e.g. Redis) to invalidate stateless JWT sessions immediately upon logout.
- [ ] **🧹 Sanitize backend exception handlers to strip stack traces from client payloads** (SEC-06)
  * **Scope**: Catch raw backend exceptions and format standard user-friendly messages for client payloads, stripping internal code stack traces and database paths to prevent data leakage.
- [ ] **🛑 Add rate-limiting middleware (slowapi) to endpoints** (R4 / Security)
  * **Scope**: Add rate limit restrictions to authentication (`/login`, `/register`) and simulation endpoints to prevent automated brute-force attacks and CPU-exhaustion DoS.

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

- [x] **🐛 Three-Way Temperature Control Valve (TCV) Hot-Side Bias Fix**
  * **Issue**: When the outlet temperature is below the setpoint, the TCV adjusts flow from the cold side to the outlet if the cold side is hotter than the hot side. This is incorrect behavior for a TCV.
  * **Expected Behavior**: The TCV must always open the hot side to the outlet when the outlet temperature is below the setpoint, regardless of the relative temperatures of the hot and cold inlets.

- [ ] **🔥 Extend Equipment Classes to Model Temperature Changes Due to Pressure Drop**
  * **Scope**: Add or extend `calculate_temperature()` in equipment classes (e.g., `Pipe`, `Orifice`, `Filter`) to model temperature changes due to pressure drop using the formula `ΔT = ΔP / (ρ * Cp)`.
  * **Considerations**:
    - Ensure numerical stability (e.g., handle small flow rates, zero pressure drop).
    - Avoid redundancy (e.g., do not override existing `calculate_temperature()` implementations).
    - Handle bidirectional (or tridirectional for `Mixer`, `ThreeWayTCV`) flow correctly.
    - Always use the correct fluid properties (density, specific heat) for the current temperature and pressure.
    - Minimize performance impact by avoiding expensive calculations in iterative methods.
  * **Important**: The above methodology is only a suggestion and needs to be properly evaluated and adjusted as necessary. Do not implement blindly.


## Quality of Life improvements

- [x] ** Add shortcuts to all Modals to allow to exit this modal with "ESC". Except for the Admin setup modal. This cannot be skipped.