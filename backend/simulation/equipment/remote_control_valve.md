# Remote Control Valve (`remote_control_valve`)

## 1. Overview & Purpose

A control valve that holds a set pressure at a **remote** point. A signal line connects the valve's `signal-in` to a port elsewhere in the network (a tank, a measurement tap, any component port). The solver adjusts the opening until the pressure at that port reaches the setpoint.

| Mode (`backpressure`) | Control action |
| :--- | :--- |
| `false` (default) | Pressure reducing: opens when the sensed pressure is below the setpoint (point downstream of the valve) |
| `true` | Backpressure: opens when the sensed pressure is above the setpoint (point upstream of the valve) |

Use it for a pressure control loop with a transmitter at the consumer, at the end of a long line or at a header. Without a signal line it senses its own outlet.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| RCV-01 | Standard | IEC 60534-2-1:2011; ANSI/ISA-75.01.01-2012 | Liquid Cv equation, as in the [linear control valve](linear_control_valve.md#3-physical--mathematical-implementation) | ✅ IEC 60534-2-1:2011 §6.1 Eq. (1) |
| RCV-02 | Standard | ANSI/ISA-5.1-2024 | PC → PCV loop notation | ⚪ Unverified |
| RCV-03 | Standard | IEC 60534-2-1:2011 | Reynolds number factor $F_R$ (Annex A) and default $F_L$, $F_d$ (Table D.2), as in the [linear control valve](linear_control_valve.md#33-reynolds-number-factor-f_r-fluidpropertiesget_iec_valve_fr) | ✅ IEC 60534-2-1:2011 §9 Eq. (23), Annex A, Table D.2 |

The control loop is an ideal steady-state controller (no tuning, no offset), as a pressure control loop would settle with integral action.

## 3. Physical & Mathematical Implementation

### 3.1 Valve equation (`calculate_delta_p`)

$$\Delta P = \frac{K_{Cv}\, \rho\, Q|Q|}{\big(C_{v,\max} \cdot \tfrac{\text{opening}}{100} \cdot F_R\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

with the opening clamped to 0.1-100 % and the IEC 60534-2-1 Annex A Reynolds number factor $F_R$ of the [linear control valve](linear_control_valve.md#33-reynolds-number-factor-f_r-fluidpropertiesget_iec_valve_fr): same $F_L$, $F_d$ defaults, valve size from the connected pipe.

The Results tab chart draws this equation at the current and the full opening; the curve points come from `calculate_delta_p` with the results (`valve_curves`).

### 3.2 Sensed pressure

The parser builds `remote_sensing_config = {node_id, port_type, port_idx}` from the signal line's source handle (e.g. `signal-inlet-0` → inlet 0). At a port of an in-line component (`signal-port-k` on an orifice, calibrated restriction or filter), the parser points the config at the hidden junction of that port ([component_link.md](component_link.md)), an ordinary node. A legacy signal line without a port in its handle senses the source node's outlet 0; no signal line, or a missing node, means the valve's own outlet.

### 3.3 Opening search

The control error and the outer Newton loop on $\ln(\text{opening})$ are the same as for the [linear regulator](linear_regulator.md#33-opening-search-networksolver_control_step):

$$f = s \cdot \frac{P_{\text{sensed}} - P_{\text{set}}}{10^5}, \qquad s = +1 \text{ (reducing)},\ -1 \text{ (backpressure)}$$

Differences from the regulator:

- **No lock-up.** A remote control valve that cannot get its sensed pressure down to the setpoint closes to the 0.05 % end stop (`closed`); it does not pin its outlet.
- **Wrong-acting loops.** In reducing mode with the sensed point **upstream** of the valve, opening lowers the sensed pressure: the loop is wrong-acting. The valve runs to an end stop and is reported with `reverse_acting = true`.

### 3.4 Several valves on one sensing point

Several valves sensing the same port in the same mode fix only that one pressure, not each opening. The solver then acts like one controller per setpoint (`_share_sensing_points`):

- **Equal setpoints** share control at one common opening, so the flow splits by Cv and branch resistance. Setpoints within half the control tolerance (0.05 mbar) count as equal and are held at their mean.
- **Different setpoints** form tiers: the highest reducing setpoint (lowest backpressure setpoint) regulates and the others close. If it cannot reach its setpoint wide open, it stays wide open and the next setpoint takes over.

Valves are grouped only when they sense the exact same port. Valves that sense different ports, even with almost no loss between them, are controlled separately; the pipe loss between those ports still decides the split.

### 3.5 Derivative

The class has no analytical derivative; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)).

## 4. Thermal & Energy Balance

The pressure drop is throttling loss:

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Max Cv | Cv | `self.max_cv` | Cv | 0.05 | $> 0$ | Flow coefficient at 100 % |
| Mode | text | `self.backpressure` | bool | Pressure Reducing (Downstream Remote) | Pressure Reducing / Backpressure | Control action |
| Set Point | bar(a) (psi(a)) | `self.set_pressure` | Pa (absolute) | 5.0 bar(a) | $> 0$ | Pressure held at the sensed port |
| Valve style | catalogue entry or Custom | `valve_style_id` | – | IEC Table D.2 globe single port, contoured plug, flow to open | catalogue `control_valve` rows, `custom` | Sets $F_L$ and $F_d$ from the [catalogue](../../../frontend/src/pages/CataloguePage.jsx) (Control valve styles); Custom makes them editable |
| F_L (from the style, or Custom) | – | `self.fl` | – | 0.9 | $(0, 1]$ | Liquid pressure recovery factor $F_L$ (Table D.2) |
| F_d (from the style, or Custom) | – | `self.fd` | – | 0.46 | $> 0$ | Valve style modifier $F_d$ (Table D.2) |
| — (from connected pipe) | – | `self.pipe_diameter` | m | 0.05248 | $> 0$ | Valve size $d = D$ for $F_R$ |
| Signal line | drawing | `self.remote_sensing_config` | - | none (own outlet) | any port | Sensed port |

The opening (`self.opening_pct`) and the sensed pressure (`self.sensed_pressure`) are results.

## 6. Operating Modes & Model Boundaries

- **Steady state:** the settled opening of an ideal controller ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`). The solver registers the valve as a controller by its class.
- **Inactive:** `active` has no effect.
- **Reverse flow:** the valve equation is symmetric.
- **Saturation** is reported in `saturated_controllers` (`wide_open`, `closed`) with the setpoint, the sensed pressure and `reverse_acting`.
- **Operating cases:** setpoint, mode and Cv can be overridden per case; the signal line is part of the drawing.
- **Not modelled:** transmitter range and accuracy, controller dynamics and tuning, valve positioner limits.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `test_remote_control_valve.py::test_remote_control_valve_network_downstream_regulation` | 50 m tank → valve (Cv 100, 2 bar(a) at the sink tank) → 1 m tank: mass balance within 0.1 %, opening between 0 and 100 % |
| `test_remote_control_valve.py::test_graph_parser_signal_edge_handling` | A signal line creates `remote_sensing_config` to the tank and no pipe; setpoint 2.5 bar(a) read from the file |
| `backend/tests/unit/equipment/test_measure_point.py::test_remote_control_valve_senses_a_tap` | Valve sensing a measurement tap holds it at 1.2 bar(a) within 2 mbar |
| `backend/tests/scenarios/test_regulator_shared_sensing.py` | Two valves on one header (5.0 bar reducing, 7.0 bar backpressure): equal setpoints share one opening (equal within $10^{-9}$) and split 2 : 1 by Cv within 2 %; 5.0 vs 5.1 bar: the higher regulates within 1 mbar, the other closed (< 0.1 L/min), at most 25 outer iterations; setpoints 0.04 mbar apart held at their mean; the lower takes over when the higher is wide open |
| `backend/tests/scenarios/test_controls.py::test_wrong_acting_remote_valve_runs_to_an_end_stop_and_says_why` | Reducing valve sensing upstream: `wide_open` with `reverse_acting = true` |

## Data Fields

Node type: `remote_control_valve`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv | 0.05 |
| `set_pressure_pa` | Pa | 500000 |
| `backpressure` | bool | false |
| `fl` | factor $F_L$ (IEC 60534-2-1) | 0.9 |
| `fd` | factor $F_d$ (IEC 60534-2-1) | 0.46 |

The node data also carries `valve_style_id` (`<catalogue code>:<row code>` or `custom`, default `IEC_60534_2_1_TABLE_D2:globe_single_contoured_open`) for the inspector's valve style; the parser reads only `fl` and `fd`.
