# Pressure Safety Valve (`pressure_safety_valve`)

## 1. Overview & Purpose

A spring-loaded pressure safety (relief) valve on a liquid line. It is closed below its set pressure (gauge) and opens to relieve flow when the inlet reaches it. Its capacity at 10 % overpressure is tracked, so an undersized valve shows as `overcapacity`.

| `action_mode` | Behaviour |
| :--- | :--- |
| `pop_action` (default) | Snaps to full lift at set pressure; stays open down to the reseat pressure set·(1 − blowdown) |
| `modulating` | Lift proportional to the overpressure, full lift at 10 % overpressure |
| `rupture_disc` | Bursts at set pressure and stays fully open for the run (a disc modelled with the valve's Cv) |

The shared relief model (gauge set pressure, held state, flow equation, rated capacity, forced states, relief analysis) is in [relief_device.md](relief_device.md). This document covers the valve's own opening logic and its open pressure loss. For a dedicated disc with a reduced bore, use the [rupture disc](rupture_disc.md).

Node types `pressure_safety_valve` and `psv` build the same model.

## 2. Governing Standards & Reference Literature

- **API 520 Part I / ISO 4126-1:** set pressure, 10 % overpressure for liquid service, blowdown and reseat pressure.
- **API 526:** flanged steel pressure relief valves (orifice designations, which the Cv stands in for).
- **API 527:** seat tightness: the closed valve passes no flow.
- **IEC 60534-2-1:** liquid Cv equation for the open valve loss.

## 3. Physical & Mathematical Implementation

### 3.1 Open pressure loss (`open_dp`)

At full lift the valve is a Cv restriction with the viscosity correction of the [linear control valve](linear_control_valve.md#33-viscosity-correction-f_r-fluidpropertiesget_valve_fr):

$$\Delta P_{\text{open}} = \frac{K_{Cv}\, \rho\, Q|Q|}{\big(\max(0.001,\ C_v F_R)\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

This loss enters the flow equation $Q = \text{lift}\sqrt{\Delta p / c(Q)}$ of [relief_device.md](relief_device.md#33-flow-equation-model_flow-calculate_delta_p).

### 3.2 Opening logic (`update_relief_state`, `lift_mode`)

Decided between hydraulic solves from the solved inlet pressure, held during each solve:

**Pop action** (audit F1-04):

| Held state | Lift | Changes to | When |
| :--- | :--- | :--- | :--- |
| `closed` | 0 | `open` | $P_{\text{in}} \ge P_{\text{set}}$ |
| `open` | full | `cycling` | full-lift inlet pressure $< P_{\text{reseat}}$ |
| `cycling` | modulating | (stays) | |

$$P_{\text{reseat,g}} = P_{\text{set,g}} \left(1 - \frac{\text{blowdown}}{100}\right)$$

An **undersized** valve stays open at full lift with its inlet above the reseat pressure. An **oversized** valve at full lift would drop its inlet below reseat and close again: in reality it chatters (cycles). There is no steady state, so it is solved as a modulating valve, which holds the inlet just above the set pressure, and reported with status `cycling`.

**Modulating:** lift $= (P_{\text{in}} - P_{\text{set}}) / \Delta P_{\text{ol}}$ clamped to 0-1, $\Delta P_{\text{ol}}$ = 10 % of the gauge set pressure (at least 10 mbar). No state change between solves.

**Rupture-disc mode:** intact until $P_{\text{in}} \ge P_{\text{set}}$, then burst (full lift) for the rest of the run.

**Forced states** override all modes: `forced_open` = full lift, `forced_closed` = removed from the solve.

### 3.3 Example: pop action, set 3 barg, blowdown 7 %

| Valve | Full-lift inlet | Result |
| :--- | :--- | :--- |
| Cv 0.5 (undersized) | above 2.79 barg | `open`, lift 100 %, flow = Cv flow at the actual $\Delta p$ |
| Cv 15 (oversized) | would be below 2.79 barg | `cycling`, inlet held at 3.0-3.3 barg |

### 3.4 Derivative

The device's edge row is differentiated numerically by the solver (audit F1-12). `calculate_dp_derivative` returns a constant $P_{\text{scale}}/Q_{\text{scale}} = 10^8$ only as a placeholder (see [relief_device.md](relief_device.md#33-flow-equation-model_flow-calculate_delta_p)).

## 4. Thermal & Energy Balance

When open with forward flow the valve throttles: $\Delta T = \max(0, \Delta p)/(\rho\, c_p)$, applied to the outlet (see [relief_device.md](relief_device.md#4-thermal--energy-balance)).

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Set Pressure | barg (psig) | `self.set_pressure_barg` | barg (→ Pa abs) | required (new PSV in the UI: 20 barg) | $> 0$ | Opening pressure, gauge |
| Flow Coefficient (Cv) | Cv | `self.cv` | Cv | 10 | $\ge 0.001$ | Cv at full lift |
| Relief Action Mode | text | `self.action_mode` | - | pop_action | pop_action, modulating, rupture_disc | Opening behaviour |
| Blowdown (% of set) | % | `self.blowdown_pct` | % | 7 | 0-50 | Reseat below set (pop action) |
| Contingency Test Mode | text | `self.forced_state` | - | auto | auto, forced_closed, forced_open | Override for contingency cases |

An unknown action mode is read as `pop_action`; the blowdown is clamped to 0-50 %. A missing set pressure is an input error.

## 6. Operating Modes & Model Boundaries

- **Steady state:** the valve's equilibrium lift; no pop dynamics, no chatter time history ($\Delta t = 0$). Chatter is reported as `cycling`, not simulated.
- **Solver flags:** see [relief_device.md](relief_device.md#6-operating-modes--model-boundaries).
- **Status:** `closed`, `cracked` (open), `cycling` (pop action without a steady full-lift state), `overcapacity` (flow above the rated flow at 10 % overpressure).
- **Reverse flow:** none.
- **Every run** starts with the valve closed (`reset_run_state`), so the result does not depend on the previous run.
- **Operating cases:** all fields can be overridden per case.
- **Not modelled:** built-up and superimposed backpressure effects on the set pressure (conventional versus balanced bellows valves), the API 520 liquid sizing correction factors $K_d$, $K_w$, $K_v$, inlet pressure loss rule (3 %), and gas or two-phase relief.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_pressure_safety_valve.py::test_psv_pop_action_cracking` | 5 bar pump, 2 barg pop PSV, Cv 10: `open`, inlet above 2.2 barg, `overcapacity`, utilisation $100\sqrt{\Delta p / (2.2\ \text{barg} - P_{\text{out}})}$ within 0.1 |
| `test_pressure_safety_valve.py::test_psv_modulating_and_rupture_disc` | 4 bar pump, 2.5 barg modulating: inlet between 2.5 and 2.75 barg, lift $= 100 (P_{\text{in,g}} - 2.5)/0.25$ % within 0.01; rupture-disc mode bursts with 100 % lift |
| `test_pressure_safety_valve.py::test_psv_unmitigated_higher_pressure` | Unmitigated pressure above the relieved pressure |
| `backend/tests/unit/equipment/test_relief_devices.py::test_f1_04_undersized_pop_valve_stays_open_at_full_lift` | 3 barg, Cv 0.5: `open`, lift 100 %, inlet at or above reseat, flow = Cv flow within 1 % |
| `test_relief_devices.py::test_f1_04_oversized_pop_valve_cycles_near_set_pressure` | 3 barg, Cv 15: `cycling`, inlet 3.0-3.3 barg, flow above $10^{-4}$ m³/s (6 L/min); reseat $3.0 \cdot 0.93$ barg |
| `test_relief_devices.py::test_f1_04_result_does_not_depend_on_the_previous_run` | Two consecutive runs give the same state, flow ($10^{-6}$) and pressure ($10^{-5}$) |
| `test_relief_devices.py::test_f1_09_pop_opening_snapshot_in_gauge` | 3 barg pop PSV: opening snapshot inlet at 4.01325 bar(a) within 10 mbar |
| `test_relief_devices.py::test_d1_old_bar_a_key_is_not_converted`, `test_d1_barg_key_is_read` | An old absolute key is rejected; `set_pressure_barg` 12.5 and `forced_state` are read |
| `backend/tests/unit/fluids/test_throttling_heat.py::test_f1_16_throttling_heat_magnitude` | Open PSV: outlet temperature rise $= \Delta P/(\rho c_p)$ within 2 % |

Shared relief benchmarks (capacity, forced states, relief analysis) are in [relief_device.md](relief_device.md#7-verification--benchmarks).

## Data Fields

Node type: `pressure_safety_valve`, `psv`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `set_pressure_barg` | barg | required |
| `cv` | Cv | 10 |
| `action_mode` | text (`pop_action` / `modulating` / `rupture_disc`) | pop_action |
| `blowdown_pct` | % | 7 |
| `forced_state` | text (`auto` / `forced_closed` / `forced_open`) | auto |
