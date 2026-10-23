# Relief Device (`ReliefDevice`, shared model)

## 1. Overview & Purpose

`ReliefDevice` is the shared model of the two pressure relief components:

- [pressure safety valve](pressure_safety_valve.md) (`pressure_safety_valve`): pop action (reseating or latching) or modulating, as a conventional, balanced bellows or pilot-operated valve;
- [rupture disc](rupture_disc.md) (`rupture_disc`): bursts once and stays open.

This document covers what both share: gauge set pressure, the held open/closed state, the flow equation, rated capacity, forced states, and the relief analysis (unmitigated, relieved and peak pressures). The component documents cover only their own opening logic and open-device pressure loss.

## 2. Governing Standards & Reference Literature

- **API 520 Part I** (sizing of pressure-relieving devices) and **ISO 4126-1**: set pressure in gauge, 10 % overpressure for liquid service at rated capacity, blowdown and reseat pressure.
- **API 521 / ISO 23251** (pressure-relieving and depressuring systems): relieved pressure, accumulation and overpressure scenarios.
- **ISO 4126-2 / ASME BPVC Section VIII**: bursting disc devices (burst pressure, open after burst).

## 3. Physical & Mathematical Implementation

### 3.1 Set pressure (audit F1-09)

Set and burst pressures are entered in **barg**. A device acts on its inlet gauge pressure:

$$P_{\text{set,abs}} = P_{\text{set,g}} \cdot 10^5 + P_{\text{atm}}$$

$P_{\text{atm}}$ is the atmospheric pressure from the global settings. A set pressure below 0.01 barg is raised to 0.01 barg. Older files with an absolute set pressure under another key are not converted; the parser asks for the gauge value.

A device opens on its **opening margin** (`opening_margin_pa`):

$$m = \text{driver} - \text{threshold} \ge 0$$

For the rupture disc (and this base class) the driver is the inlet gauge pressure $P_{\text{in}} - P_{\text{atm}}$ and the threshold is the set pressure. A PSV replaces both according to its valve type (conventional: differential against the CDTP; pilot: the sensed pressure); see [pressure_safety_valve.md](pressure_safety_valve.md#32-opening-driver-by-valve-type). Every opening decision (held state, relief passes, opening snapshots) and the modulating lift use this margin. `inlet_opening_pressure_pa` gives the inlet pressure at which a closed device opens (used to hold a stagnant section just below it), or none for a pilot sensing a remote point.

### 3.2 Held state

Whether a device is open is decided **between** hydraulic solves (`update_relief_state`, from the solved pressures) and held fixed **during** each Newton solve, so its branch never flips mid-iteration. Every run starts with every device closed or intact (`reset_run_state`). When a device changes state, the solver re-solves; branches left at exactly zero flow restart from the initial flow guess so the Newton step is not singular.

### 3.3 Flow equation (`model_flow`, `calculate_delta_p`)

Inside a solve the device is a flow equation, not a pressure drop:

$$Q_{\text{model}} = \text{lift} \cdot \frac{\Delta p}{\sqrt{(\Delta p + 1\ \text{Pa})\; c(Q)}}, \qquad \Delta p = P_{\text{in}} - P_{\text{out}}, \qquad c(Q) = \frac{\Delta P_{\text{open}}(Q)}{Q^2}$$

- $\Delta P_{\text{open}}$ is the pressure loss of the fully open device (Cv or orifice, per component). $c$ is evaluated at $\max(|Q|, 10^{-6}$ m³/s$)$.
- For $\Delta p \gg 1$ Pa this is $Q = \text{lift}\sqrt{\Delta p / c}$; the 1 Pa term keeps the slope finite at $\Delta p = 0$.
- $Q_{\text{model}} = 0$ when lift $= 0$ or $\Delta p \le 0$: a closed device passes exactly no flow, and no device passes reverse flow.

The solver row for the device's edge is (see [base_node.md](base_node.md#34-complementarity-mcp-components))

$$g = \frac{Q - Q_{\text{model}}(Q, P_{\text{in}}, P_{\text{out}})}{10^{-3}} = 0$$

with $P_{\text{out}}$ estimated as the downstream node pressure plus the outlet pipe loss. The Jacobian of this row is a numerical central difference of the whole row (audit F1-12).

### 3.4 Lift

| Mode | Lift |
| :--- | :--- |
| `closed` | 0 |
| `full` | 1 |
| `modulating` | $\min\!\big(1,\ \max(0,\ m / \Delta P_{\text{band}})\big)$, $m$ the opening margin |

$$\Delta P_{\text{ol}} = \max(1000\ \text{Pa},\ 0.10 \cdot P_{\text{set,g}} \cdot 10^5)$$

is the full-lift overpressure: 10 % of the gauge set pressure (`RATED_OVERPRESSURE`, API 520 liquid service), at least 10 mbar. The band $\Delta P_{\text{band}}$ (`modulating_band_pa`) is $\Delta P_{\text{ol}}$; a cycling PSV narrows it (see [pressure_safety_valve.md](pressure_safety_valve.md)). Each component decides which mode applies.

### 3.5 Rated capacity (audit F1-38)

The rated flow is the flow at full lift with the inlet at 110 % of the set pressure (gauge) against the actual outlet pressure:

$$Q_{\text{rated}} = \sqrt{\frac{P_{\text{set,abs}} + \Delta P_{\text{ol}} - P_{\text{out}}}{c(Q_{\text{rated}})}}$$

(four fixed-point steps, because $c$ depends on $Q$ through the Reynolds correction). Reported:

- `capacity_utilization_pct` $= 100\, Q / Q_{\text{rated}}$ (capped at 999 %);
- `rated_flow_lmin`, `lift_pct`;
- `status`: `closed` / `intact`; when open, `modulating` (PSV, lift below 99.9 %), `open` (full lift) / `burst`, or `cycling` (PSV); `overcapacity` above 100 %. An open device without flow (no pressure difference) is reported open with 0 % utilisation.

### 3.6 Forced states (audit F1-03)

| `forced_state` | Effect |
| :--- | :--- |
| `auto` (default) | opens by its own logic |
| `forced_open` | full lift from the start, also below set pressure (blocked-open contingency) |
| `forced_closed` | removed from the solve (topology pruning): no flow, inlet and outlet take their neighbours' pressures |

### 3.7 Relief analysis (`run_sequential_relief_simulation`)

A network with relief devices runs three kinds of solves. All are steady states; none is a time simulation.

1. **Unmitigated:** every device held closed. Gives the pressure the system would reach without protection.
2. **Relieved (sequential passes):** user-forced devices return to their forced state; `auto` devices start held closed. After each solve, the closed `auto` devices whose opening margin reached zero are found; the group with the lowest set pressure is released (state `auto`) and the network is solved again. Higher-set devices are released only if the lower ones cannot hold the pressure. Leakage alone (a stagnant section's pressure) does not lift a held device.
3. **Opening snapshots (audit F1-08):** for each released group, the relief drivers (pumps and sources with `is_relief_driver` and "Ramp during relief analysis" on) are scaled by a factor $\lambda$ from 0 to their case value. $\lambda$ is bisected (up to 24 solves, until the margin is below 1 mbar or $\Delta\lambda < 10^{-4}$) until the group's opening margin is zero (for an inlet-gauge device, the inlet is exactly at set pressure), with earlier groups free to relieve and later devices held closed. This runs on a copy of the network.

| Driver | Ramp $\lambda$ |
| :--- | :--- |
| Centrifugal pump | affinity laws: $Q_r \lambda$, $H \lambda^2$ |
| Volumetric pump | displacement $\lambda Q_r$ |
| Pressure source | $P_{\text{atm}} + \lambda (P_{\text{set}} - P_{\text{atm}})$ |
| Flow source | $\lambda Q_{\text{set}}$ |

Reported pressures (bar(a), the maximum over all ports):

| KPI | Meaning |
| :--- | :--- |
| `unmitigated_peak_pressure_bara` | all devices closed |
| `relieved_pressure_bara` | final relieved steady state |
| `peak_pressure_bara` | highest of the opening snapshots and the relieved state; unavailable if no driver is ramped |

Per device: opening order, ramp at opening, inlet pressure at opening, relieved and unmitigated, relief flow, `lift_pct`, and for a cycling PSV `cycle_low_barg` / `cycle_high_barg`.

PSV backpressure (`_backpressure_result`, gauge at the valve outlet; also on the PSV's node telemetry as `backpressure`):

| Field | Meaning |
| :--- | :--- |
| `superimposed_bp_barg` | outlet while the valve is still closed: its opening snapshot, else the unmitigated pass; a valve that stays closed takes the final outlet (including what other devices relieve into its header) |
| `built_up_bp_barg` | relieved outlet − superimposed (0 while closed) |
| `total_bp_barg` | outlet in the relieved state |
| `bp_basis`, `bp_pct_of_set`, `bp_limit_pct` | conventional: built-up, limit 10 % of set; balanced bellows: total, limit 50 %; pilot: none |
| `bp_exceeded` | relieving and above the limit |

## 4. Thermal & Energy Balance

An open device with forward flow is a throttle (audit F1-16):

$$\Delta T = \frac{\max(0,\ P_{\text{in}} - P_{\text{out}})}{\rho\, c_p(T_{\text{in}})}$$

applied to the outlet. A closed device, or one without forward flow, adds no heat and passes no flow.

## 5. Parameter & Unit Specification Table

Shared inputs (the component documents list the full tables):

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Set Pressure / Burst Pressure | barg (psig) | `self.set_pressure_barg` | barg (→ Pa abs) | required | $> 0$ | Opening pressure, gauge |
| Forced state | text | `self.forced_state` | - | auto | auto, forced_open, forced_closed | Contingency override |
| Ramp during relief analysis | bool | `self.relief_ramp_enabled` | - | true | - | On the drivers, not on the device (see [base_node.md](base_node.md)) |

## 6. Operating Modes & Model Boundaries

- **Steady state:** opening, lift and relief are equilibrium states. Valve chatter, pop dynamics, disc burst dynamics and pressure transients are not modelled ($\Delta t = 0$). A pop-action valve that would chatter is reported as `cycling` (see [pressure_safety_valve.md](pressure_safety_valve.md)).
- **Solver flags:** `use_mcp_formulation = False`, but the solver gives every relief device the flow-equation row of section 3.3 by its node type. `is_pressure_boundary`, `blocks_flow_on_shutdown` are `False`; a closed device blocks through `is_closed_relief` (pruning and stagnant sections).
- **Reverse flow:** never; a device with $\Delta p \le 0$ passes no flow.
- **Liquid service only:** no gas or two-phase relief sizing (API 520 gas equations, HEM / Omega method), no backpressure capacity correction $K_w$ (balanced bellows valves get only the 50 % warning), no viscosity correction $K_v$ beyond the Cv model.
- **Operating cases:** set pressure, Cv and forced state can be overridden per case.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_relief_devices.py::test_f1_09_set_10_barg_opens_at_11_013_bara` | 10 barg modulating PSV: set 11.01325 bar(a); closed at 10.99 bar(a), open at 11.03 bar(a) |
| `test_relief_devices.py::test_f1_09_opening_follows_the_atmospheric_pressure_setting` | The opening follows the atmospheric pressure setting |
| `test_relief_devices.py::test_f1_38_capacity_is_100_pct_at_10_pct_overpressure` | 20 barg, Cv 10, at 110 % set: flow and rated flow within 0.5 %, utilisation 100 % within 0.5, lift > 99.9 % |
| `test_relief_devices.py::test_f1_38_overcapacity_above_rated_flow` | Forced open at 30 bar Δp vs 22 bar rated: utilisation $100\sqrt{30/22}$ % within 0.5 %, `overcapacity` |
| `test_relief_devices.py::test_rated_flow_uses_the_full_lift_overpressure` | 0.05 barg set (10 mbar overpressure floor): flow at full lift equals the rated flow within 1 % |
| `test_relief_devices.py::test_relief_state_is_held_during_each_hydraulic_solve` | The held state does not change inside a solve; a pop valve goes closed → open → cycling between solves |
| `test_relief_devices.py::test_f1_03_forced_open_relieves_below_set_pressure`, `test_f1_03_forced_closed_stays_closed` | Forced open relieves at 50 barg set with a low pressure (no flow in the unmitigated pass); forced closed passes no flow |
| `test_relief_devices.py::test_sequential_relief_run_leaves_the_users_forced_states_on_the_network` | The user's `forced_state` is restored on the network and in both telemetries |
| `test_relief_devices.py::test_open_device_without_flow_is_not_reported_closed` | An open disc without flow is not reported intact; utilisation 0 % |
| `backend/tests/scenarios/test_relief_peak.py::test_ramp_scales_and_restores_drivers` | Pump at $\lambda$ = 0.5: shutoff head $30 \cdot 1.2 \cdot 0.25$ m, flow halved, curve shape kept; restored afterwards; source ramp $P_{\text{atm}} + 5$ bar |
| `test_relief_peak.py::test_pop_psv_opening_snapshot_is_at_set_pressure` | Opening snapshot inlet at 4.0 bar(a) within 10 mbar, at the expected ramp within 0.5 %; relieved between set and set + 10 %; unmitigated above peak |
| `test_relief_peak.py::test_rupture_disc_on_pressure_source` | Disc on a pressure source: opening at 5.0 bar(a) within 10 mbar, ramp within 0.2 % |
| `test_relief_peak.py::test_staggered_devices_open_in_order` | Two devices open in order at 4.0 and 6.0 bar(a) within 10 mbar; peak at least 5.98 bar(a) |
| `test_relief_peak.py::test_no_enabled_driver_reports_peak_unavailable`, `test_no_opening_peak_equals_relieved` | No ramped driver: peak unavailable with a reason; no opening: peak = relieved |
| `backend/tests/unit/solver/test_stagnant_branches.py::test_leakage_alone_does_not_open_a_psv_in_the_relief_passes` | A stagnant section's pressure does not lift a held PSV |
