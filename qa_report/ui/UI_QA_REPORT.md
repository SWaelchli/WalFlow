# WalFlow UI Quality Assurance Audit Report

**Project:** WalFlow Hydraulic Simulator — Quality Assurance Audit  
**Milestone:** Milestone 3 (R2: UI QA Audit)  
**Date:** 2026-08-03  
**Auditor:** QA Subagent (`worker_m3`)  
**Scope:** Frontend Unit Conversions, Backend Telemetry Mapping, and Component Visual State Verification  

---

## 1. Executive Summary

This report provides a comprehensive Quality Assurance (QA) audit of the WalFlow web-based hydraulic process simulator frontend UI (`frontend/src`). The audit evaluates:
1. **Unit Conversion Logic & Display Accuracy**: Verification of built-in frontend conversion utilities (`frontend/src/utils/converters.js`) against raw backend SI telemetry data payloads, along with an explicit gap analysis of missing Imperial and US customary unit conversions (`psi`, `gpm`, `m³/h`, `HP`).
2. **Component Visual States & Parameter Transitions**: Verification checklists for dynamic node graphics, state badges, status colors, Recharts performance curves, and SVG edge animations across Control Valves, Pressure Safety Valves (PSVs), Rupture Discs, Centrifugal Pumps, and Pipe Edges.

---

## 2. Unit Conversions & Telemetry Display Audit

### 2.1 Utility Functions Audit (`frontend/src/utils/converters.js`)

The file `frontend/src/utils/converters.js` provides centralized conversion functions from standard SI units (used in the backend solver) to user-facing SI/metric units:

```javascript
// frontend/src/utils/converters.js
export const paToBar = (pa) => (pa / 100000).toFixed(2);
export const m3sToLmin = (m3s) => (m3s * 60000).toFixed(1);
export const kToC = (k) => (k - 273.15).toFixed(1);

export const mmToM = (mm) => mm / 1000;
export const mToMm = (m) => (m * 1000).toFixed(2);
```

#### Code-Level Conversion Formulas:
- **Pressure**: $P_{\text{bar}} = \frac{P_{\text{Pa}}}{100,000}$ (formatted to 2 decimal places).
- **Flow Rate**: $Q_{\text{L/min}} = Q_{\text{m}^3/\text{s}} \times 60,000$ (formatted to 1 decimal place).
- **Temperature**: $T_{^\circ\text{C}} = T_{\text{K}} - 273.15$ (formatted to 1 decimal place).
- **Length / Diameter**: $L_{\text{m}} = \frac{L_{\text{mm}}}{1000}$ (number) / $L_{\text{mm}} = L_{\text{m}} \times 1000$ (formatted to 2 decimal places).
- **Hydraulic Power** (`frontend/src/components/details/PumpDetails.jsx:87`): $P_{\text{kW}} = \frac{\Delta P_{\text{Pa}} \times |Q_{\text{m}^3/\text{s}}|}{1000}$ (formatted to 2 decimal places).

---

### 2.2 Backend SI Telemetry to Frontend Displayed Values Mapping

The table below maps representative raw backend SI telemetry values (transmitted via WebSocket JSON) to their corresponding frontend UI rendered values across active metric conversions and highlights the corresponding **unbuilt Imperial / US customary values**.

| Physical Quantity | Raw Backend SI Payload Value | Active Frontend Conversion | Displayed Frontend Value (Metric / SI) | Target Imperial / US Customary Unit | Unbuilt Imperial Conversion Formula | Calculated Unbuilt Imperial Value | Frontend Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Pressure** | `101325.0 Pa` | `paToBar(101325)` | `1.01 bar` | `psi` | $P_{\text{psi}} = \frac{P_{\text{Pa}}}{6894.757}$ | `14.70 psi` | ❌ **Unbuilt / Missing** |
| **Pressure** | `500000.0 Pa` | `paToBar(500000)` | `5.00 bar` | `psi` | $P_{\text{psi}} = \frac{P_{\text{Pa}}}{6894.757}$ | `72.52 psi` | ❌ **Unbuilt / Missing** |
| **Pressure** | `2000000.0 Pa` | `paToBar(2000000)` | `20.00 bar` | `psi` | $P_{\text{psi}} = \frac{P_{\text{Pa}}}{6894.757}$ | `290.08 psi` | ❌ **Unbuilt / Missing** |
| **Flow Rate** | `0.001 m³/s` | `m3sToLmin(0.001)` | `60.0 L/min` | `m³/h` | $Q_{\text{m}^3/\text{h}} = Q_{\text{m}^3/\text{s}} \times 3600$ | `3.60 m³/h` | ❌ **Unbuilt / Missing** |
| **Flow Rate** | `0.001 m³/s` | `m3sToLmin(0.001)` | `60.0 L/min` | `gpm` | $Q_{\text{gpm}} = Q_{\text{m}^3/\text{s}} \times 15850.32$ | `15.85 gpm` | ❌ **Unbuilt / Missing** |
| **Flow Rate** | `0.005 m³/s` | `m3sToLmin(0.005)` | `300.0 L/min` | `m³/h` | $Q_{\text{m}^3/\text{h}} = Q_{\text{m}^3/\text{s}} \times 3600$ | `18.00 m³/h` | ❌ **Unbuilt / Missing** |
| **Flow Rate** | `0.005 m³/s` | `m3sToLmin(0.005)` | `300.0 L/min` | `gpm` | $Q_{\text{gpm}} = Q_{\text{m}^3/\text{s}} \times 15850.32$ | `79.25 gpm` | ❌ **Unbuilt / Missing** |
| **Flow Rate** | `0.010 m³/s` | `m3sToLmin(0.010)` | `600.0 L/min` | `m³/h` | $Q_{\text{m}^3/\text{h}} = Q_{\text{m}^3/\text{s}} \times 3600$ | `36.00 m³/h` | ❌ **Unbuilt / Missing** |
| **Flow Rate** | `0.010 m³/s` | `m3sToLmin(0.010)` | `600.0 L/min` | `gpm` | $Q_{\text{gpm}} = Q_{\text{m}^3/\text{s}} \times 15850.32$ | `158.50 gpm` | ❌ **Unbuilt / Missing** |
| **Pump Duty / Power** | `5000.0 W` | `5000 / 1000` | `5.00 kW` | `HP` | $P_{\text{HP}} = \frac{P_{\text{kW}}}{0.7457}$ | `6.71 HP` | ❌ **Unbuilt / Missing** |
| **Pump Duty / Power** | `15000.0 W` | `15000 / 1000` | `15.00 kW` | `HP` | $P_{\text{HP}} = \frac{P_{\text{kW}}}{0.7457}$ | `20.12 HP` | ❌ **Unbuilt / Missing** |
| **Pump Duty / Power** | `50000.0 W` | `50000 / 1000` | `50.00 kW` | `HP` | $P_{\text{HP}} = \frac{P_{\text{kW}}}{0.7457}$ | `67.05 HP` | ❌ **Unbuilt / Missing** |

---

### 2.3 Gap Analysis: Unbuilt Imperial / US Customary Unit Conversions (R2 Compliance)

Requirement **R2** specifically requested verifying unit conversion logic and display accuracy for alternative unit systems:
- **Pressure**: `bar` vs `psi` ($1\text{ bar} = 14.50377\text{ psi}$)
- **Flow Rate**: `m³/h` vs `gpm` ($1\text{ m}^3/\text{s} = 3600\text{ m}^3/\text{h} = 15850.32\text{ gpm}$)
- **Pump Duty / Power**: `kW` vs `HP` ($1\text{ kW} = 1.34102\text{ HP}$)

#### Forensic Code Analysis & Findings:
1. **Zero Imperial Code Implementation**: A codebase search (`grep_search`) across all files in `frontend/src` for `psi`, `gpm`, `m3h`, or `hp` returns **0 relevant conversion utilities or unit toggles**.
2. **Hardcoded Labels**: All UI text labels in `frontend/src/nodes/*`, `frontend/src/components/panels/PropertyEditor.jsx`, `frontend/src/components/panels/Sidebar.jsx`, `frontend/src/components/panels/DataList.jsx`, and `frontend/src/components/details/*` are hardcoded to SI units (`bar`, `L/min`, `kW`, `°C`).
3. **Property Editor Setpoints**: Inputs in `PropertyEditor.jsx` accept values in `bar` and serialize to backend SI Pascals via inline multiplication (`val * 100000`). There is no option for users to input setpoints in `psi` or flow in `gpm`.

---

## 3. Component Visual States Verification Checklists

The WalFlow frontend renders visual states for node parameters, equipment status transitions, and dynamic pipe heatmaps. Below are detailed verification checklists for each major component category.

---

### 3.1 Control Valves (`LinearControlValveNode.jsx`, `RemoteControlValveNode.jsx`, `ValveDetails.jsx`)

Control valves display opening percentages, valve position sliders, status badges, and dynamic performance curves.

| Verification Item | Tested Parameter / Trigger | Expected Visual Rendering | Code File & Line Reference | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Interactive Range Slider** | Node footer `opening` input | `<input type="range" min="0" max="100" step="1" value={opening} />` | `LinearControlValveNode.jsx:28-38` | ✅ **PASS** |
| **Opening Percentage Display** | `data.opening` or `telemetry.opening_pct` | `{opening.toFixed(1)} %` rendered in bold `#0369a1` blue text | `LinearControlValveNode.jsx:41`, `RemoteControlValveNode.jsx:29` | ✅ **PASS** |
| **Remote Signal Inlet Handle** | RCV node component | Orange handle `id="signal-in"` at `top: 5px, left: 30px` with `#FA8507` fill and `#E07600` border | `RemoteControlValveNode.jsx:43-58` | ✅ **PASS** |
| **Yellow Actuator Diaphragm** | RCV SVG bonnet | `<path d="M 20 15 Q 30 5 40 15 Z" fill="#fef08a" stroke="#854d0e" />` | `RemoteControlValveNode.jsx:37` | ✅ **PASS** |
| **Status Badge: REGULATING** | Regulator error $< 0.1$ bar | Green badge: `bg: #dcfce7`, text: `#166534`, label `REGULATING` | `ValveDetails.jsx:28, 80-82` | ✅ **PASS** |
| **Status Badge: SATURATED** | Opening $\ge 99.9\%$ or $\le 0.15\%$ | Red badge: `bg: #fee2e2`, text: `#991b1b`, label `SATURATED` | `ValveDetails.jsx:28, 80-82` | ✅ **PASS** |
| **Dynamic Recharts Envelope Curve** | `ValveDetails.jsx` detail card | `ComposedChart` plotting limit curve, current position curve, setpoint line, and live operating scatter point (`fill="#FA8507"`) | `ValveDetails.jsx:87-100` | ✅ **PASS** |

---

### 3.2 Pressure Safety Valves (PSV) (`PressureSafetyValveNode.jsx`, `PressureSafetyValveDetails.jsx`)

Pressure Safety Valves represent ISA 90° angle relief valves with cracking seat illumination and relief capacity sizing badges.

| Verification Item | Status / Parameter State | Expected Visual Rendering | Code File & Line Reference | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Closed Valve Seat Fill** | `status === 'closed'` | Seat triangles rendered with white fill: `fill="#FFFFFF"` | `PressureSafetyValveNode.jsx:76-77` | ✅ **PASS** |
| **Relieving Seat Illumination** | `status === 'cracked'` or `'overcapacity'` | Seat triangles turn bright WälFlow Orange: `fill="#FA8507"` | `PressureSafetyValveNode.jsx:76-77` | ✅ **PASS** |
| **Status Badge: CLOSED** | `status === 'closed'` | Muted slate badge: `bg: #F1F5F9`, text: `#64748B`, border: `#64748B33`, label `CLOSED` | `PressureSafetyValveNode.jsx:22-25` | ✅ **PASS** |
| **Status Badge: CRACKED** | `status === 'cracked'` | Amber badge: `bg: #FEF3C7`, text: `#D97706`, border: `#D9770633`, label `CRACKED` | `PressureSafetyValveNode.jsx:26-29` | ✅ **PASS** |
| **Status Badge: OVERCAPACITY** | `status === 'overcapacity'` | Bright red badge: `bg: #FEE2E2`, text: `#DC2626`, border: `#DC262633`, label `OVERCAPACITY` | `PressureSafetyValveNode.jsx:30-33` | ✅ **PASS** |
| **Spring Coil Graphic** | PSV bonnet SVG | 90° body line with 3 spring coils (`rect` x=29, y=8, w=12, h=10 with 3 horizontal coil lines) | `PressureSafetyValveNode.jsx:79-85` | ✅ **PASS** |
| **Unmitigated Baseline Alert** | Dual-pass telemetry | Light red container (`#FEF2F2`) displaying Unmitigated Peak Pressure in bold red `#DC2626` | `PressureSafetyValveDetails.jsx:104-109` | ✅ **PASS** |
| **Capacity Utilization Bar** | `capacity_utilization_pct` | Dynamic progress bar changing color from green ($\le 80\%$) to amber ($80\text{--}100\%$) to red ($> 100\%$) | `PressureSafetyValveDetails.jsx:118-128` | ✅ **PASS** |

---

### 3.3 Rupture Discs (`RuptureDiscNode.jsx`, `RuptureDiscDetails.jsx`)

Rupture Discs feature distinct SVG path states representing intact vs fractured burst diaphragms.

| Verification Item | Status / Parameter State | Expected Visual Rendering | Code File & Line Reference | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Intact Dome Diaphragm Path** | `status === 'intact'` | Smooth orange rounded curve: `<path d="M 29,24 Q 35,35 29,46" stroke="#FA8507" strokeWidth="3.5" />` | `RuptureDiscNode.jsx:79-87` | ✅ **PASS** |
| **Burst Diaphragm Path** | `status === 'burst'` or `'overcapacity'` | Fractured, jagged diaphragm lines: `<path d="M 29,24 Q 32,30 30,34 M 29,46 Q 32,40 30,36" stroke="#DC2626" strokeWidth="3.5" />` | `RuptureDiscNode.jsx:88-96` | ✅ **PASS** |
| **Flange Plates Graphic** | Constant node structure | Dual dark teal flange bars: `<rect x="26" y="22" width="3" height="26" fill="#395253" />` & `<rect x="41" y="22" width="3" height="26" fill="#395253" />` | `RuptureDiscNode.jsx:74-76` | ✅ **PASS** |
| **Status Badge: INTACT** | `status === 'intact'` | Green badge: `bg: #DCFCE7`, text: `#166534`, border: `#16653433`, label `INTACT` | `RuptureDiscNode.jsx:22-25` | ✅ **PASS** |
| **Status Badge: BURST** | `status === 'burst'` | Red badge: `bg: #FEE2E2`, text: `#DC2626`, border: `#DC262633`, label `BURST` | `RuptureDiscNode.jsx:26-29` | ✅ **PASS** |
| **Status Badge: OVERCAPACITY** | `status === 'overcapacity'` | Red badge: `bg: #FEE2E2`, text: `#DC2626`, border: `#DC262633`, label `OVERCAPACITY` | `RuptureDiscNode.jsx:30-33` | ✅ **PASS** |

---

### 3.4 Centrifugal Pumps (`CentrifugalPumpNode.jsx`, `PumpDetails.jsx`, `BaseNode.jsx`)

Pumps provide state indicators for operational status (`Active`/`Inactive`), pressure rise, hydraulic duty, and cavitation risks.

| Verification Item | Status / Parameter State | Expected Visual Rendering | Code File & Line Reference | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Active Pump State** | `data.active === true` | Standard pump symbol with node footer showing `+{paToBar(dP)} bar` and `{m3sToLmin(q)} L/min` | `CentrifugalPumpNode.jsx:31-34` | ✅ **PASS** |
| **Inactive Pump OFF Badge** | `data.active === false` | Bold red `OFF` badge (`bg: #ef4444`, text: `white`, `fontSize: 9px`) rendered at bottom-right corner of component | `BaseNode.jsx:89-108` | ✅ **PASS** |
| **Canvas Cavitation Warning** | `telemetry.cavitation_warning === true` | Pulsing red warning icon `⚠` (`color: #ef4444`, `className="animate-pulse"`, `fontSize: 20px`) floating above component | `BaseNode.jsx:42-60`, `CentrifugalPumpNode.jsx:27` | ✅ **PASS** |
| **Detail Panel Cavitation Alert** | `telemetry.cavitation_warning === true` | Red alert container (`#fff1f2` bg, `#be123c` text) stating `CAVITATION RISK: Suction pressure is critically low` | `PumpDetails.jsx:7-26` | ✅ **PASS** |
| **Recharts Performance Curve** | `PumpDetails.jsx` detail card | `ComposedChart` plotting Pump Head Curve (blue `#2563eb`), System Resistance Curve (green `#10b981`), and operating point scatter cross | `PumpDetails.jsx:98-110` | ✅ **PASS** |
| **Hydraulic Duty Calculation** | Telemetry flow & $\Delta P$ | $P_{\text{kW}} = \frac{\Delta P \times Q}{1000}$ displayed in kW | `PumpDetails.jsx:87, 122-124` | ✅ **PASS** |

---

### 3.5 Pipe Heatmaps & Flow Particles (`PipeEdge.jsx`)

Pipe edges feature dynamic HSL color interpolation based on physical properties and animated particle overlays for flow velocity visualization.

| Verification Item | Physics Parameter / Heatmap Mode | Expected Visual Rendering | Code File & Line Reference | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Default Pipe Styling** | `heatmapMode === 'default'` | Solid line with `#395253` stroke (or `#FA8507` when selected) | `PipeEdge.jsx:9-11` | ✅ **PASS** |
| **Heatmap HSL Color Interpolation** | `pressure`, `temperature`, `volumeflow`, or `velocity` | Normalized value $\text{norm} = \text{clamp}\left(\frac{\text{val} - \text{min}}{\text{max} - \text{min}}\right)$ yields HSL hue $(1 - \text{norm}) \times 210^\circ$, smoothly transitioning from **210° (Blue)** to **0° (Red)** | `PipeEdge.jsx:48-50` | ✅ **PASS** |
| **No Flow Particles** | $|Q| \le 0.01 \text{ L/min}$ | Static solid pipe line without particle overlay | `PipeEdge.jsx:87, 124` | ✅ **PASS** |
| **Animated Flow Particles Overlay** | $|Q| > 0.01 \text{ L/min}$ | Dashed overlay path (`stroke="#ffffff"`, `strokeDasharray="3 13"`, `strokeOpacity={0.85}`) animating along edge path | `PipeEdge.jsx:124-139` | ✅ **PASS** |
| **Dynamic Particle Speed Scaling** | Flow rate variation | `animDuration = Math.max(0.4, Math.min(4.0, 6.0 / Math.pow(absFlow, 0.4)))` — higher flow produces faster animation | `PipeEdge.jsx:88` | ✅ **PASS** |
| **Reverse Flow Animation** | $Q < 0$ (Reverse flow) | Animation direction set to `reverse` (`isReverse ? 'reverse' : 'normal'`) | `PipeEdge.jsx:84, 135` | ✅ **PASS** |

---

## 4. Recommendations for Next Development Cycle

1. **Implement Imperial / US Customary Unit System Support (R2 Compliance)**:
   - Add unit conversion utility functions in `frontend/src/utils/converters.js`:
     * `paToPsi = (pa) => (pa / 6894.757).toFixed(2)`
     * `m3sToGpm = (m3s) => (m3s * 15850.32).toFixed(1)`
     * `m3sToM3h = (m3s) => (m3s * 3600).toFixed(2)`
     * `kwToHp = (kw) => (kw * 1.34102).toFixed(2)`
   - Introduce a global unit toggle (`unitSystem: 'SI' | 'Imperial'`) in `globalSettings` state.
   - Update `PropertyEditor.jsx`, `DetailPanel.jsx`, `DataList.jsx`, and Node components to dynamically display units and handle input conversions based on the selected system.

2. **WebSocket Reconnection Optimization**:
   - Refactor `useWebSocketSimulation.js` to remove `telemetryMode` and `activeCaseId` from the WebSocket connection `useEffect` dependency array, eliminating unnecessary socket teardowns when switching view modes.

---

## 5. Audit Conclusion

The WalFlow frontend UI exhibits excellent code quality for component visual state rendering, dynamic SVG drawing, state transitions, Recharts performance curve plotting, and HSL pipe heatmaps. All visual state requirements for Control Valves, PSVs, Rupture Discs, Pumps, and Pipes were **fully verified and passed**.

However, the UI QA audit identified a key compliance gap: **Imperial and US customary unit conversions (`psi`, `gpm`, `m³/h`, `HP`) are currently unbuilt and missing from the codebase**, with all displays hardcoded to SI units. Comprehensive recommendations have been provided for implementation in the next iteration.
