# Splitter (`splitter`)

## 1. Overview & Purpose

A splitter is a tee that divides one inlet stream into two outlet streams. All three connections are at the same pressure; the splitter has no pressure loss of its own. How the flow divides follows from the resistance of the two downstream branches, not from the splitter.

Use it for every branch point in a line. A splitter works in either direction: with reverse flow on its ports it combines streams like a [mixer](mixer.md).

## 2. Governing Standards & Reference Literature

No engineering standard applies. The splitter is an ideal junction: conservation of mass (Kirchhoff's first law) at one common pressure.

## 3. Physical & Mathematical Implementation

### 3.1 Pressure

The splitter is one node with one total-pressure unknown $p_0$. Every edge that leaves it starts at that total pressure:

$$P_{0,\text{inlet}} = P_{0,\text{outlet},0} = P_{0,\text{outlet},1} = p_0$$

Each port reports the static pressure $p_0 - \rho v^2/2$ of the pipe on it: a branch slower than the feed shows a higher static pressure (see [base_node.md](base_node.md#36-total-pressure-at-nodes-static-pressure-at-ports)).

The splitter has no `calculate_delta_p`, so in the edge pressure balance its outlet pressure equals its inlet pressure (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)).

### 3.2 Mass balance

One mass balance row for the node (mass flows, see [base_node.md](base_node.md#31-unknowns-and-equations)):

$$\rho_{\text{in}}\, q_{\text{inlet}} - \rho_0\, q_{\text{outlet},0} - \rho_1\, q_{\text{outlet},1} = 0$$

with each edge's density where it enters the node it flows into. Flows are signed: a negative outlet flow is flow into the splitter.

### 3.3 Derivative

Not applicable — the splitter adds no pressure term. The mass balance row is linear in the edge flows.

### 3.4 Tee losses

The splitter has no branch or run loss coefficient. For a tee whose loss matters, model the loss with a resistance (for example a [calibrated restriction](calibrated_restriction.md) or an [orifice](orifice.md)) on the branch.

## 4. Thermal & Energy Balance

Two steps run during property propagation (see [base_node.md](base_node.md#4-thermal--energy-balance)):

1. `calculate_temperature`: the enthalpy balance of all ports with flow into the splitter sets the temperature of the ports with flow out of it.
2. `calculate`: the inlet pressure is copied to both outlets, and the ports with flow out of the splitter get density and viscosity at their (mixed) temperature. The temperature itself is not overwritten.

In normal forward flow (into the inlet, out of both outlets) both outlets carry the inlet temperature. With reverse flow on the inlet (fed from one or both outlets), the inlet receives the mixed temperature. When the inlet **and** one outlet both feed the splitter, the other outlet carries the enthalpy mix of the two streams. Without any inflow (stagnant splitter) its ports take the temperature of their nearest live neighbour or boundary (dead-leg rule, see [base_node.md](base_node.md#6-operating-modes--model-boundaries)).

## 5. Parameter & Unit Specification Table

Not applicable — the splitter has no parameters of its own. The number of outlets is fixed at two (`num_outlets = 2` in the parser). Only the fields of every component apply (see [base_node.md](base_node.md)).

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic junction ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect; the splitter always joins its connections.
- **Reverse flow:** supported on every port; the mass balance holds for any sign.
- **Unused outlet:** an outlet with no pipe is ignored. A branch that ends in a dead end is pruned before the solve and gets the splitter pressure at zero flow.
- **Operating cases:** nothing to override.
- **Not modelled:** branch and run losses of a real tee. The junction keeps the total pressure; the static pressures follow the velocity heads.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/solver/test_port_transport.py::test_reverse_flow_through_a_splitter_keeps_the_supplying_temperature` | Hot tank (60 °C, level 15 m) on outlet 1 feeds backwards through the splitter: the inlet side and its pipe carry 60 °C within 0.5 K |

No dedicated pressure or mass balance benchmark; the splitter is used in the regulator and stagnant-branch scenarios (`backend/tests/scenarios/test_regulator_scenarios.py`, `backend/tests/unit/solver/test_stagnant_branches.py`).

## Data Fields

Node type: `splitter`. No fields of its own; only the fields of every component in [base_node.md](base_node.md).
