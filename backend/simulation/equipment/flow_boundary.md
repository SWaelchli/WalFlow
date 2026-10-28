# Flow Boundary (`flow_boundary`)

## 1. Overview & Purpose

A flow boundary supplies a constant volume flow to the network or draws one from it. The pressure at its ports follows from the resistance of the connected network, up to a maximum discharge pressure (supply) or down to a minimum suction pressure (draw).

Use it as a supply for a dosing pump, a metered supply, a process stream that arrives at a known rate, or any point where the flow is known and the pressure is not. Use it as a draw for a consumer or demand that takes a known rate, as at the nodes of a distribution network.

It has 1 to 8 neutral ports (`port-0` … `port-7`, default 1). The set flow is a magnitude; the **flow direction** (supply or draw) gives its sign. With several ports, the **flow split** sets how the set flow is shared (section 3.3).

## 2. Governing Standards & Reference Literature

No engineering standard applies. The flow boundary is a mathematical boundary condition (an ideal flow source or sink with a pressure limit). It is implemented as a stiff spring instead of a hard flow constraint, so it fits the same edge pressure balance as every other component.

## 3. Physical & Mathematical Implementation

### 3.1 Reference pressure

The flow boundary node has no inlet. Its node pressure is pinned to the atmospheric pressure; the solver replaces its mass balance row with

$$p_{\text{node}} - P_{\text{atm}} = 0$$

so the pressure the boundary delivers is measured from atmospheric pressure (see [base_node.md](base_node.md#31-unknowns-and-equations)).

### 3.2 Hidden port nodes and links

The pipes do not end on the boundary node. The parser (`_build_boundary_links`) puts hidden junctions at its ports and links each to an outlet of the boundary node by a `BoundaryLink` edge without pressure drop ([component_link.md](component_link.md#8-boundary-link)). Each link carries one spring (section 3.4), so the hidden junction is at the spring's outlet pressure.

- **Common pressure** (`common_pressure`): one hidden junction `<id>#ports` holds all the pipes (port $k$ of the boundary on its port $k$) and one link `<id>#link`.
- **Fixed flow per port** (`total_split`, `per_port`): one two-port junction `<id>#port-k` per connected port, the pipe on its port 0, and one link `<id>#link-k` each.

A pipe on a flow boundary runs out of it for a supply and into it for a draw, so its flow is positive in either case; the canvas stores it that way and the parser raises a `ModelInputError` for a pipe the other way round. The link flow keeps the boundary's sign (negative for a draw). A boundary without pipes gets no link.

### 3.3 Flow split

$Q_{\text{set}} \ge 0$ is the set flow, $Q_k \ge 0$ the set flow of port $k$ (`port_flows`), $M$ the number of connected ports, $s = +1$ for a supply and $-1$ for a draw. The set flow of each link (signed, positive out of the boundary):

| Flow split | Links | Link set flow $Q_{\text{link}}$ | Total flow | Port pressures |
| :--- | :--- | :--- | :--- | :--- |
| Common pressure | 1 | $s\,Q_{\text{set}}$ | $Q_{\text{set}}$ | one pressure; the share of each port is solved from the network |
| Equal share (`total_split`) | $M$ | $s\,Q_{\text{set}} / M$ | $Q_{\text{set}}$ | each port its own |
| Set flow per port (`per_port`) | $M$ | $s\,Q_k$ | $\sum Q_k$ over the connected ports | each port its own |

With one port the three are the same. With an equal share every port needs a pipe; a free port is a `ModelInputError` (its share would have no way out). With a set flow per port a free port is ignored: its flow is not applied. A port without a value in `port_flows_lmin` takes `set_flow_lmin`. For `per_port` the parser sets $Q_{\text{set}} = \sum Q_k$ over all ports, the reference a relief ramp scales, so the ramp scales every port flow by the same factor. In common pressure a free port is a dead end without flow, and a port can carry flow against the boundary's direction where the network loops back (a supply of 300 L/min over three ports into tanks at 1, 5 and 10 m level delivers 183 and 134 L/min to the low tanks and takes 17 L/min back from the high one).

### 3.4 Spring curve (`calculate_delta_p`)

On each link, with the link flow $Q$ (the solver passes the link's outlet index, so the links of a per-port boundary each have their own $Q_{\text{link}}$ and $k$):

$$\Delta P = k\,(Q - Q_{\text{link}}), \qquad P_{\text{outlet}} = P_{\text{atm}} - \Delta P$$

with the stiffness

$$k = \frac{10\ \text{MPa}}{0.01\, |Q_{\text{ref}}|}$$

- $\Delta P < 0$ when $Q < Q_{\text{link}}$: the boundary raises the pressure to push the flow (a supply), or lowers its suction less (a draw).
- $\Delta P > 0$ when $Q > Q_{\text{link}}$: the boundary resists a supply, or pulls harder on a draw.
- $k$ gives 10 MPa (100 bar) per 1 % flow deviation. $Q_{\text{ref}}$ is the link set flow at the case flow, unchanged by the relief ramp. For $|Q_{\text{ref}}| < 10^{-6}$ m³/s, $k = 10^{10}$ Pa·s/m³.

The flow deviation is the pressure difference from atmospheric divided by $k$. It is negligible at any real pressure:

| Outlet pressure (gauge) | Flow deviation |
| :--- | :--- |
| 1 bar | 0.01 % |
| 10 bar | 0.1 % |
| 49 bar (at the 50 bar(a) default limit) | 0.49 % |

### 3.5 Pressure limits

| Direction | Limit on $\Delta P$ | Port pressure | Flag |
| :--- | :--- | :--- | :--- |
| Supply | $-(P_{\text{max}} - P_{\text{atm}}) \le \Delta P \le 20$ MPa | $\le P_{\text{max}}$ | `pressure_cap_reached` |
| Draw | $-20\ \text{MPa} \le \Delta P \le P_{\text{atm}} - P_{\text{min}}$ | $\ge P_{\text{min}}$ | `suction_limit_reached` |

- **Maximum discharge pressure** $P_{\text{max}}$ (supply, absolute): when the network needs more, the boundary delivers less than the set flow, like a pump on its relief valve. The flag is set when an outlet's total pressure is within 1 Pa of $P_{\text{max}}$.
- **Minimum suction pressure** $P_{\text{min}}$ (draw, absolute, default 0 bar(a)): when the network cannot deliver the set flow above it, the boundary draws less, so it cannot pull the network below $P_{\text{min}}$. The flag is set when an outlet's total pressure is within 1 Pa of $P_{\text{min}}$.
- On a limit the boundary holds the limit pressure and the flow follows from the network, without a lower bound: a draw whose network cannot reach $P_{\text{min}}$ (a limit above the pressure the network can offer, e.g. above the tank pressure) supplies flow at $P_{\text{min}}$, and a supply whose network is above $P_{\text{max}}$ takes flow back. Keep $P_{\text{min}}$ below and $P_{\text{max}}$ above the pressures the network can hold. A slope against the direction would put a kink at zero flow, where the solve starts, and fails the solve of large networks.
- A maximum discharge pressure at or below $P_{\text{atm}}$ (the parser accepts above 1 bar(a)) holds the port at $P_{\text{atm}}$.
- The reported static port pressure is lower than the total by the velocity head of the pipe on it.
- **20 MPa** on the other side is a numerical guard for solver search steps, not a physical limit.

### 3.6 Derivative

`calculate_dp_derivative` gives the slope analytically: $k$ between the limits and 0 on a limit. The solver uses it instead of its numerical derivative (see [base_node.md](base_node.md#33-jacobian)), whose step of 0.01 % of the flow moves the spring by 100 kPa and would cross the suction limit of a draw.

### 3.7 Relief analysis ramp

A supply is a relief driver (`is_relief_driver = True`); a draw is not, since ramping it up only lowers the pressures. During the relief analysis, `apply_relief_ramp(λ)` sets $Q_{\text{set}}(\lambda) = \lambda\, Q_{\text{set}}$; the stiffness stays referenced to the case flow. `reset_relief_ramp` restores the case value. A draw stays at its case value while the drivers ramp from $\lambda = 0$; a draw larger than the supply at low $\lambda$ holds the network at its minimum suction pressure. See [relief_device.md](relief_device.md).

## 4. Thermal & Energy Balance

The set temperature is stamped on the boundary's outlets, with the density and viscosity of the system fluid at that temperature; the links carry it to the ports:

$$T_{\text{port}} = T_{\text{set}} \quad \text{(supply)}$$

The pressure rise of the boundary adds no heat (an ideal source, not a pump with losses).

For a draw the fluid leaving the network has the network temperature; the set temperature has no effect on the network. The mixing balance does not count the boundary as a supply.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Flow Direction | – | `self.direction` | – | supply | supply, draw | Supply into the network or draw out of it |
| Set Flow | L/min (GPM) | `self.set_flow` | m³/s | 50 L/min | $\ge 0$ | Magnitude of the flow; the direction gives its sign (not shown with a set flow per port) |
| Port k Flow | L/min (GPM) | `self.port_flows[k]` | m³/s | Set Flow | $\ge 0$ | Set flow per port only: the flow of port k |
| Number of Ports | – | `self.num_ports` | – | 1 | whole number 1 to 8 | Neutral ports, each taking one pipe |
| Flow Split | – | `self.flow_split` | – | common pressure | "Calculate flow per port based on equal pressure", "Distribute flow equally between ports", "Set flow at every port" | How the set flow is shared over the ports (section 3.3) |
| Injected Temp | °C (°F) | `self.temperature` | K | 293.15 K | fluid validity range | Temperature of the supplied fluid |
| Max. Discharge Pressure | bar(a) (psi(a)) | `self.max_discharge_pressure` | Pa | 50 bar(a) | $> 1$ bar(a) | Supply: port pressure limit; above it the flow drops below the set flow |
| Min. Suction Pressure | bar(a) (psi(a)) | `self.min_suction_pressure` | Pa | 0 bar(a) | $\ge 0$ | Draw: port pressure limit; below it the flow drops below the set flow |

The parser rejects a negative set flow or port flow, a maximum discharge pressure $\le 1$ bar(a) on a supply and a minimum suction pressure below 0 bar(a).

## 6. Operating Modes & Model Boundaries

- **Steady state:** a constant flow ($\Delta t = 0$).
- **Solver flags:**
  - `is_pressure_boundary = False`
  - `blocks_flow_on_shutdown = False`
  - `use_mcp_formulation = False`
  - `is_relief_driver = True` for a supply, `False` for a draw
- **Pressure reference:** for topology pruning a flow boundary counts as a reference, like a tank. At zero set flow its section carries no flow and takes its pressure from its neighbours instead (stagnant section, see [base_node.md](base_node.md#6-operating-modes--model-boundaries)). Its temperature still applies: the dead leg it feeds takes the boundary temperature.
- **Inactive:** `active` has no effect; set the flow to 0 to stop the boundary.
- **Reverse flow:** the flow follows the direction (out of the boundary for a supply, into it for a draw). The spring resists any other flow, so the direction only reverses on a limit of section 3.5, or at one port of a common-pressure boundary (section 3.3).
- **Operating cases:** set flow (not the port flows of a set flow per port), direction, temperature and both pressure limits can be overridden per case.
- **Telemetry:** `ports[k]` per canvas port, read from the hidden junctions (flow positive into the boundary, so negative for a supply); the hidden junctions and links are not reported. Messages name the boundary.
- **Not modelled:** a pump curve (use a [volumetric](volumetric_pump.md) or [centrifugal pump](centrifugal_pump.md)), suction conditions and NPSH, and a pressure-dependent demand.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_sources.py::TestFlowBoundary` | $\Delta P = 0$ at the set flow (within $10^{-7}$ Pa); negative below it, positive above it, also for a draw; never beyond 20 MPa; only a supply drives relief |
| `test_sources.py::TestNetworkSolve::test_flow_boundary_network_solve` | 45 L/min → 10 m × 50 mm pipe → tank, and the same as a draw from the tank: flow within 1 L/min of the set flow; outlet pressure $= P_{\text{atm}} - \Delta P$ within 1 Pa |
| `backend/tests/unit/equipment/test_flow_boundary_pressure_cap.py` | 100 L/min through 200 m × 15 mm with a 3 bar(a) supply limit or a 0.5 bar(a) draw limit: flag of that direction set, port held at the limit, flow below 100 L/min; through 80 mm: both flags clear, flow within 1 %. Two ports on a wide and a narrow pipe: each port at its own pressure, only the port at the 6 bar(a) limit sets the flag |
| `backend/tests/scenarios/test_boundary_ports.py::test_flow_boundary_shares_its_flow_over_the_ports` | 300 L/min over 3 ports into tanks at 1, 5 and 10 m (50 m × 40 mm): common pressure gives 183.2 / 133.8 / −17.1 L/min at one total pressure; total split 100 each; per port with port flows 50 / 120 / 300 L/min gives those flows, also with a free fourth port and as a draw |
| `test_boundary_ports.py::test_draw_takes_its_flow_into_the_boundary_as_a_positive_flow` | Tank (2 m) → 10 m × 50 mm → draw of 100 L/min: pipe and port flow +100 L/min within 0.5 %, suction flag clear |
| `test_boundary_ports.py::test_remote_control_valve_senses_the_pressure_of_a_boundary_port` | A remote control valve senses the pressure of the port (`signal-port-0`) of a draw |
| `backend/tests/regression/test_model_input_errors.py::test_bad_boundary_input_is_a_model_input_error` | Pipe the wrong way, negative set flow or minimum suction pressure, unknown direction or split, negative port flow, free port with an equal share, bad port count, port beyond the count, two pipes on a port: each a named `ModelInputError` |
| `backend/tests/unit/solver/test_stagnant_branches.py::test_flow_boundary_at_zero_flow_is_no_pressure_reference` | Boundary at 0 L/min behind a check valve: its outlet is flagged stagnant and takes the check valve outlet pressure within 1 Pa |

## Data Fields

Node type: `flow_boundary`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_direction` | text (`supply` / `draw`) | supply |
| `set_flow_lmin` | L/min | 50 |
| `num_ports` | count | 1 |
| `flow_split` | text (`common_pressure` / `total_split` / `per_port`) | common_pressure |
| `port_flows_lmin` | L/min | `set_flow_lmin` for each port |
| `temperature_k` | K | 293.15 |
| `max_discharge_pressure_bara` | bar(a) | 50 |
| `min_suction_pressure_bara` | bar(a) | 0 |
