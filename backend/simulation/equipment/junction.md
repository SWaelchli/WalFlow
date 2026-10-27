# Junction (`junction`)

## 1. Overview & Purpose

A junction joins 3 to 8 pipes at one point: a tee, a cross or a header. Its ports have no inlet or outlet role. A pipe connects to any port and may be drawn into or out of the junction; the solved flows decide which ports feed it and which it feeds. All ports are at the same total pressure; the junction has no pressure loss of its own. Ports with flow out of the junction carry the enthalpy-weighted mix of the incoming streams.

Use it wherever a line branches or lines join: a branch point, two supplies meeting, a bypass rejoining the main line, a four-pipe node of a distribution network.

## 2. Governing Standards & Reference Literature

No engineering standard applies. The junction is an ideal adiabatic junction: conservation of mass (Kirchhoff's first law) and of enthalpy at one common total pressure.

## 3. Physical & Mathematical Implementation

### 3.1 Ports and slots

The canvas ports are `port-0` … `port-(N-1)`. The solver works with inlets and outlets, so the parser (`_assign_junction_ports`) gives each port that has a pipe a slot: an inlet slot when the pipe is drawn into the junction (the junction is the edge's target), an outlet slot when it is drawn out of it. Edge flows are signed, so the drawn direction only sets the sign of the edge flow, not the solution. A port without a pipe gets no slot. A port takes one pipe; a second pipe on one port is an input error.

### 3.2 Pressure

The junction is one node with one total-pressure unknown $p_0$:

$$P_{0,k} = p_0 \quad \text{for every port } k \text{ with a pipe}$$

Each port reports the static pressure $p_0 - \rho v^2/2$ of the pipe on it, so the ports differ where the pipe velocities differ (see [base_node.md](base_node.md#36-total-pressure-at-nodes-static-pressure-at-ports)). A port with a pipe but no flow reports the lowest static pressure of the flowing ports, as a gauge on a dead branch reads the run's static pressure. All ports of a junction count as one side for this rule (`single_side`), so the reading does not depend on how the pipes are drawn.

The junction has no `calculate_delta_p`, so in the edge pressure balance its outlet pressure equals its inlet pressure (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)).

### 3.3 Mass balance

One mass balance row for the node (mass flows, see [base_node.md](base_node.md#31-unknowns-and-equations)):

$$\sum_{k} \rho_k\, q_{k,\text{in}} = 0$$

with $q_{k,\text{in}}$ the volume flow into the junction through port $k$ and each edge's density where it enters the node it flows into. Streams at different temperatures leave with a slightly different volume flow than the sum of the incoming ones (seawater at 0 °C and 55 °C mixed 1:1: about 0.4 %).

### 3.4 Derivative

Not applicable — the junction adds no pressure term. The mass balance row is linear in the edge flows.

### 3.5 Tee losses

The junction has no branch or run loss coefficient. For a junction whose loss matters, add a resistance (for example a [calibrated restriction](calibrated_restriction.md) or an [orifice](orifice.md)) on the branch. Loss coefficients per port and flow-ratio dependent tee losses are on the roadmap.

## 4. Thermal & Energy Balance

Two steps run during property propagation (see [base_node.md](base_node.md#4-thermal--energy-balance)):

1. `calculate_temperature`: the enthalpy balance of all ports with flow into the junction sets the temperature of the ports with flow out of it:

$$\sum_{k \in \text{in}} \dot m_k\, h(T_k) = \Big(\sum_{k \in \text{in}} \dot m_k\Big)\, h(T_{\text{mix}}), \qquad \dot m_k = |q_k|\, \rho_k, \qquad h(T) = \int c_p\, dT$$

2. `calculate`: the pressure of the lowest connected port is copied to the other ports, and every port with flow out of the junction gets density and viscosity at $T_{\text{mix}}$ (`update_outward_properties`). The temperature itself is not overwritten.

Which ports are incoming follows the solved flow direction, not the drawn direction. Without any inflow (stagnant junction) the ports take the temperature of the lowest connected port, and the dead-leg rule applies (see [base_node.md](base_node.md#6-operating-modes--model-boundaries)).

Example: ISO VG 46 from a hot tank at 80 °C and a cold tank at 20 °C; the outgoing temperature lies between the two at the point where the heat given by the hot stream equals the heat taken by the cold stream with $c_p(T)$.

## 5. Parameter & Unit Specification Table

| Parameter | UI Unit | Backend Var | SI Unit | Default | Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Number of ports | — | `num_ports` | count | `3` | 3 to 8 | Ports `port-0` … `port-(N-1)`, shown as Port 1 … Port N; a value outside the range, not a whole number or empty is an input error |

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic junction ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect; the junction always joins its pipes.
- **Flow direction:** any port can feed or be fed; the mass balance holds for any sign.
- **Unused port:** a port without a pipe is ignored. A branch that ends in a dead end is pruned before the solve and gets the junction pressure at zero flow.
- **Sensing:** a signal line from a port with a pipe senses that port's static pressure; from a port without a pipe it senses nothing.
- **Operating cases:** nothing to override.
- **Not modelled:** branch and run losses of a real tee, incomplete mixing, and heat exchange with the surroundings.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/scenarios/test_topology_split_merge.py::test_four_port_junction_equals_two_chained_three_port_junctions` | A 4-port junction gives the flows of two chained 3-port junctions with a negligible link (rel. $10^{-3}$, abs. $10^{-7}$ m³/s); net flow zero within $10^{-7}$ m³/s |
| `backend/tests/scenarios/test_network_invariants.py::test_result_does_not_depend_on_ids_order_or_drawn_direction` | Generated networks give the same flows, pressures and temperatures with shuffled ports and pipes drawn either way at junctions (rel. $10^{-4}$); pinned: a stagnant junction |
| `test_network_invariants.py::test_mass_is_conserved`, `::test_junctions_conserve_energy` | Mass balanced at every junction (rel. $10^{-6}$), including a 0 °C / 55 °C seawater junction; enthalpy balanced within $c_p \cdot 0.1$ K |
| `backend/tests/unit/fluids/test_mixing.py::test_f1_42_mixing_conserves_enthalpy_with_variable_cp` | ISO VG 46 from tanks at 80 °C and 20 °C: outgoing temperature matches an independent enthalpy balance with $c_p(T)$ within 0.1 K; outgoing mass flow equals the incoming within 0.5 % |
| `backend/tests/unit/solver/test_stagnant_branches.py::test_dead_tee_branch_reads_the_static_pressure_of_the_flowing_run` | A port with a pipe but no flow reports the lowest static pressure of the flowing ports within $10^{-3}$ Pa |
| `backend/tests/scenarios/test_junction_ports.py::test_telemetry_ports_report_flow_into_the_junction_per_port` | `ports[k]` flow positive into the junction, `None` without a pipe, mass sum zero within $10^{-6}$ of the throughput |
| `test_junction_ports.py::test_remote_control_valve_holds_the_pressure_of_a_junction_port` | A remote control valve sensing a junction port (`signal-port-k`) holds its 3 bara setpoint within 0.05 bar |
| `backend/tests/regression/test_model_input_errors.py::test_bad_junction_wiring_is_a_model_input_error` | `num_ports` 2 and 9, a handle other than `port-k`, a port beyond `num_ports` and two pipes on one port are input errors |
| `backend/tests/scenarios/test_literature_networks.py::test_jeppson_48_pipe_network_draws_each_literature_junction_as_one_node` | The Jeppson 48-pipe example draws each literature junction as one node (no tee chains); its published flows and losses hold in the other tests of that file |

## Data Fields

Node type: `junction`.

| Field | Unit in file | Default |
|---|---|---|
| `num_ports` | count | 3 |

Port handles `port-0` … `port-(num_ports-1)`; signal handles `signal-port-k`. Telemetry `ports[k]`: the port's state with `flow_rate` positive into the junction, `null` for a port without a pipe. The other fields of every component are in [base_node.md](base_node.md).
