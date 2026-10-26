# Mixer (`mixer`)

## 1. Overview & Purpose

A mixer is a tee that combines two inlet streams into one outlet stream. All three connections are at the same pressure; the mixer has no pressure loss of its own. The outlet temperature is the enthalpy-weighted mix of the incoming streams.

Use it where two lines join, for example a hot and a cold supply, or a bypass rejoining a main line. With reverse flow on its ports it divides a stream like a [splitter](splitter.md).

## 2. Governing Standards & Reference Literature

No engineering standard applies. The mixer is an ideal adiabatic junction: conservation of mass and of enthalpy at one common pressure.

## 3. Physical & Mathematical Implementation

### 3.1 Pressure

The mixer is one node with one total-pressure unknown $p_0$:

$$P_{0,\text{inlet},0} = P_{0,\text{inlet},1} = P_{0,\text{outlet}} = p_0$$

Each port reports the static pressure $p_0 - \rho v^2/2$ of the pipe on it, so the ports differ where the pipe velocities differ (see [base_node.md](base_node.md#36-total-pressure-at-nodes-static-pressure-at-ports)).

The mixer has no `calculate_delta_p`, so in the edge pressure balance its outlet pressure equals its inlet pressure (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)).

### 3.2 Mass balance

One mass balance row for the node (mass flows, see [base_node.md](base_node.md#31-unknowns-and-equations)):

$$\rho_0\, q_{\text{inlet},0} + \rho_1\, q_{\text{inlet},1} - \rho_{\text{out}}\, q_{\text{outlet}} = 0$$

with each edge's density where it enters the node it flows into. Flows are signed: a negative inlet flow is flow out of the mixer. Streams at different temperatures leave with a slightly different volume flow than the sum of the inlets (seawater at 0 °C and 55 °C mixed 1:1: about 0.4 %).

### 3.3 Derivative

Not applicable — the mixer adds no pressure term. The mass balance row is linear in the edge flows.

### 3.4 Tee losses

The mixer has no branch or run loss coefficient. For a junction whose loss matters, add a resistance on the branch.

## 4. Thermal & Energy Balance

The outlet temperature follows from the enthalpy balance of the incoming streams:

$$\dot m_0\, h(T_0) + \dot m_1\, h(T_1) = (\dot m_0 + \dot m_1)\, h(T_{\text{out}}), \qquad h(T) = \int c_p\, dT$$

with $\dot m_k = |q_k|\, \rho_k$. See [base_node.md](base_node.md#41-default-mixing-calculate_temperature) for the direction-aware selection of incoming ports.

After mixing, every port with outward flow reports density and viscosity at $T_{\text{out}}$ (`update_outward_properties`, as the splitter): the outlet, and an inlet that carries reverse flow back into its pipe. With reverse flow out of the mixer's inlets, both inlet pipes receive the mixed temperature.

Example: ISO VG 46 from a hot tank at 80 °C and a cold tank at 20 °C; the outlet temperature lies between the two at the point where the heat given by the hot stream equals the heat taken by the cold stream with $c_p(T)$.

## 5. Parameter & Unit Specification Table

Not applicable — the mixer has no parameters of its own. The number of inlets is fixed at two (`num_inlets = 2` in the parser). Only the fields of every component apply (see [base_node.md](base_node.md)).

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic junction ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect; the mixer always joins its connections.
- **Reverse flow:** supported on every port; temperatures follow the actual flow direction.
- **Unused inlet:** an inlet with no pipe is ignored.
- **Operating cases:** nothing to override.
- **Not modelled:** branch and run losses of a real tee, incomplete mixing, and heat exchange with the surroundings.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/fluids/test_mixing.py::test_f1_42_mixing_conserves_enthalpy_with_variable_cp` | ISO VG 46 from tanks at 80 °C (level 10 m) and 20 °C (level 5 m): outlet temperature matches an independent enthalpy balance with $c_p(T)$ within 0.1 K; outlet mass flow equals the sum of inlet mass flows within 0.5 % |
| `test_mixing.py::test_thermal_mixing_balances` | Same network, within 1 K |
| `backend/tests/scenarios/test_network_invariants.py::test_mass_is_conserved` | Mass flow balanced at every junction (rel. $10^{-6}$), including a 0 °C / 55 °C seawater mixer |
| `backend/tests/unit/solver/test_port_transport.py::test_reverse_flow_through_a_mixer_reaches_both_inlet_pipes_at_the_outlet_temperature` | Hot tank (60 °C) on the outlet feeds backwards: both inlet pipes carry 60 °C within 0.5 K |

## Data Fields

Node type: `mixer`. No fields of its own; only the fields of every component in [base_node.md](base_node.md).
