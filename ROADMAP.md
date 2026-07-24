# WalFlow Roadmap & Feature Backlog

This document outlines planned features, overlays, and enhancements for the WalFlow hydraulic simulator.

---

## 🎨 Canvas & Overlays

- [ ] **🛡️ Overpressure Safety Zone Overlay (`SafetyBoundsOverlay`)**
  * **Concept:** Boundary shading defining isolated pressure zones across the diagram canvas.
  * **Visuals:** Semi-transparent shaded region boundaries grouped by high-pressure, pilot-pressure, and tank-return lines, with dynamic warning indicators when a low-pressure line experiences excessive pressure.
  * **Engineering Value:** Provides clarity in complex P&ID diagrams with multiple pressure levels (e.g., main supply circuit vs. pilot control circuit vs. drain/tank return).

---

## ⚙️ Physics & Simulation

### 🧰 New Equipment & Component Additions

- [ ] **🛡️ Pressure Safety Relief Valve (PSV / PRV)**
  * **Concept:** Spring-loaded safety valve with adjustable cracking pressure setpoint and full-flow blowdown pressure dynamics.
  * **Physics:** Automatically opens when upstream pressure exceeds the set threshold to vent fluid into a drain/tank line, snapping shut when pressure drops back into safe operating bounds.
  * **Engineering Value:** Protects downstream piping, pumps, and heat exchangers from catastrophic overpressure.

- [ ] **🎛️ Advanced Control Valve (Custom $C_v$ Trim Curves)**
  * **Concept:** Throttling flow control valve supporting custom inherent flow characteristics (Equal Percentage, Quick Opening, and Linear trims).
  * **Physics:** Computes effective flow coefficient $C_v(x)$ dynamic curves based on valve stem opening percentage $x$, with optional choked flow detection for compressible/high-$\Delta P$ regimes.
  * **Engineering Value:** Enables accurate modeling of dynamic process control loops, valve sizing, and loop gain linearity across varying valve positions.

---

- [ ] **🎛️ Operating Case Manager (Multi-Case Scenario Engine)**
  * **Concept:** Allows users to create and simulate multiple operating cases (scenarios) on a single PFD/diagram. All operating cases share identical physical hardware and pipe network topology, while allowing overrides for dynamic operating parameters (temperatures, valve openings, filter blockage, VFD speeds).

### 1. Real-World Engineering Motivation & Use Cases
In industrial hydraulics, physical hardware (pipes, pump displacement, tank geometries, orifice sizes) is fixed upon construction. However, dynamic operating boundary conditions fluctuate dramatically.

| Operating Case | Real-World Context & Engineering Purpose |
| :--- | :--- |
| **Normal / Design Case (NOC)** | Baseline continuous duty (e.g., 40°C ISO VG 46 oil, clean filters, control valves at 70%). |
| **Cold Start / Winter Case** | Low ambient temp (e.g., 10°C oil temp), resulting in high viscosity. Used to check suction line pressure drops and prevent pump cavitation (NPSH margin). |
| **Hot Summer / Max Flow** | High ambient temp (e.g., 75°C oil temp), resulting in low viscosity. Used to check maximum volumetric flow capacity and heat exchanger heat duty. |
| **Fouled / Filter Blocked** | Differential pressure built up across oil filters (e.g., 90% clogged). Used to check relief valve crack pressures or filter bypass flow. |
| **Partial Load / Throttled** | Actuated valves throttled to 15% open. Used to evaluate system throttling heat generation and pressure relief response. |
| **Emergency / Single-Pump Failure** | Duty pump trips, standby pump kicks in, emergency isolation valves close. Used to evaluate fallback pressure delivery. |

### 2. Parameter Classification Matrix
To ensure consistency across operating cases while preserving diagram integrity, parameters are strictly divided into Global Hardware Specifications and Case-Specific Operating Variables:

```
                           ┌────────────────────────────────────────┐
                           │            WALFLOW DIAGRAM             │
                           └───────────────────┬────────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
  GLOBAL HARDWARE SPECIFICATIONS                                 CASE-SPECIFIC OPERATING VARIABLES
  (Fixed across all cases)                                       (Overridable per Operating Case)
  ───────────────────────────────                                ─────────────────────────────────
  • Network Topology (Nodes & Edges)                             • Fluid Temperature (°C)
  • Pipe Inner Diameters & Lengths                               • Valve Positions (% opening)
  • Pipe Roughness & Elevation Changes                           • Filter Clogging / Dirt Factor (%)
  • Pump Displacement / Max Rating                               • VFD Pump Speed (RPM or %)
  • Orifice Plate Diameters                                      • Tank Initial Fill Level & Head
  • Heat Exchanger Surface Area                                  • External Flow Demands / Loads
```

### 3. User Interface & Visual Design Concept
Following WalFlow’s design system (Teal `#395253`, Orange `#FA8507`, Light Surface `#F4F7F6`):

* **A. Case Switcher Bar (Top Toolbar)**: Located prominently in the top header next to simulation controls:
  * Active Case Dropdown: `[ ⚡ Active Case: Cold Start (10°C) ▾ ]`
  * Quick Actions: `[ + New Case ]` `[ 📑 Duplicate ]` `[ 📊 Compare Cases ]`
  * Base Case Designation: A default "Base / Design Case" serves as the parent configuration.
* **B. Subtle Visual Indicators for Property Types**: In the component Property Inspector panel on the right sidebar:
  * **Global Hardware Properties** (e.g., Pipe Diameter `50 mm`): Marked with a subtle grey `[ 🌐 Global ]` badge. Editing this value updates all operating cases simultaneously.
  * **Case-Specific Properties** (e.g., Valve Position `80%`): Marked with an active WälFlow Orange badge `[ ⚡ Case Variable ]` or soft amber highlight. If overridden in the current case, shows an Override Dot `● Overridden in Cold Start`. A small reset icon `↺ Reset to Base` allows reverting a case property back to the baseline value.
* **C. Canvas Node Badging**: Any equipment element on the canvas (e.g., a valve or filter) that has an active non-default override in the current case displays a small, elegant indicator badge on the canvas node (e.g., a small orange `⚡` pill in the top-right corner of the node).

### 4. Key Power Feature: The Multi-Case Comparison Matrix
Proposed Feature: **Case Matrix Dashboard**
* **One-Click Batch Simulation**: Run all operating cases in parallel via backend processing.
* **Comparison Table**:
  * Columns: Operating Cases (Base, Cold Start, Hot Summer, Filter Blocked).
  * Rows: Key KPIs (System Max Pressure, Total Pump Power, Min Pressure Margin, Heat Generation).
* **Visual Delta Highlighting**:
  * Cell values automatically highlight in Red/Warning if limits are exceeded (e.g., Pressure Drop > 4.5 bar in Cold Start).
  * Delta metrics show differences relative to the Base Case (e.g., `+18.2 bar (+25%)`).

### 5. Data Architecture & Schema Proposal
To maintain clean file formats and backward compatibility:
```json
{
  "file_format_version": "0.1",
  "app_version": "0.1.1",
  "active_case_id": "case_cold_start",
  "cases": [
    {
      "id": "case_base",
      "name": "Base Case (Normal Operation)",
      "is_base": true,
      "overrides": {}
    },
    {
      "id": "case_cold_start",
      "name": "Cold Start (High Viscosity)",
      "is_base": false,
      "overrides": {
        "global_fluid": { "temperature": 10.0 },
        "equipment_valve_1": { "opening_pct": 100.0 },
        "equipment_filter_1": { "dirt_factor": 0.05 }
      }
    }
  ],
  "nodes": [ /* Global topology & hardware properties */ ],
  "edges": [ /* Global pipe connections & geometry */ ]
}
```

### 6. Phased Implementation Plan

- [ ] **Phase 1: Core Data Schema & Backend Multi-Case Resolver**
  * Extend diagram JSON schema to store `cases` array and `active_case_id` with delta overrides (`file_format_version: 0.1` compatible).
  * Update backend `graph_parser` and `solver` to resolve combined baseline properties + case delta overrides prior to matrix calculation.
  * Add backend batch simulation endpoint to solve multiple cases in parallel.

- [ ] **Phase 2: Frontend Case Manager & Visual Inspector Badging**
  * Build top navbar Case Switcher toolbar component with active case selection, `New Case`, and `Duplicate Case` dialogs.
  * Update Property Inspector sidebar to display `🌐 Global` vs `⚡ Case Variable` badges, override dots, and `↺ Reset to Base` action buttons.
  * Implement subtle canvas node indicator pills for equipment containing active case overrides.

- [ ] **Phase 3: Multi-Case Matrix Dashboard & Delta Analytics**
  * Build modal dashboard for side-by-side case matrix comparison (KPI rows vs Case columns).
  * Implement automated batch execution across all cases.
  * Add visual delta metrics (e.g., `+12.4 bar (+15%)`) and automated operating limit warning highlights.

---

## 📊 Analytics & Telemetry

- [ ] **🖥️ Server Resource Telemetry & Performance Dashboard**:
  * **System Resource Monitoring**: Track CPU % consumed by matrix calculations (SciPy/NumPy), RAM usage per active simulation WebSocket, and average solver iteration time (ms) using `psutil`.
  * **Session & User Usage Stats**: Record active connected user count, duration of simulation runs, and historical simulation sessions in the database.
  * **Live Admin Performance Dashboard**: Build an integrated admin dashboard featuring live gauges and historical charts of server compute power and active simulation sessions.

