# Hydraulic Node Base (`HydraulicNode`)

## 1. Overview & Purpose

`HydraulicNode` is the parent class of every equipment model. It holds:

- the inlet and outlet ports (`Port` objects with pressure, flow rate, temperature, density and viscosity);
- the solver flags that tell the network solver how to treat the component;
- the `calculate()` contract and the default enthalpy mixing (`calculate_temperature`);
- shared helpers: NPSH at a pump suction (`update_npsh`) and the relief-analysis ramp hooks;
- pump module functions: shaft power (`pump_shaft_power`) and the share of the pump pressure change that heats the fluid (`pump_heat_factor`), both with the efficiency floor `MIN_PUMP_EFFICIENCY` = 1 %, which is also the parser's input minimum.

`GraphParser._build_node` turns each node of a `.wlf` file into one equipment instance. A node type without its own branch in the parser becomes a plain `HydraulicNode`. The other equipment documents describe their own equations; this document describes how every component fits into the network solve, so the component documents link here instead of repeating it.

## 2. Governing Standards & Reference Literature

Not applicable — this is the software contract between the components and the solver, not a physical model. The network formulation (node pressures and edge flows solved together by Newton-Raphson) is the standard global-gradient form of pipe network analysis.

## 3. Physical & Mathematical Implementation

### 3.1 Unknowns and equations

The solver (`NetworkSolver`, `backend/simulation/solver.py`) works on the reduced network after topology pruning (section 6). Its unknowns are:

- $p_i$: the inlet pressure of every node that is not a pressure boundary [Pa];
- $q_j$: the volume flow on every pipe (edge) [m³/s], positive from the edge source to the edge target.

There is one equation per unknown:

**Mass balance, one row per internal node:**

$$r_i = 5 \cdot \frac{\sum q_{\text{in}} - \sum q_{\text{out}}}{q_{\text{scale}}} + 10^{-9}\, \frac{p_i}{p_{\text{scale}}} = 0$$

The factor 5 balances the row against the pressure rows. The $10^{-9}$ term keeps the matrix from becoming exactly singular for a floating node. A flow source replaces its mass balance with $p_i = P_{\text{atm}}$, see [flow_source.md](flow_source.md).

**Pressure balance, one row per edge** from node $s$ to node $t$:

$$r_j = \frac{P_{\text{out},s}(p_s, q_j) - p_t - \Delta P_{\text{pipe}}(q_j)}{p_{\text{scale}}} = 0$$

Scales: $p_{\text{scale}} = 10^5$ Pa, $q_{\text{scale}} = 10^{-3}$ m³/s.

### 3.2 How a component enters the equations

The component sets the outlet pressure $P_{\text{out},s}$ from its inlet pressure and the flow of the edge that leaves it:

| Component kind | Outlet pressure |
| :--- | :--- |
| Resistance (valve, orifice, filter, ...) | $P_{\text{out}} = p_{\text{in}} - \Delta P(q, \rho, \mu)$ from `calculate_delta_p` |
| Pump | $P_{\text{out}} = p_{\text{in}} + \Delta P(q, \rho, \mu)$ (a pressure rise) |
| Junction, measurement tap, plain node | $P_{\text{out}} = p_{\text{in}}$ (no `calculate_delta_p`) |
| Pressure boundary (tank, pressure source) | Fixed: the value returned by `calculate()` |
| MCP component (check valves, relief devices) | Complementarity row, see 3.4 |

$\rho$ and $\mu$ are the values held on the component's inlet port. They are constant during one Newton solve and updated between solves (section 4).

Sign convention: `calculate_delta_p` is signed. A positive flow gives a positive drop; reverse flow gives a negative drop, unless the component models otherwise.

### 3.3 Jacobian

The solver builds a sparse Jacobian. The derivative of a pressure row with respect to the edge flow is assembled from:

| Term | Source |
| :--- | :--- |
| Pipe $\partial \Delta P_{\text{pipe}} / \partial q$ | `Pipe.calculate_dp_derivative`, floored at $10^{-3}$ Pa·s/m³ |
| Pump $\partial \Delta P / \partial q$ | the pump's `calculate_dp_derivative` (volumetric pump: `outlet_derivatives`) |
| Other resistances | central difference of the node outlet pressure, step $h = \max(10^{-12}, 10^{-4} |q|)$ m³/s |
| MCP rows | central difference of the whole row residual |

So for valves, orifices, filters and the like, the solver does **not** call their `calculate_dp_derivative`. It differentiates the outlet pressure numerically, so viscosity corrections and branch switches inside the model are always included. These components have no analytical derivative; `HydraulicNode.calculate_dp_derivative` gives a central-difference fallback ($dq = 10^{-6}$ m³/s) of `calculate_delta_p`. No production code calls it. It is not a pressure-drop slope for MCP and relief devices, whose `calculate_delta_p` with node pressures returns a residual row.

### 3.4 Complementarity (MCP) components

A component with `use_mcp_formulation = True` (and every relief device) gets a row in which its `calculate_delta_p` also receives the inlet pressure and an estimate of the outlet pressure ($p_t + \Delta P_{\text{pipe}}$). This lets a check valve choose between "closed, $q = 0$" and "open, flow equation" smoothly (Fischer-Burmeister), see [check_valve.md](check_valve.md). Relief devices decide open or closed between solves and hold that state during the solve, see [relief_device.md](relief_device.md).

### 3.5 Outer loops

One Newton solve finds the hydraulic equilibrium for fixed fluid properties and fixed control positions. Around it the solver runs, up to `control_iterations` (default 100) times:

1. **Property propagation** (section 4).
2. **Pressure controllers**: regulators and remote control valves adjust their opening to their setpoint, see [linear_regulator.md](linear_regulator.md).
3. **3-way TCV mixing ratio** toward the temperature setpoint, see [three_way_tcv.md](three_way_tcv.md).
4. **Relief device states**, see [relief_device.md](relief_device.md).

All of these are steady-state fixed-point iterations, not time steps.

## 4. Thermal & Energy Balance

### 4.1 Default mixing (`calculate_temperature`)

Every port with flow **into** the component is a source; every other port receives the mixed temperature. Inward means $q > 0$ on an inlet or $q < 0$ on an outlet, so the balance follows the actual flow direction.

The mixed temperature conserves enthalpy:

$$\sum_k \dot m_k\, h(T_k) = \Big(\sum_k \dot m_k\Big)\, h(T_{\text{mix}}), \qquad \dot m_k = |q_k|\, \rho_k, \qquad h(T) = \int_{273.15\,\text{K}}^{T} c_p\, dT$$

$T_{\text{mix}}$ is found by inverting $h(T)$ (`FluidProperties.get_temperature_from_enthalpy`), starting from the mass-weighted mean temperature. With constant $c_p$ this is the mass-weighted mean. Without inward flow, the temperatures stay unchanged.

Components with their own thermal effect (throttling heat, pump waste heat, heat exchanger duty) set their outlet temperature themselves.

Junctions without their own thermal effect (splitter, mixer, measure point) keep the mixed temperature and only call `update_outward_properties()` in `calculate()`, which evaluates density and viscosity of each outward port at its temperature. `has_inflow()` tells whether any port feeds the node.

### 4.2 Property propagation

After each hydraulic solve, `NetworkSolver._propagate_properties` passes temperature, density and viscosity along the solved flows: pipe by pipe from the upstream port, then node by node (`calculate_temperature`, then `calculate()`). It repeats up to `property_iterations` (default 5) passes and stops when no port temperature changes by more than 0.01 K. Solved pressures are saved before and restored after, so this step changes only the fluid state.

Near a flow reversal the hydraulic solve and the property update can drive each other in a cycle: a branch flips direction, the mixed temperature changes, the new viscosities flip the branch back. The property update therefore uses the flows $Q_{\text{prop}}$ instead of the solved flows $Q$:

$$Q_{\text{prop}}^{k} = Q_{\text{prop}}^{k-1} + \omega\,(Q^{k} - Q_{\text{prop}}^{k-1})$$

$\omega$ starts at 1, so $Q_{\text{prop}} = Q$ until the correction $Q^{k} - Q_{\text{prop}}^{k-1}$ swings back against the previous one (negative dot product) without at least halving in size. On each such swing $\omega$ is halved, down to 1/64; after three corrections in a row in the same direction it doubles again, up to 1, so a single Newton overshoot does not slow the rest of the run. A relief state change and a solve with frozen properties (see below) do not count as a swing: the comparison starts afresh after them, keeping $\omega$. While a pressure controller or 3-way TCV still moves its position, $\omega$ is held at 1 and no swing is counted: those steps change the flows on purpose, and the next step needs the temperatures of the new flows.

Once the temperatures change by less than 0.05 K between outer iterations, $\max|Q - Q_{\text{prop}}|$ is within $10^{-4}$ of the largest edge flow (plus $10^{-9}$ m³/s), every edge with more than $10^{-9}$ m³/s runs the same way in $Q$ and $Q_{\text{prop}}$, and the pressure controllers and 3-way TCVs have settled, the solver holds the fluid properties fixed for the next hydraulic solve. The loop ends only on such a frozen solve in which the controllers are still at their setpoints and a TCV that was on its setpoint still is (its outlet temperature follows the new flow split); otherwise the properties are propagated again before the next freeze, and a relief state change releases them as well. The reported solution comes from the frozen solve and is reported without propagating again, so the reported pressures satisfy every component's equation with the reported densities and viscosities, and the controllers are judged on those pressures. If the loop stops at its iteration limit first, one more hydraulic solve with the final properties is run before reporting; if that solve fails, the previous solution is reported with `properties_converged = false`. Pumps recompute NPSHa and the cavitation warning from the reported suction pressure. The reported temperatures belong to the last propagated solve; on a converged run the difference is below the 0.05 K step. With `properties_converged = false` they were propagated with $Q_{\text{prop}}$ and can differ more.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Label | text | `self.name` | - | `<type>_<id>` | any | Name shown in results and messages |
| Active | bool | `self.active` | - | `true` | `true` / `false` | Component in service; effect per component (section 6) |
| Ramp during relief analysis | bool | `self.relief_ramp_enabled` | - | `true` | `true` / `false` | A driver (pump, source) takes part in the relief ramp |

### 5.1 Field naming rule

Every node and pipe stores its inputs in its `data` object. Every dimensional field carries its unit in the name:

| Suffix | Unit | Suffix | Unit |
|---|---|---|---|
| `_pa` | Pa | `_lmin` | L/min |
| `_bar` | bar (difference) | `_kw` | kW |
| `_barg` | bar gauge | `_w_k` | W/K |
| `_bara` | bar absolute | `_pct` | % |
| `_c` | °C | `_deg` | degree |
| `_k` | K | `_mpas` | mPa·s |
| `_m` | m | `_mm` | mm |

Fields without a unit (text, flags, `Cv` coefficients, DN numbers, indices) have no suffix. The value in the file is in the unit of the name; the parser converts to SI (Pa, K, m, m³/s, W) for the model.

Each equipment document has a **Data Fields** section listing what the parser reads for its node type. A test (`backend/tests/unit/solver/test_node_fields_documented.py`) checks that these sections and the parser list exactly the same fields, and that every dimensional field follows this rule.

## 6. Operating Modes & Model Boundaries

- **Steady state:** every equation is algebraic ($\Delta t = 0$). There is no inertia, no storage and no time history.
- **No elevation along the network:** components and pipes have no height. Static head enters only through the tank level and elevation, see [tank.md](tank.md).
- **Solver flags** (defaults on the base class):
  - `is_pressure_boundary = False` — `True` fixes the node pressure to `calculate()` (tank, pressure source).
  - `blocks_flow_on_shutdown = False` — `True` removes the component from the solve when it is inactive (positive displacement pump).
  - `use_mcp_formulation = False` — `True` gives the complementarity row of section 3.4.
  - `is_relief_driver = False` — `True` when `apply_relief_ramp` scales the component in the relief analysis.
- **Inactive components:** `active = false` means the component is out of service. What that means is defined per component (a stopped centrifugal pump is a resistance, a stopped volumetric pump blocks, a heat exchanger stops transferring heat).
- **Topology pruning** before each run (`prune_topology`):
  - stopped blocking pumps and forced-closed relief devices are removed with their edges;
  - only nodes connected to a pressure boundary or a flow source are solved;
  - dead ends (non-boundary nodes with at most one edge) are removed repeatedly.
- **Islands:** a connected circuit of two or more nodes without a tank, pressure source or flow source has no defined pressure level. The solve stops with a message naming it.
- **Pressures without flow:** removed dead legs and sections shut in by blocking devices get their pressure at zero flow from their neighbours (`_fill_pruned_pressures`, `_assign_stagnant_pressures`). Pumps keep their shutoff head, regulators their lock-up pressure. Their ports are flagged `stagnant`.
- **Temperatures without flow:** a port with $|Q| \le$ `Q_DEAD_LEG` (1e-9 m³/s, where the flow sign is solver noise) carries no fluid, so it takes the temperature of the nearest seed, walking through stagnant ports only (`_fill_stagnant_temperatures`, end of each property propagation). Seeds are the ports of a pressure boundary or flow source, and the ports of a node with flow (a stagnant port of such a node takes its leaving temperature). Equally near seeds are ranked boundaries first, then by node name and id; seeds are never overwritten. A stagnant pipe has one temperature; crossing a stagnant node counts as one step, so each side of a closed check valve takes the temperature of its own neighbour. Density and viscosity are evaluated at that temperature with the system fluid, also next to a tank that holds its own fluid. No heat loss to ambient is modelled.
- **Operating cases:** `GraphParser.resolve_graph_for_case` merges the active case's node overrides into the node's `data` (and its global setting overrides) before the parser builds the components. Every field in a **Data Fields** table can therefore be overridden per case.

## 7. Verification & Benchmarks

| Test | What it checks |
| :--- | :--- |
| `backend/tests/unit/solver/test_node_fields_documented.py` | Every field the parser reads is in a **Data Fields** table and vice versa; dimensional fields carry their unit suffix |
| `backend/tests/unit/fluids/test_mixing.py::test_f1_42_mixing_conserves_enthalpy_with_variable_cp` | Mixer outlet temperature from 80 °C and 20 °C ISO VG 46 streams matches an independent enthalpy balance with $c_p(T)$ within 0.1 K; mass flow balanced within 0.5 % |
| `backend/tests/unit/solver/test_basic_components.py::test_mass_balance` | Mixer outflow equals the sum of inflows within $10^{-10}$ m³/s |
| `backend/tests/unit/solver/test_islands.py` | A closed loop without a tank is reported; the same loop with a tank solves |
| `backend/tests/unit/solver/test_active_inactive.py` | Inactive pumps and heat exchanger behave as defined in their documents |
| `backend/tests/unit/solver/test_stagnant_branches.py` | Pressures in shut-in sections and dead legs do not depend on node or edge order |

## Data Fields

Node type: all (read for every component).

| Field | Unit in file | Default |
|---|---|---|
| `label` | text | `<type>_<id>` |
| `active` | bool | true |
| `relief_ramp_enabled` | bool | not set |
