# Rupture Disc (`rupture_disc`)

## 1. Overview & Purpose

A bursting disc (rupture disc): a non-reclosing pressure relief device. It is intact (no flow) at the start of each run. When the pressure difference across it (inlet − outlet) reaches the burst pressure it bursts and stays fully open for the rest of the run, even if the pressure falls again.

| `bore_type` | Open pressure loss |
| :--- | :--- |
| `full_bore` (default) | Cv restriction (disc holder and burst membrane) |
| `reduced_bore` | Sharp-edged orifice in the connected pipe (restricted disc or orifice in the relief line) |

The shared relief model (gauge set pressure, held state, flow equation, rated capacity, forced states, relief analysis) is in [relief_device.md](relief_device.md). This document covers the disc's burst logic and its open pressure loss.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| RD-01 | Standard | ISO 4126-2:2018; ISO 4126-6:2014 | Bursting disc safety devices: burst pressure, application and sizing | ✅ Burst on the inlet − outlet differential, ISO 4126-2:2018 §3.10, ISO 4126-6:2014 §3.21; API RP 520-1 7th ed. §1.2.3.3 c agrees. Sizing ✅ ISO 4126-6 Annex C.3.1.2 |
| RD-02 | Standard | ASME BPVC Section VIII Div. 1, UG-127 (edition not fixed; moved to Section XIII from 2021) | Rupture disc devices | ✅ ASME VIII-1 2010 + 2011a UG-127 (sole device, flow resistance method, burst tolerance not modelled) 🚩 Section XIII unverified |
| RD-03 | Standard | API Std 520 Part I, 10th ed. (2020) | 10 % overpressure for liquid relief capacity | ✅ API RP 520-1 7th ed. (2000) Fig. 26, §3.11.1.2 🚩 10th ed. unverified |
| RD-04 | Standard | API Std 520 Part I, 10th ed. (2020) | Flow resistance method ($K_R$) for discs | ✅ API RP 520-1 7th ed. (2000) §3.11.1.3 (system resistance; $K_R$ and 0.90 factor not applied) 🚩 10th ed. unverified |
| RD-05 | Standard | ISO 5167-2:2022 | Orifice flow equation for the reduced bore, as for the [calibrated restriction](calibrated_restriction.md#32-pressure-drop-calculate_delta_p) | ✅ ISO 5167-2:2022 F(1) (equation form) |
| RD-06 | Standard | IEC 60534-2-1:2011 | Liquid Cv equation for the full bore | ✅ IEC 60534-2-1:2011 §6.1 Eq. (1) |

## 3. Physical & Mathematical Implementation

### 3.1 Burst logic (`update_relief_state`, `lift_mode`)

| State | Lift | Changes to | When |
| :--- | :--- | :--- | :--- |
| intact | 0 | burst | $P_{\text{in}} - P_{\text{out}} \ge P_{\text{burst,g}} \cdot 10^5$ |
| burst | full | (latched for the run) | |

The burst pressure is the differential across the disc (ISO 4126-2 §3.10): against an atmospheric outlet the disc bursts at inlet gauge pressure $P_{\text{burst,g}}$; against an outlet at 3 bar(g) a 10 bar disc bursts at 13 bar(g). Pressures are total pressures at the ports (`driver_pa`, `opening_margin_pa`). Because the opening follows the outlet (`opening_depends_on_outlet`), the solver holds a stagnant inlet section just below the outlet pressure + burst pressure (`inlet_opening_pressure_pa`) only once the outlet section is resolved. The rated condition is the burst differential + 10 % against the actual outlet (`rated_inlet_pressure_pa`, see [relief_device.md](relief_device.md#35-rated-capacity)). `forced_open` is a burst disc from the start; `forced_closed` removes it from the solve. Every run starts intact (`reset_run_state`).

### 3.2 Open pressure loss (`open_dp`)

**Full bore:**

$$\Delta P_{\text{open}} = \frac{K_{Cv}\, \rho\, Q|Q|}{\big(\max(10^{-4},\ C_v F_R)\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

with the smooth viscosity correction $F_R$ of the [check valve](check_valve.md#31-open-valve-loss-open_seat_dp) (not the IEC 60534-2-1 Annex A factor of the control valves).

**Reduced bore**, with $D$ the connected pipe bore and $d$ the orifice, $\beta = \min(0.99,\ d/D)$ ($d$ limited to $0.99 D$):

$$\Delta P_{\text{open}} = \frac{\rho\, v_1|v_1|}{2} \cdot \frac{1 - \beta^4}{C_d^2\, \beta^4} \cdot r, \qquad C_d = 0.60 \tanh\!\left(\frac{0.2\sqrt{\mathrm{Re}_o}}{0.60}\right)$$

$v_1$ is the pipe velocity, $\mathrm{Re}_o$ the orifice Reynolds number. The parser sets $D$ from the connected pipe (upstream first), overriding `pipe_diameter_m`.

The open loss enters the flow equation $Q = \text{lift}\sqrt{\Delta p / c(Q)}$ of [relief_device.md](relief_device.md#33-flow-equation-model_flow-calculate_delta_p).

### 3.3 Derivative

The class has no analytical derivative; the solver differentiates the device's edge row numerically.

## 4. Thermal & Energy Balance

A burst disc with forward flow throttles: $\Delta T = \max(0, \Delta p)/(\rho\, c_p)$, applied to the outlet (see [relief_device.md](relief_device.md#4-thermal--energy-balance)). An intact disc passes no flow and adds no heat.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Burst Pressure | bar (psi), differential | `self.burst_pressure_barg` (key kept for files) | bar (→ Pa differential) | required (new disc in the UI: 25 bar) | $> 0$ | Burst pressure: differential inlet − outlet (inlet gauge pressure against an atmospheric outlet) |
| Bore Configuration | text | `self.bore_type` | - | full_bore | full_bore, reduced_bore | Open loss model |
| Flow Coefficient (Cv) | Cv | `self.cv` | Cv | 10 | $\ge 0.001$ | Cv of the burst disc (full bore) |
| Orifice Restriction Diameter | mm (in) | `self.orifice_diameter` | m | 10 mm | $\ge 1$ mm, $< D$ | Restriction bore (reduced bore) |
| Pipe bore | from the connected pipe | `self.pipe_diameter` | m | DN50 (52.48 mm) | $\ge 1$ mm | Line bore around the restriction (reduced bore) |
| Contingency Test Mode | text | `self.forced_state` | - | auto | auto, forced_closed, forced_open | Override for contingency cases |

An unknown bore type is read as `full_bore`. A missing burst pressure is an input error.

## 6. Operating Modes & Model Boundaries

- **Steady state:** the burst is a state change between solves; no burst dynamics or pressure wave ($\Delta t = 0$).
- **Solver flags:** see [relief_device.md](relief_device.md#6-operating-modes--model-boundaries).
- **Status:** `intact`, `burst`, `overcapacity` (flow above the rated flow at a differential of 110 % of the burst pressure).
- **Non-reclosing:** once burst, open for the rest of the run; a new run starts intact.
- **Reverse flow:** none. An outlet above the inlet gives a negative differential: the disc stays intact (reverse-acting discs are not modelled).
- **Operating cases:** all fields can be overridden per case.
- **Not modelled:** burst tolerance and manufacturing range, reverse-acting versus forward-acting discs, disc fragments, the API 520 $K_R$ resistance factor (the Cv or orifice stands in for it), the API 520 factor of 0.90 on the calculated capacity of the flow resistance method (the rated flow and utilisation are not derated, so utilisation reads up to about 11 % higher than against the derated capacity), gas or two-phase relief.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_rupture_disc.py::test_rupture_disc_intact_and_burst` | 10 bar disc, outlet 3 bar(g): intact at 10.0 and 12.9 bar(g), bursts at 13.0 bar(g); atmospheric outlet: intact at 9.9, bursts at 10.0 bar(g); stays burst once burst; reset gives `intact` |
| `test_rupture_disc.py::test_rupture_disc_opening_pressure_and_rated_flow_follow_the_outlet` | Opening follows the outlet; inlet opening pressure = outlet + burst pressure (`opening_pressure_barg` 13.0 bar(g) at outlet 3 bar(g)); rated flow the same against 3 bar(g) and atmospheric outlet (rated $\Delta p$ 11 bar) |
| `test_rupture_disc.py::test_burst_full_bore_disc_follows_the_cv_definition` | 10 bar(a) header → 5 bar(g) disc (Cv 10) → drain, DN200: disc $\Delta p$ = header − atmospheric within 200 Pa; flow = Cv flow at that $\Delta p$ within 0.5 % |
| `test_rupture_disc.py::test_rupture_disc_full_bore_vs_reduced_bore` | Oil at 60 L/min: reduced bore (8 mm in DN50) drop above full bore (Cv 10) drop, both positive |
| `backend/tests/unit/equipment/test_relief_devices.py::test_f1_38_reduced_bore_disc_capacity` | 10 bar(g) reduced bore (20 mm in DN50) at 12.1 bar(g): utilisation $100\sqrt{\Delta p / 11\ \text{bar}}$ within 0.5 %, `overcapacity` |
| `test_relief_devices.py::test_open_device_without_flow_is_not_reported_closed` | Forced-open disc without flow: not `intact`, utilisation 0 % |
| `backend/tests/scenarios/test_relief_peak.py::test_rupture_disc_on_pressure_boundary` | Disc on a ramped pressure boundary: opening snapshot at 5.0 bar(a) within 10 mbar |
| `backend/tests/unit/fluids/test_throttling_heat.py::test_f1_16_throttling_heat_magnitude` | Burst disc: outlet temperature rise $= \Delta P/(\rho c_p)$ within 2 % |

## Data Fields

Node type: `rupture_disc`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `burst_pressure_barg` | bar(g) | required |
| `bore_type` | text (`full_bore` / `reduced_bore`) | full_bore |
| `cv` | Cv | 10 |
| `pipe_diameter_m` | m | 0.05248 |
| `orifice_diameter_m` | m | 0.01 |
| `forced_state` | text (`auto` / `forced_closed` / `forced_open`) | auto |
