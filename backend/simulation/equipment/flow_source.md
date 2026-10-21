# Flow Source (`flow_source`)

## 1. Overview & Purpose

A flow source injects a constant volume flow into the network through its single outlet port. The pressure at the outlet follows from the resistance of the downstream network, up to a maximum discharge pressure.

Use it for a dosing pump, a metered supply, a process stream that arrives at a known rate, or any point where the flow is known and the pressure is not.

## 2. Governing Standards & Reference Literature

No engineering standard applies. The flow source is a mathematical boundary condition (an ideal flow source with a pressure limit). It is implemented as a stiff spring instead of a hard flow constraint, so it fits the same edge pressure balance as every other component.

## 3. Physical & Mathematical Implementation

### 3.1 Reference pressure

The flow source has no inlet. Its node pressure is pinned to the atmospheric pressure; the solver replaces its mass balance row with

$$p_{\text{node}} - P_{\text{atm}} = 0$$

so the pressure the source delivers is measured from atmospheric pressure (see [base_node.md](base_node.md#31-unknowns-and-equations)).

### 3.2 Spring curve (`calculate_delta_p`)

$$\Delta P = k\,(Q - Q_{\text{set}}), \qquad P_{\text{outlet}} = P_{\text{atm}} - \Delta P$$

with the stiffness

$$k = \frac{10\ \text{MPa}}{0.01\, |Q_{\text{ref}}|}$$

- $\Delta P < 0$ when $Q < Q_{\text{set}}$: the source raises the pressure to push the flow.
- $\Delta P > 0$ when $Q > Q_{\text{set}}$: the source resists.
- $k$ gives 10 MPa (100 bar) per 1 % flow deviation. $Q_{\text{ref}}$ is the case flow, unchanged by the relief ramp. For $|Q_{\text{ref}}| < 10^{-6}$ m³/s, $k = 10^{10}$ Pa·s/m³.

The flow deviation is the delivered pressure rise divided by $k$. It is negligible at any real pressure:

| Outlet pressure (gauge) | Flow below set flow |
| :--- | :--- |
| 1 bar | 0.01 % |
| 10 bar | 0.1 % |
| 49 bar (at the 50 bar(a) default limit) | 0.49 % |

### 3.3 Pressure limits

$$-\left(P_{\text{max}} - P_{\text{atm}}\right) \le \Delta P \le 20\ \text{MPa}$$

- **Maximum discharge pressure** $P_{\text{max}}$ (user input, absolute): the outlet pressure cannot rise above it. When the downstream network needs more, the source delivers less than $Q_{\text{set}}$, like a pump on its relief valve, and `pressure_cap_reached` is set (outlet within 1 Pa of $P_{\text{max}}$, audit F1-24). The UI then warns that the delivered flow is below the set flow.
- **20 MPa** on the other side is a numerical guard for solver search steps, not a physical limit.

### 3.4 Derivative

$$\frac{\partial \Delta P}{\partial Q} = \begin{cases} k & \text{between the limits} \\ 0 & \text{on a limit} \end{cases}$$

In the network Jacobian the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)); the analytical value above is checked against it in the tests.

### 3.5 Relief analysis ramp

The flow source is a relief driver (`is_relief_driver = True`). During the relief analysis, `apply_relief_ramp(λ)` sets $Q_{\text{set}}(\lambda) = \lambda\, Q_{\text{set}}$; the stiffness stays referenced to the case flow. `reset_relief_ramp` restores the case value. See [relief_device.md](relief_device.md).

## 4. Thermal & Energy Balance

The set temperature is stamped on the outlet, with the density and viscosity of the system fluid at that temperature:

$$T_{\text{outlet}} = T_{\text{set}}$$

The pressure rise of the source adds no heat (an ideal source, not a pump with losses).

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Set Flow | L/min (GPM) | `self.source_flow` | m³/s | 50 L/min | $\ge 0$ | Injected volume flow |
| Injected Temp | °C (°F) | `self.temperature` | K | 293.15 K | fluid validity range | Temperature of the injected fluid |
| Max. Discharge Pressure | bar(a) (psi(a)) | `self.max_discharge_pressure` | Pa | 50 bar(a) | $> 1$ bar(a) | Outlet pressure limit; above it the flow drops below the set flow |

The parser rejects a maximum discharge pressure $\le 1$ bar(a).

## 6. Operating Modes & Model Boundaries

- **Steady state:** a constant flow ($\Delta t = 0$).
- **Solver flags:**
  - `is_pressure_boundary = False`
  - `is_flow_boundary = False` (the spring is an ordinary edge term)
  - `blocks_flow_on_shutdown = False`
  - `use_mcp_formulation = False`
  - `is_relief_driver = True`
- **Pressure reference:** for topology pruning a flow source counts as a reference, like a tank. At zero set flow its section carries no flow and takes its pressure from its neighbours instead (stagnant section, see [base_node.md](base_node.md#6-operating-modes--model-boundaries)).
- **Inactive:** `active` has no effect; set the flow to 0 to stop the source.
- **Reverse flow:** a set flow is always out of the source. The spring resists any other flow, so reverse flow only occurs on the lower 20 MPa guard.
- **Operating cases:** set flow, temperature and maximum discharge pressure can be overridden per case.
- **Not modelled:** a pump curve (use a [volumetric](volumetric_pump.md) or [centrifugal pump](centrifugal_pump.md)), suction conditions and NPSH.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_sources.py::TestFlowSource` | $\Delta P = 0$ at the set flow (within $10^{-7}$ Pa); negative below it, positive above it; never beyond 20 MPa |
| `test_sources.py::TestFlowSourceDerivative::test_analytical_vs_numerical` | Analytical derivative within 1 Pa·s/m³ of a central difference, set flows 10-500 L/min, at and off the set flow |
| `test_sources.py::TestNetworkSolve::test_flow_source_network_solve` | 45 L/min → 10 m × 50 mm pipe → tank: delivered flow within 1 L/min; outlet pressure $= P_{\text{atm}} - \Delta P$ within 1 Pa |
| `backend/tests/unit/equipment/test_flow_source_pressure_cap.py::test_f1_24_cap_flag_set_when_limit_binds` | 100 L/min through 200 m × 15 mm with a 3 bar(a) limit: flag set, flow below 100 L/min |
| `test_flow_source_pressure_cap.py::test_f1_24_cap_flag_clear_in_normal_operation` | Same flow through 200 m × 80 mm with a 50 bar(a) limit: flag clear, flow within 1 % of 100 L/min |
| `backend/tests/unit/solver/test_stagnant_branches.py::test_flow_source_at_zero_flow_is_no_pressure_reference` | Source at 0 L/min behind a check valve: its outlet is flagged stagnant and takes the check valve outlet pressure within 1 Pa |

## Data Fields

Node type: `flow_source`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `source_flow_lmin` | L/min | 50 |
| `temperature_k` | K | 293.15 |
| `max_discharge_pressure_bara` | bar(a) | 50 |
