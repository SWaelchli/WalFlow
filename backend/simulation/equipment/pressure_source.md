# Pressure Source (`pressure_source`)

## 1. Overview & Purpose

A pressure source imposes a constant pressure at its ports. In the network it is a **pressure boundary**, like a [tank](tank.md): the pressure is fixed, and the flow through it follows from the resistance of the connected network. It has an inlet and an outlet port; both carry the set pressure, and flow can enter or leave through either.

Use it for a pressurised vessel, a utility header or main, or any point where the pressure is known.

## 2. Governing Standards & Reference Literature

No engineering standard applies. The pressure source is a mathematical boundary condition: an idealised infinite reservoir at a fixed pressure.

## 3. Physical & Mathematical Implementation

### 3.1 Port pressure (`calculate`)

$$P_{\text{inlet}} = P_{\text{outlet}} = P_{\text{set}} \quad \text{[Pa]}$$

The solver fixes the node to this value and does not solve for it (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)).

### 3.2 Stagnation pressure, not line pressure

The source is a reservoir: infinite fluid **at rest** at $P_{\text{set}}$. $P_{\text{set}}$ is therefore a stagnation pressure, not the static pressure a gauge reads on a pipe with fluid flowing past it. A pipe the flow leaves the source through takes the entry velocity head (acceleration from rest plus a sharp-edged entrance, $K = 0.5$), see [pipe.md](pipe.md#34-entry-from-a-reservoir):

$$P_{\text{static, pipe start}} = P_{\text{set}} - (1 + 0.5)\,\frac{\rho v^2}{2}$$

| Pipe velocity (water) | Entry drop |
|---|---|
| 1 m/s | 0.0075 bar |
| 2 m/s | 0.03 bar |
| 3 m/s | 0.07 bar |

What to model with it:

- **Vessel, pressurised tank, utility header or main** feeding a smaller branch: enter the vessel or header pressure. The header velocity is small compared with the branch, so the header pressure is close to stagnation and the branch really does pay the entry. This is the intended use.
- **A cut point inside a line** ("the gauge at this flange reads 6 bar, model from here"): the fluid there already moves at pipe velocity. Entering the gauge reading under-predicts the downstream pressure by the entry drop above. Enter $P_{\text{gauge}} + 1.5\,\rho v^2/2$ instead, or start the model upstream at a vessel. The difference only matters where pressures are low, for example at a pump suction (NPSH).

Design decision: there is no static-pressure ("flowing line") mode and $K$ is not adjustable.
- A boundary that delivers kinetic energy for free at any flow lets an expander recover more pressure than the line loses. A short source → expander → tank line then has no steady state.
- Other entrance shapes (rounded $K \approx 0.04$, projecting $K \approx 1.0$) change the result by hundredths of a bar at normal velocities.

### 3.3 Derivative

Not applicable — the pressure does not depend on the flow; the node has no unknown in the solve.

### 3.4 Relief analysis ramp

The pressure source is a relief driver (`is_relief_driver = True`). During the relief analysis, `apply_relief_ramp(λ)` scales its pressure from atmospheric ($\lambda = 0$) to the case value ($\lambda = 1$):

$$P_{\text{set}}(\lambda) = P_{\text{atm}} + \lambda\,(P_{\text{set}} - P_{\text{atm}})$$

`reset_relief_ramp` restores the case value. See [relief_device.md](relief_device.md).

## 4. Thermal & Energy Balance

The set temperature is stamped on both ports, with the density and viscosity of the system fluid at that temperature:

$$T_{\text{inlet}} = T_{\text{outlet}} = T_{\text{set}}$$

Fluid returning into the source does not change its temperature.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Set Pressure | bar(a) (psi(a)) | `self.source_pressure` | Pa | 6.0 bar(a) | $> 0$ | Absolute stagnation pressure at the ports |
| Injected Temp | °C (°F) | `self.temperature` | K | 293.15 K | fluid validity range | Temperature of the fluid leaving the source |

## 6. Operating Modes & Model Boundaries

- **Steady state:** a fixed pressure; no capacity, no pressure decay ($\Delta t = 0$).
- **Solver flags:**
  - `is_pressure_boundary = True`
  - `is_flow_boundary = False`
  - `blocks_flow_on_shutdown = False`
  - `use_mcp_formulation = False`
  - `is_relief_driver = True`
- **Inactive:** `active` has no effect; the source always fixes its pressure.
- **Reverse flow:** flow can enter or leave through either port; the source supplies or absorbs any flow.
- **Operating cases:** set pressure and temperature can be overridden per case.
- **Not modelled:** a supply pressure that falls with flow (model a header with a pipe or restriction behind the source), and a static-pressure ("flowing line") boundary (section 3.2).

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_sources.py::TestPressureSource` | `calculate()` sets 5 bar(a) and 25 °C on every port; density above 900 kg/m³ |
| `test_sources.py::TestNetworkSolve::test_pressure_source_network_solve` | Source 6 bar(a) → 10 m × 50 mm pipe → tank: source outlet pressure 600 000 Pa within 1 Pa |
| `backend/tests/unit/equipment/test_pipe_reservoir_entry.py::test_flow_out_of_reservoir_pays_entry_velocity_head` | Source 0.5 bar above a tank, 10 m DN50: flow matches entry + friction within 1 % |
| `test_pipe_reservoir_entry.py::test_expander_between_reservoirs_with_short_pipes` | Source → short DN50 → expander → tank has a steady state matching an independent loss sum within 1 % |

## Data Fields

Node type: `pressure_source`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `source_pressure_bara` | bar(a) | 6 |
| `temperature_k` | K | 293.15 |
