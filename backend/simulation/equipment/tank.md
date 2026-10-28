# Tank (`tank`)

## 1. Overview & Purpose

A tank is an open vessel at atmospheric pressure with a fixed liquid level. In the network it is a **pressure boundary**: the pressure at its connection is the atmospheric pressure plus the hydrostatic head of the liquid above it. The flow in and out of the tank follows from the rest of the network.

Use it as a supply tank, a return or drain tank, an open sump or any open reservoir. A tank can be a source and a sink at the same time; all its connections share one pressure and one temperature. The tank always holds the system fluid.

It has 1 to 8 neutral nozzles (`port-0` … `port-7`, default 1, no inlet or outlet), each taking one pipe drawn either way. All nozzles are at the tank bottom; a nozzle height of its own is not modelled.

## 2. Governing Standards & Reference Literature

No engineering standard applies. The tank is an idealised infinite reservoir; its pressure is the hydrostatic equation $P = P_{\text{atm}} + \rho g h$.

## 3. Physical & Mathematical Implementation

### 3.1 Port pressure (`calculate`)

$$P_{\text{port}} = P_{\text{atm}} + \rho(T_{\text{tank}})\, g\, (z + h)$$

| Symbol | Meaning | Unit |
| :--- | :--- | :--- |
| $P_{\text{atm}}$ | atmospheric pressure from the global settings (default 101 325 Pa) | Pa |
| $\rho(T_{\text{tank}})$ | density of the system fluid at the tank temperature | kg/m³ |
| $g$ | 9.81 | m/s² |
| $z$ | elevation of the tank bottom above the common datum | m |
| $h$ | liquid level above the tank bottom | m |

The same pressure is set on every port. The parser gives each connected port an inlet slot when its pipe is drawn into the tank and an outlet slot when drawn out of it, as at a [junction](junction.md); the drawn direction only sets the sign of the pipe flow. The solver fixes the tank node to this value and does not solve for it (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)).

Static head per metre of level or elevation at 20 °C:

| Fluid | Density | Head per metre |
| :--- | :--- | :--- |
| Water | 998 kg/m³ | 0.098 bar |
| ISO VG 46 | 870 kg/m³ | 0.085 bar |

### 3.2 Elevation and the common datum

Pipes and all other components have no height. The elevation $z$ of a tank is the only place where height enters the model: two tanks at 10 m and 0 m elevation act like two tanks whose level differs by 10 m. Pump suction and discharge lines therefore carry no static head of their own; include the static height difference through the tank elevations.

### 3.3 Stagnation pressure and pipe entry

The fluid in the tank is at rest. A pipe the flow leaves the tank through takes the entry velocity head $(1 + 0.5)\,\rho v^2/2$, see [pipe.md](pipe.md#34-entry-from-a-reservoir). For why reservoir pressures are stagnation pressures, see [pressure_boundary.md](pressure_boundary.md#32-stagnation-pressure-not-line-pressure).

### 3.4 Derivative

Not applicable — the tank pressure does not depend on the flow; the node has no unknown in the solve.

## 4. Thermal & Energy Balance

The tank temperature is stamped on every port, together with the density and viscosity at that temperature:

$$T_{\text{port}} = T_{\text{tank}}$$

- Fluid leaving the tank has the tank temperature.
- Fluid returning to the tank does not change the tank temperature (infinite heat capacity). The returning pipe still reports the temperature it arrives with.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Fluid Level | m (ft) | `self.fluid_level` | m | 1.0 | $\ge 0$ | Liquid level above the tank bottom |
| Elevation | m (ft) | `self.elevation` | m | 0.0 | any | Tank bottom above the common datum |
| Temp | °C (°F) | `self.temperature` | K | 293.15 K (new tank in the UI: the drawing's ambient temperature) | fluid validity range | Liquid temperature |
| Number of Ports | – | `self.num_ports` | – | 1 | whole number 1 to 8 | Neutral nozzles, each taking one pipe |

The fluid is the system fluid from the global settings (`self.fluid_type`). A `fluid_type` stored on a tank in older files is ignored.

## 6. Operating Modes & Model Boundaries

- **Steady state:** the level is fixed. The tank does not fill or empty; a net in- or outflow does not change $h$ ($\Delta t = 0$).
- **Solver flags:**
  - `is_pressure_boundary = True`
  - `blocks_flow_on_shutdown = False`
  - `use_mcp_formulation = False`
- **Inactive:** `active` has no effect; the tank always fixes its pressure.
- **Reverse flow:** a tank has no direction. Flow can enter or leave through any port; a pipe's flow is positive in its drawn direction.
- **Pressure reference:** every connected circuit needs at least one tank, pressure boundary or flow boundary; a tank gives the circuit its pressure level.
- **Operating cases:** level, elevation and temperature can be overridden per case.
- **Not modelled:**
  - a closed or pressurised vessel (use a [pressure boundary](pressure_boundary.md));
  - a nozzle height per port (all nozzles are at the tank bottom);
  - the gas space, vapour pressure above the liquid, or the tank geometry;
  - the velocity of the liquid inside the tank.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/solver/test_basic_components.py::test_tank_static_pressure` | ISO VG 46, level 2 m, elevation 5 m, no flow: $P = 870 \cdot 9.81 \cdot 7 + 101\,325$ Pa within 500 Pa |
| `backend/tests/unit/equipment/test_pipe_reservoir_entry.py::test_entry_term_follows_the_flow_direction` | Two tanks with 5 m level difference, 10 m DN50: the gravity flow matches entry + friction within 1 %, in either edge direction |
| `backend/tests/unit/fluids/test_pipe_friction_oil.py` | Gravity flow of oil between tanks at 12 m and 2 m level |
| `backend/tests/unit/solver/test_islands.py::test_same_loop_with_a_tank_solves` | A tank gives a closed loop its pressure level |
| `backend/tests/scenarios/test_boundary_ports.py::test_hub_reports_a_flow_per_port_into_it_whatever_the_drawn_direction` | Tank with 4 ports, pipes drawn either way: `ports` in port order, `None` for a free port, flow positive into the tank, the same numbers whatever the drawn direction |

## Data Fields

Node type: `tank`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `elevation_m` | m | 0 |
| `level_m` | m | 1 |
| `temperature_k` | K | 293.15 |
| `num_ports` | count | 1 |
