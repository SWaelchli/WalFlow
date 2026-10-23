# Pressure Safety Valve (`pressure_safety_valve`)

## 1. Overview & Purpose

A pressure safety (relief) valve on a liquid line. It is closed below its set pressure (gauge) and opens to relieve flow. Its capacity at 10 % overpressure is tracked, so an undersized valve shows as `overcapacity`.

| `action_mode` | Behaviour |
| :--- | :--- |
| `pop_action` (default) | Pop action, reseating: snaps to full lift at set pressure; stays open down to the reseat pressure set·(1 − blowdown); cycles when oversized |
| `pop_latching` | Pop action, latching: snaps to full lift at set pressure and stays at full lift for the run (no reseat) |
| `modulating` | Lift proportional to the overpressure, full lift at 10 % overpressure |

| `valve_type` | Opens on |
| :--- | :--- |
| `conventional` (default) | $P_{\text{in}} - P_{\text{out}}$ against the cold differential test pressure (CDTP): backpressure shifts the opening and reduces the lift |
| `balanced_bellows` | Inlet gauge pressure against the set pressure: independent of backpressure |
| `pilot` | Gauge pressure at the pilot sensing point (a signal line to any sensing pin or tap; own inlet without a line) against the set pressure |

The shared relief model (gauge set pressure, opening margin, held state, flow equation, rated capacity, forced states, relief analysis, backpressure results) is in [relief_device.md](relief_device.md). This document covers the valve's own opening logic and its open pressure loss. For a dedicated disc with a reduced bore, use the [rupture disc](rupture_disc.md).

Node types `pressure_safety_valve` and `psv` build the same model.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| PSV-01 | Standard | API Std 520 Part I, 10th ed. (2020); ISO 4126-1:2013 + Amd 1:2016 | Set pressure (gauge) | ⚪ Unverified |
| PSV-02 | Standard | API Std 520 Part I, 10th ed. (2020); ISO 4126-1:2013 + Amd 1:2016 | 10 % overpressure for liquid service | ⚪ Unverified |
| PSV-03 | Standard | API Std 520 Part I, 10th ed. (2020); ISO 4126-1:2013 + Amd 1:2016 | Blowdown and reseat pressure | ⚪ Unverified |
| PSV-04 | Standard | API Std 520 Part I, 10th ed. (2020) | Cold differential test pressure (CDTP) of conventional valves | ⚪ Unverified |
| PSV-05 | Standard | API Std 520 Part II, 7th ed. (2020); API Std 521, 7th ed. (2020) | Built-up backpressure of conventional valves at most 10 % of set | ⚪ Unverified |
| PSV-06 | Standard | API Std 520 Part II, 7th ed. (2020); API Std 521, 7th ed. (2020) | Balanced bellows valves usable up to about 50 % of set | ⚪ Unverified |
| PSV-07 | Standard | API Std 526, 8th ed. (2023) | Orifice designations, which the Cv stands in for | ⚪ Unverified |
| PSV-08 | Standard | API Std 527, 5th ed. (2020) | Seat tightness: the closed valve passes no flow (an idealisation of the allowed leakage) | ⚪ Unverified |
| PSV-09 | Standard | IEC 60534-2-1:2011 | Liquid Cv equation for the open valve loss | ✅ IEC 60534-2-1:2011 §6.1 Eq. (1) |

## 3. Physical & Mathematical Implementation

### 3.1 Open pressure loss (`open_dp`)

At full lift the valve is a Cv restriction with the viscosity correction of the [linear control valve](linear_control_valve.md#33-viscosity-correction-f_r-fluidpropertiesget_valve_fr):

$$\Delta P_{\text{open}} = \frac{K_{Cv}\, \rho\, Q|Q|}{\big(\max(10^{-4},\ C_v F_R)\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

The open seat is the check valve's `open_seat_dp` (shared with the check valve, check valve with orifice and full-bore rupture disc).

This loss enters the flow equation $Q = \text{lift}\sqrt{\Delta p / c(Q)}$ of [relief_device.md](relief_device.md#33-flow-equation-model_flow-calculate_delta_p).

### 3.2 Opening driver by valve type

The valve opens on the margin $m = \text{driver} - \text{threshold}$ (`opening_margin_pa`):

| `valve_type` | Driver (`driver_pa`) | Threshold (`threshold_pa`) |
| :--- | :--- | :--- |
| `conventional` | $P_{\text{in}} - P_{\text{out}}$ | $\text{CDTP} = \max(0.01,\ P_{\text{set,g}} - P_{\text{SB,design}})$ |
| `balanced_bellows` | $P_{\text{in}} - P_{\text{atm}}$ | $P_{\text{set,g}}$ |
| `pilot` | $P_{\text{sense}} - P_{\text{atm}}$ | $P_{\text{set,g}}$ |

- $P_{\text{SB,design}}$ (`design_superimposed_bp_barg`) is the superimposed backpressure the spring was set for. With the actual backpressure equal to it, a conventional valve opens at its set pressure; a higher backpressure raises the opening, and built-up backpressure while relieving reduces the lift.
- $P_{\text{sense}}$ is the pressure at the pilot's sensing point: the port a `SIGNAL` edge (handle `signal-in`) connects to (`pilot_source`, set by the graph parser), or the valve's own inlet without a line. Only the first line is read (the editor allows one); the line is ignored for other valve types, and a pilot whose sensing point is left out of the solve (`pilot_in_solve`, e.g. a tap on a dead-end branch) senses its own inlet. Inside a Newton solve the sensed pressure is taken from the current iterate (the remote node's pressure, or its outlet through `_get_node_p_out` for an outlet port), and the Jacobian row is differentiated over those variables as well.
- The reseat threshold is $\text{threshold}\,(1 - \text{blowdown}/100)$.

### 3.3 Opening logic (`update_relief_state`, `lift_mode`)

Decided between hydraulic solves from the solved pressures, held during each solve:

**Pop action, reseating** (audit F1-04):

| Held state | Lift | Changes to | When |
| :--- | :--- | :--- | :--- |
| `closed` | 0 | `open` | $m \ge 0$ |
| `open` | full | `cycling` | full-lift driver below the reseat threshold |
| `cycling` | modulating, narrow band | (stays) | |

An **undersized** valve stays open at full lift with its driver above the reseat threshold. An **oversized** valve at full lift would drop its driver below reseat and close again: in reality it cycles. There is no steady state, so the average is solved as a modulating valve with a narrow band (`modulating_band_pa` = 1 % of set, at least 10 mbar). This holds the driver at the threshold and gives the **average relief load**. The valve is reported as `cycling`, with:

- `cycle_low_barg` / `cycle_high_barg`: the inlet gauge pressures at which the driver reaches the reseat threshold and the opening threshold (inlet-to-driver offset of the average state held). For a balanced valve these are reseat and set;
- `lift_pct` = none (the averaged lift is not a valve position).

`opening_pressure_barg` / `reseat_pressure_barg` are the same inlet gauge pressures from the final port pressures (the outlet of a conventional valve, the sensed pressure of a pilot), for any status; the details panel draws its Opens/Reseat ticks from them.

**Pop action, latching:** closed until $m \ge 0$, then full lift for the rest of the run, whatever the pressure afterwards.

**Modulating:** lift $= m / \Delta P_{\text{ol}}$ clamped to 0-1, $\Delta P_{\text{ol}}$ = 10 % of the gauge set pressure (at least 10 mbar). No state change between solves.

**Forced states** override all modes: `forced_open` = full lift, `forced_closed` = removed from the solve.

**Status** (`open_status`): `modulating` below 99.9 % lift (`FULL_LIFT_PCT`), `open` at full lift, `cycling` for a cycling pop valve; `overcapacity` above the rated flow, `closed` without lift.

### 3.4 Example: pop action, balanced, set 3 barg, blowdown 7 %

| Valve | Full-lift inlet | Result |
| :--- | :--- | :--- |
| Cv 0.5 (undersized) | above 2.79 barg | `open`, lift 100 %, flow = Cv flow at the actual $\Delta p$ |
| Cv 15 (oversized) | would be below 2.79 barg | `cycling`, inlet held at 3.0-3.03 barg, range 2.79-3.0 barg, flow = average relief load |
| Cv 15, `pop_latching` | below 2.79 barg | `open`, lift 100 %, inlet below reseat |

### 3.5 Derivative

The device's edge row is differentiated numerically by the solver (audit F1-12).

## 4. Thermal & Energy Balance

When open with forward flow the valve throttles: $\Delta T = \max(0, \Delta p)/(\rho\, c_p)$, applied to the outlet (see [relief_device.md](relief_device.md#4-thermal--energy-balance)).

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Set Pressure | barg (psig) | `self.set_pressure_barg` | barg (→ Pa abs) | required (new PSV in the UI: 20 barg) | $> 0$ | Opening pressure, gauge |
| Flow Coefficient (Cv) | Cv | `self.cv` | Cv | 10 | $\ge 0.001$ | Cv at full lift |
| Valve Type | text | `self.valve_type` | - | conventional | conventional, balanced_bellows, pilot | Backpressure dependency / pilot sensing |
| Design superimposed backpressure | barg (psig) | `self.design_superimposed_bp_barg` | barg | 0 | $\ge 0$ | Conventional only: CDTP = set − this |
| Relief Action Mode | text | `self.action_mode` | - | pop_action | pop_action, pop_latching, modulating | Opening behaviour |
| Blowdown (% of set) | % | `self.blowdown_pct` | % | 7 | 0-50 | Reseat below set (pop action, reseating) |
| Contingency Test Mode | text | `self.forced_state` | - | auto | auto, forced_closed, forced_open | Override for contingency cases |

An unknown action mode is read as `pop_action` and an unknown valve type as `conventional`; the blowdown is clamped to 0-50 %. A missing set pressure is an input error.

## 6. Operating Modes & Model Boundaries

- **Steady state:** the valve's equilibrium lift; no pop dynamics, no chatter time history ($\Delta t = 0$). Cycling is reported as `cycling` with the average relief load and the inlet range, not simulated.
- **Solver flags:** see [relief_device.md](relief_device.md#6-operating-modes--model-boundaries).
- **Reverse flow:** none.
- **Every run** starts with the valve closed (`reset_run_state`), so the result does not depend on the previous run.
- **Operating cases:** all fields can be overridden per case.
- **Backpressure:** reported per valve (superimposed, built-up, total, limit) in the relief analysis, see [relief_device.md](relief_device.md#37-relief-analysis-run_sequential_relief_simulation).
- **Not modelled:** the balanced bellows capacity correction $K_w$, the API 520 liquid sizing factors $K_d$ and $K_v$, the inlet pressure loss rule (3 %), the pilot's own dynamics (a pilot opens on its sensed pressure with the chosen action), and gas or two-phase relief.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_pressure_safety_valve.py::test_psv_pop_action_cracking` | 5 bar pump, 2 barg pop PSV, Cv 10: `open`, inlet above 2.2 barg, `overcapacity`, utilisation $100\sqrt{\Delta p / (2.2\ \text{barg} - P_{\text{out}})}$ within 0.1 |
| `test_pressure_safety_valve.py::test_psv_modulating_and_pop_latching` | 4 bar pump, 2.5 barg modulating balanced: inlet between 2.5 and 2.75 barg, lift $= 100 (P_{\text{in,g}} - 2.5)/0.25$ % within 0.01; pop latching opens with 100 % lift |
| `test_pressure_safety_valve.py::test_psv_unmitigated_higher_pressure` | Unmitigated pressure above the relieved pressure |
| `test_pressure_safety_valve.py::test_conventional_opening_shifts_with_backpressure` | Backpressure 20 m water ($\rho g h$ ≈ 1.96 bar), set 5 barg: conventional closed at 6.5 and open at 7.3 barg header; with 2 barg design backpressure open at 5.2, closed at 4.8; balanced open at 5.2, closed at 4.8 |
| `test_pressure_safety_valve.py::test_backpressure_result_and_limit` | Superimposed 0 within 1 mbar, built-up = outlet gauge pressure within 1 mbar; conventional above 10 % flagged, balanced 30 % below 50 %, pilot without limit |
| `test_pressure_safety_valve.py::test_pilot_lift_follows_the_remote_sensing_point` | Modulating pilot sensing a splitter upstream of a lossy line: lift $= 100 (P_{\text{sense,g}} - 10)/1$ % within 0.05; without a line the lift follows its own inlet and is lower |
| `test_pressure_safety_valve.py::test_pilot_line_is_ignored_unless_the_valve_is_pilot_operated` | A signal line to a balanced valve is not read |
| `test_pressure_safety_valve.py::test_pilot_result_does_not_depend_on_node_order` | PSV listed before its sensing node: one result pass with the sensed port reset to atm still gives lift $= 100 (P_{	ext{sense,g}} - 10)/1$ % within 0.05 |
| `test_pressure_safety_valve.py::test_pilot_keeps_its_first_sensing_line` | Two lines: the first is read |
| `test_pressure_safety_valve.py::test_pilot_sensing_a_point_outside_the_solve_senses_its_own_inlet` | Pilot on a pruned dead-end tap: lift from its own inlet within 0.05, opening bound = set |
| `test_pressure_safety_valve.py::test_closed_valve_sees_the_header_pressure_of_a_relieving_neighbour` | Closed PSV on a header another PSV relieves into: superimposed = total = final header gauge pressure within 1 mbar, built-up 0 |
| `test_pressure_safety_valve.py::test_signal_handle_parsing` | `signal-<inlet\|outlet>-<n>` and `<inlet\|outlet>-<n>` read; anything else senses outlet 0 |
| `test_pressure_safety_valve.py::test_example_pilot_senses_the_pump_discharge` | Shipped example, PSV-101 blocked: PSV-102 lift $= 100 (P_{\text{pump out,g}} - 24)/2.4$ % within 0.05 |
| `test_pressure_safety_valve.py::test_example_pop_and_modulating_differ` | Shipped example: PSV-101 pop `open` at full lift, modulating below 99 % lift with the inlet more than 3 bar higher |
| `test_pressure_safety_valve.py::test_cycling_reports_reseat_to_set_range_and_average_load` | 3 barg, Cv 15, balanced: `cycling`, range $3 \cdot 0.93$-3.0 barg, lift none, inlet 3.0-3.03 barg, flow above $10^{-4}$ m³/s |
| `test_pressure_safety_valve.py::test_pop_latching_stays_open_below_reseat` | Same valve latching: `open`, lift 100 %, inlet below reseat |
| `backend/tests/unit/equipment/test_relief_devices.py::test_f1_04_undersized_pop_valve_stays_open_at_full_lift` | 3 barg, Cv 0.5: `open`, lift 100 %, inlet at or above reseat, flow = Cv flow within 1 % |
| `test_relief_devices.py::test_f1_04_oversized_pop_valve_cycles_near_set_pressure` | 3 barg, Cv 15: `cycling`, inlet 3.0-3.3 barg, flow above $10^{-4}$ m³/s (6 L/min); reseat $3.0 \cdot 0.93$ barg + outlet gauge pressure, equal to `cycle_low_barg` (and opening to `cycle_high_barg`) within 5 mbar |
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
| `valve_type` | text (`conventional` / `balanced_bellows` / `pilot`) | conventional |
| `design_superimposed_bp_barg` | barg | 0 |
| `action_mode` | text (`pop_action` / `pop_latching` / `modulating`) | pop_action |
| `blowdown_pct` | % | 7 |
| `forced_state` | text (`auto` / `forced_closed` / `forced_open`) | auto |

The pilot sensing line is a `SIGNAL` edge from a sensing pin or tap (`signal-<port>`) to the valve's `signal-in` handle.
