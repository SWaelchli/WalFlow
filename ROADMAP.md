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

- [ ] **💾 Canvas Session Auto-Save & Refresh State Recovery (`AutoSaveSessionManager`)**
  * **Concept:** Automatic local state persistence ensuring users never lose working progress when the browser window is refreshed, navigated away from, or accidentally closed.

### 1. Real-World Motivation & Use Cases
Currently, refreshing the browser window (F5), closing a tab, or experiencing a browser crash resets the application to the default start canvas, causing total loss of unsaved diagrams and component configurations. Implementing seamless session auto-save guarantees that the exact workspace state is preserved and automatically reloaded on refresh.

### 2. State Scope & Recovery Targets
The auto-save mechanism captures the complete workspace context:
* **Canvas Topography:** Nodes, edges, connections, custom text labels, and canvas annotations.
* **Visual Framing:** Canvas pan `(x, y)` position and zoom level (`zoom`) so visual context is maintained exactly.
* **Simulation & Parameter State:** Global fluid parameters (fluid type, temperature, viscosity), solver configurations, and active operating case selection.
* **UI & Workspace State:** Selected node focus and open sidebar inspector panel state.

### 3. Technical Architecture & Persistence Strategy
* **Storage Engine:** Browser `localStorage` (with fallback to `IndexedDB` for large diagrams).
  * Storage Key: `walflow_active_session_draft`
  * Debounced Writes: Saves state to local browser storage automatically 1000ms after the user stops making canvas or property edits.
* **Unload Hook:** Registers a `beforeunload` event handler for an instant synchronous write right before browser tab teardown or refresh.
* **Hydration on Startup:** On application startup (`App.jsx`), WalFlow checks for a valid saved draft in `localStorage`. If found, it hydrates the ReactFlow diagram, viewport, fluid settings, and active operating case instead of rendering the blank start canvas.

### 4. User Interface & Visual Design Concept
Following WalFlow design tokens (Teal `#395253`, Orange `#FA8507`, Light Surface `#F4F7F6`):
* **A. Top Header Auto-Save Pill:**
  * Displays a live status badge next to diagram controls:
    * `🟢 Saved to browser` — All current changes safely cached locally.
    * `🟠 Auto-saving...` — Debounced save in progress.
    * `⚠️ Unsaved changes` — Active draft differs from loaded named project file.
* **B. Discard / Reset Action:**
  * Integrated into the `Clear Canvas` action modal: Option to "Clear Canvas & Purge Cached Session", enabling users to start completely fresh when desired.
* **C. Recovery Toast Notification:**
  * Brief toast notification on refresh confirming: `"Restored unsaved session from [Timestamp]"`.

### 5. Data Schema & Persistence Payload
```json
{
  "file_format_version": "0.1",
  "app_version": "0.1.1",
  "timestamp": "2026-07-25T16:35:00Z",
  "viewport": { "x": 120.5, "y": -45.0, "zoom": 1.25 },
  "active_case_id": "case_base",
  "cases": [ /* Active operating cases & overrides */ ],
  "nodes": [ /* Canvas nodes & parameters */ ],
  "edges": [ /* Canvas edges & connections */ ],
  "global_fluid": { /* Global fluid properties */ },
  "ui_state": {
    "sidebar_tab": "components",
    "selected_node_id": "node_pump_1"
  }
}
```

### 6. Phased Implementation Plan

- [ ] **Phase 1: Debounced Persistence Engine & Hook**
  * Create `useAutoSave` hook subscribing to state changes (ReactFlow nodes/edges, viewport, fluid settings, active case).
  * Implement debounced storage writer (1000ms delay) targeting `localStorage` with `file_format_version` sanity check.
  * Add `beforeunload` event listener for sync saving prior to page unload/refresh.

- [ ] **Phase 2: Hydration & Startup Restoration Logic**
  * Modify app initialization to check for existing draft payload on boot.
  * Hydrate nodes, edges, viewport position/zoom, fluid parameters, and operating cases seamlessly before mounting the canvas.

- [ ] **Phase 3: UI Indicators & Session Reset Controls**
  * Add live "Saved to browser" status badge in the top header navbar.
  * Update `Clear Canvas` workflow to allow purging local session cache.
  * Add restoration toast notification confirming restored state timestamp on page reload.

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

