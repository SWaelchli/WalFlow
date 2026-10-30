# Linear Regulator (`linear_regulator`)

## 1. Overview & Purpose

A self-acting pressure regulator: a valve with a linear trim whose opening the solver adjusts until the pressure at the regulator reaches its set pressure.

| Mode (`backpressure`) | Name | Senses | Opens when |
| :--- | :--- | :--- | :--- |
| `false` (default) | Pressure reducing valve (PRV) | its own outlet | the outlet pressure falls below the setpoint |
| `true` | Backpressure regulator (BPR) | its own inlet | the inlet pressure rises above the setpoint |

When the setpoint cannot be reached, the regulator saturates: wide open, closed, or (PRV only) **locked up**, holding the setpoint on a closed downstream section.

The opening search described here (section 3.3) is shared with the [remote control valve](remote_control_valve.md), which senses a pressure elsewhere in the network.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| REG-01 | Standard | IEC 60534-2-1:2011; ANSI/ISA-75.01.01-2012 | Liquid Cv equation, as in the [linear control valve](linear_control_valve.md#3-physical--mathematical-implementation) | ✅ IEC 60534-2-1:2011 §6.1 Eq. (1) |
| REG-02 | Standard | ANSI/ISA-75.11.01-2013 | Linear inherent characteristic | ⚪ Unverified |
| REG-03 | Standard | EN 334:2019+A1:2024 | Lock-up: closed tight at zero demand (EN 334 covers fuel-gas regulators) | ⚪ Unverified 🚩 |

The regulator is an ideal controller: no droop (proportional band), no hysteresis. It holds the setpoint exactly whenever the trim can.

## 3. Physical & Mathematical Implementation

### 3.1 Valve equation (`calculate_delta_p`)

The same Cv equation as the [linear control valve](linear_control_valve.md#32-pressure-drop-calculate_delta_p), but with the smooth viscosity correction of the [check valve](check_valve.md#31-open-valve-loss-open_seat_dp) (`FluidProperties.get_valve_fr`), not the IEC 60534-2-1 Annex A factor of the control valves. A regulator standard may replace it later.

$$\Delta P = \frac{K_{Cv}\, \rho\, Q|Q|}{\big(C_{v,\max} \cdot \tfrac{\text{opening}}{100} \cdot F_R\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

The opening is clamped to 0.1-100 % inside the equation; a closed regulator is represented by lock-up (3.4), not by 0 %.

The Results tab chart draws this equation at the current and the full opening; the curve points come from `calculate_delta_p` with the results (`valve_curves`).

### 3.2 Control error

$$f = s \cdot \frac{P_{\text{sensed}} - P_{\text{set}}}{10^5}\ \text{[bar]}, \qquad s = \begin{cases} +1 & \text{PRV (outlet sensed)} \\ -1 & \text{BPR (inlet sensed)} \end{cases}$$

With this sign, $f$ rises as the valve opens in both modes. The setpoint counts as reached when $|f| < 10^{-4}$ bar (`CONTROL_TOL_BAR`).

### 3.3 Opening search (`NetworkSolver._control_step`)

The opening is not part of the Newton system; an outer loop around the hydraulic solve finds it (see [base_node.md](base_node.md#35-outer-loops)):

1. Unknown per controller: $v = \ln(\text{opening})$. Every run starts at 50 %.
2. After each hydraulic solve, a finite-difference Jacobian $\partial f_i / \partial v_k$ (step 0.03 in $\ln$) is built from extra solves, one per controller. These solves hold the fluid properties of the base solve, so the difference measures the opening alone.
3. Newton step $\Delta v = -J^{-1} f$ (least squares), limited to a factor 10 in opening per iteration (`MAX_STEP_LN`) and clipped to the end stops 0.05 % and 100 %.
4. If an error changes sign **and** grows, the last step is halved (up to five times). An error that grows with the same sign comes from fluid properties still settling and is not backtracked.

Interacting controllers (a PRV and a BPR in series) are solved together, because the Jacobian has their cross terms. A controller whose own opening does not move its error walks towards the end stop its error asks for. One whose opening moves its error the wrong way is flagged `reverse_acting` and runs to an end stop, like a wrong-acting loop.

The loop ends when every controller is at its setpoint or saturated, together with converged fluid properties and 3-way TCVs, or at `control_iterations` (default 100). The reported result is the hydraulic solution of the last control positions, never positions moved after it; `controls_converged` says whether the loop finished.

### 3.4 Saturation and lock-up

| State | Condition | Result |
| :--- | :--- | :--- |
| `regulating` | $|f| < 10^{-4}$ bar | setpoint held |
| `open` (wide open) | $f < 0$ at 100 % | setpoint out of reach: PRV outlet below / BPR inlet above setpoint |
| `closed` | $f > 0$ at the 0.05 % end stop | still above setpoint (BPR, or a PRV in a shared group) |
| `lockup` | PRV `closed` | outlet pinned to $P_{\text{set}}$, zero flow, opening reported as 0 % |

**Lock-up.** A PRV that would close completely (downstream consumer shut) holds its setpoint on the downstream side. In the edge pressure balance its outlet pressure is fixed: $P_{\text{out}} = P_{\text{set}}$. The property update (`calculate`) uses the same $\Delta P = P_{\text{in}} - P_{\text{set}}$ for the throttling heat, not the Cv equation at the end stop. Lock-up ends when:

- a downstream demand appears ($Q > 10^{-9}$ m³/s with $P_{\text{in}} > P_{\text{set}}$): the regulator opens just enough to carry it at the setpoint (opening found by bisection, `_opening_for_dp`; the end stop is lowered for a tiny demand);
- flow comes back through the outlet: something else holds the downstream side above the setpoint, so the regulator is simply closed;
- the supply falls below the setpoint: the regulator goes wide open.

After three exits the regulator stays in its last state, to avoid cycling. A PRV in a dead end (pruned, no flow path) is locked up: $P_{\text{out}} = \min(P_{\text{in}}, P_{\text{set}})$.

Saturated controllers are listed in `saturated_controllers` with their state (`wide_open`, `closed`, `lock_up`), setpoint and sensed pressure, so the user sees why a setpoint is not held.

### 3.5 Derivative

The class has no analytical derivative; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)). A locked-up regulator has no slope with respect to its inlet pressure or flow.

## 4. Thermal & Energy Balance

The pressure drop is throttling loss:

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$. A PRV reducing 10 bar of water heats it by about 0.24 K.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Max Cv | Cv | `self.max_cv` | Cv | 50 | $> 0$ | Flow coefficient at 100 % |
| Mode | text | `self.backpressure` | bool | Pressure Reducing (Downstream) | Pressure Reducing / Backpressure | `false` = PRV, `true` = BPR |
| Set Point | bar(a) (psi(a)) | `self.set_pressure` | Pa (absolute) | 5.0 bar(a) | $> 0$ | Pressure held at the sensed port |

The opening (`self.opening_pct`) is a result, not an input.

## 6. Operating Modes & Model Boundaries

- **Steady state:** the opening is the steady-state equilibrium of an ideal controller; no loop dynamics, no droop ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`). The solver registers the regulator as a controller by its class.
- **Inactive:** `active` has no effect.
- **Reverse flow:** the valve equation is symmetric. A PRV whose outlet takes flow back while locked up is treated as closed.
- **Fixed flow upstream:** a PD pump fixes the flow, so a PRV downstream of it cannot change the pressure by throttling; it goes wide open (`test_pd_pump_fixes_the_flow_so_the_prv_cannot_regulate`).
- **Operating cases:** setpoint, mode and Cv can be overridden per case.
- **Not modelled:** droop and accuracy class of real regulators, set pressure in gauge, cavitation and choked flow in the trim, regulator stability.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_regulator.py::test_prv_holds_reachable_setpoint` | 61 m supply tank, Cv 5, orifice load: PRV holds 2 bar(g) + atm within 0.05 bar |
| `test_regulator.py::test_prv_into_open_tank_saturates_open`, `test_bpr_holds_upstream_pressure` | PRV into an open tank saturates wide open; BPR behind a pump holds 8 bar(g) + atm within 0.05 bar |
| `backend/tests/scenarios/test_regulator_lockup.py::test_tight_shut_consumer_locks_the_prv_up` | Consumer shut tight: outlet 5.0 bar within 1 mbar, flow 0 within $10^{-4}$ L/min, opening 0 %, reported as `lock_up` |
| `test_regulator_lockup.py::test_closed_consumer_keeps_the_prv_at_its_setpoint` | Closed consumer valve: 5.0 bar within 1 mbar, only the closed valve's leakage (< 0.05 L/min), opening < 0.1 % |
| `test_regulator_lockup.py::test_prv_in_a_dead_end_is_locked_up_not_wide_open` | Dead end: inlet 10 bar, outlet 5.0 bar within 1 mbar |
| `test_regulator_lockup.py::test_small_demand_opens_the_prv_and_holds_the_setpoint` | Small demand: 5.0 bar within 1 mbar, opening between 0 and 100 % |
| `test_regulator_lockup.py::test_demand_flow_through_the_locked_regulator_matches_the_valve_equation` | Demand flow through the consumer valve matches its Cv equation within 0.1 % |
| `test_regulator_lockup.py::test_supply_below_setpoint_leaves_the_prv_wide_open` | Supply below setpoint: opening 100 %, `wide_open`, outlet below 4 bar |
| `test_regulator_lockup.py::test_parallel_prvs_the_higher_setpoint_regulates_the_lower_stays_closed` | PRVs at 5.2 and a lower setpoint in parallel: 5.2 bar within 1 mbar, the other closed (< 0.1 L/min), at most 25 outer iterations |
| `backend/tests/scenarios/test_controls.py::test_api_682_prv_and_bpr_hold_both_setpoints` | API 682 seal-supply example: PRV 10.0 bar and BPR 8.0 bar, both within 2 mbar |
| `test_controls.py::test_result_does_not_depend_on_iteration_limit_or_warm_start`, `test_first_and_second_run_agree` | Openings agree within 0.1 % regardless of iteration limit and warm start |
| `test_controls.py::test_iteration_limit_is_reported_not_hidden` | At a limit of 2 outer iterations: `controls_converged` is `False` |
| `backend/tests/scenarios/test_regulator_scenarios.py` | PRV with an orifice load (reachable and unreachable setpoint), BPR in a parallel branch |

## Data Fields

Node type: `linear_regulator`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv | 50 |
| `set_pressure_pa` | Pa | 500000 |
| `backpressure` | bool | false |
