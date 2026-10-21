# Measurement Tap (`measure_point`)

## 1. Overview & Purpose

A measurement tap is a sensing location in the middle of a pipe run. It lets an instrument bubble or a remote control valve read the line at a point that is not a component port, for example halfway along a long return line, without changing the hydraulics.

- **Ports:** one inlet (`inlet-0`) and one outlet (`outlet-0`).
- **Sensing pin:** always present, `signal-inlet-0`, reads the inlet port state. In the drawing the pin is shown centred between inlet and outlet. The tap has no pressure drop, so inlet and outlet are the same state.
- **Insertion:** right-click a pipe → *Insert measurement tap*. The pipe is split at the clicked point into two halves of half the original length each (25 m if no length was set). The upstream half keeps the pipe's id and label; the downstream half gets the next free pipe label.

## 2. Governing Standards & Reference Literature

No engineering standard applies. The tap is an ideal point in the line with no resistance.

## 3. Physical & Mathematical Implementation

### 3.1 Pressure and mass balance

$$P_{\text{out}} = P_{\text{in}}, \qquad Q_{\text{out}} = Q_{\text{in}}$$

The class has no `calculate_delta_p`, so the solver treats it like a [splitter](splitter.md) or [mixer](mixer.md): a node with one pressure unknown and a mass balance row (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)).

### 3.2 Equivalence with the unsplit pipe

Splitting a pipe of length $L$ into $L/2$ + tap + $L/2$ gives the same flow and the same end pressures as the original pipe, because the Darcy-Weisbach friction loss is linear in length:

$$\Delta P_{\text{pipe}}(L) = \Delta P_{\text{pipe}}(L/2) + 0 + \Delta P_{\text{pipe}}(L/2)$$

A reservoir entry loss (see [pipe.md](pipe.md#34-entry-from-a-reservoir)) stays on the half at the reservoir. The tap pressure is then the line pressure at the split point.

### 3.3 Derivative

Not applicable — the tap adds no pressure term.

### 3.4 Sensing and instrumentation

- **Remote control valves:** a signal line from the tap pin to a valve's `signal-in` makes the valve hold its set pressure at the tap (`remote_sensing_config = {node_id, port_type: "inlet", port_idx: 0}`), see [remote_control_valve.md](remote_control_valve.md).
- **Instrument bubbles (`instrument`):** display-only, not sent to the solver. The graph parser skips them and drops the signal lines into them. The frontend computes their readings (P, ΔP, Q, T, velocity, kinematic viscosity) from the tap's inlet telemetry. Velocity uses the inside diameter of the pipe on the tap's inlet.

## 4. Thermal & Energy Balance

Density, viscosity and temperature pass from inlet to outlet unchanged ($\Delta T = 0$). No energy is added or dissipated. With reverse flow the outlet state reaches the inlet (direction-aware mixing, see [base_node.md](base_node.md#41-default-mixing-calculate_temperature)).

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Label | text | `self.name` | - | `Measurement Tap n` | any | Tag shown on the drawing and in instrument locations |

The tap has no hydraulic parameters.

## 6. Operating Modes & Model Boundaries

- **Steady state:** an algebraic point in the line ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `is_flow_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect.
- **Reverse flow:** supported; the flow passes in either direction.
- **Operating cases:** nothing to override.
- **Not modelled:** the disturbance of a real tapping point or instrument on the flow.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_measure_point.py::test_tap_has_no_pressure_drop_and_matches_an_unsplit_pipe` | Flow through the split pipe equals the unsplit pipe flow within 0.01 %; tap inlet and outlet pressure equal within 1 Pa; tap pressure at the midpoint of the friction drop within 0.1 % |
| `test_measure_point.py::test_instrument_bubble_and_its_signal_edge_do_not_enter_the_network` | An instrument bubble and its signal line create no node and no pipe |
| `test_measure_point.py::test_remote_control_valve_senses_a_tap` | A remote control valve sensing the tap holds it at 1.2 bar(a) within 2 mbar, opening between 0 and 100 % |

## Data Fields

Node type: `measure_point`. No fields of its own; only the fields of every component in [base_node.md](base_node.md).
