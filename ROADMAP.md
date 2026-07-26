# WalFlow Roadmap & Feature Backlog

This document outlines planned features, overlays, and enhancements for the WalFlow hydraulic simulator.

---

## 🎨 Canvas & Overlays

- [ ] **🛡️ Overpressure Safety Zone Overlay (`SafetyBoundsOverlay`)**
  * **Concept:** Boundary shading defining isolated pressure zones across the diagram canvas.
  * **Visuals:** Semi-transparent shaded region boundaries grouped by high-pressure, pilot-pressure, and tank-return lines, with dynamic warning indicators when a low-pressure line experiences excessive pressure.
  * **Engineering Value:** Provides clarity in complex P&ID diagrams with multiple pressure levels (e.g., main supply circuit vs. pilot control circuit vs. drain/tank return).

---

## 💾 State Management & Persistence

- [x] **💾 Dual-Mode Session Auto-Save & Cloud Project Sync (`AutoSaveSessionManager`)**
  * **Concept:** Automatic local state persistence ensuring users never lose working progress when browser windows refresh, alongside seamless auto-sync to backend database projects when an active cloud project is selected.

### 1. Dual-Mode Persistence Architecture
* **Mode 1: Temporary Local Session Draft (No Project Selected)**
  * Captures active workspace context (nodes, edges, viewport, fluid settings, operating cases).
  * Automatically cached in browser `localStorage` (`walflow_active_session_draft`) debounced at **1000ms** + `beforeunload` listener.
  * Hydrates seamlessly on startup with a restoration toast notification.
* **Mode 2: Active Cloud Project Auto-Sync (Project Opened / Selected)**
  * Selected or newly created cloud project in `ProjectManagerModal` tracks as `activeProject`.
  * Canvas changes automatically sync to FastAPI server (`PUT /api/diagrams/{id}`) debounced at **2000ms**.
  * Visual live navbar status pills:
    * `🟢 Saved to cloud (Project: Title)` — All changes synced to database.
    * `🟠 Saving to cloud...` — Sync request in progress.
    * `🟢 Saved to browser (Draft)` — All changes cached locally in browser.
    * `🟠 Saving draft...` — Local draft save in progress.
    * `⚠️ Sync error` — Network error or backend offline.

### 2. State Scope & Recovery Targets
The auto-save mechanism captures the complete workspace context:
* **Canvas Topography:** Nodes, edges, connections, custom text labels, and canvas annotations.
* **Visual Framing:** Canvas pan `(x, y)` position and zoom level (`zoom`) so visual context is maintained exactly.
* **Simulation & Parameter State:** Global fluid parameters (fluid type, temperature, viscosity), solver configurations, and active operating case selection.
* **UI & Workspace State:** Selected node focus and open sidebar inspector panel state.

### 3. Data Schema & Persistence Payload
```json
{
  "file_format_version": "0.1",
  "app_version": "0.1.1",
  "timestamp": "2026-07-26T10:00:00Z",
  "active_project_id": "proj_12345",
  "viewport": { "x": 120.5, "y": -45.0, "zoom": 1.25 },
  "active_case_id": "case_base",
  "cases": [ /* Active operating cases & overrides */ ],
  "nodes": [ /* Canvas nodes & parameters */ ],
  "edges": [ /* Canvas edges & connections */ ],
  "global_fluid": { /* Global fluid properties */ }
}
```

---

## 📁 Project Management & Collaboration

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

- [ ] **🛡️ Pressure Safety Relief Valve (PSV / PRV)**
  * **Concept:** Spring-loaded safety valve with adjustable cracking pressure setpoint and full-flow blowdown pressure dynamics.
  * **Physics:** Automatically opens when upstream pressure exceeds the set threshold to vent fluid into a drain/tank line, snapping shut when pressure drops back into safe operating bounds.
  * **Engineering Value:** Protects downstream piping, pumps, and heat exchangers from catastrophic overpressure.

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


