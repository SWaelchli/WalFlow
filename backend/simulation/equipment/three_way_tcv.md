# 3-Way Temperature Control Valve (`three_way_tcv`)

## 1. Overview & Purpose

A 3-way mixing valve with two inlets and one mixed outlet. One inlet is the **hot** port, the other the **cold** port (`hot_port_idx`). The solver sets the mix ratio, which is the opening of the hot port, while the cold port gets the rest, until the mixed outlet reaches the set temperature.

Use it for temperature control by mixing: a cooler bypass on a lube oil console, a hot and a cold supply blended to a process temperature, a heating circuit mixing loop.

## 2. Governing Standards & Reference Literature

- **Valve equation:** IEC 60534-2-1 / ANSI/ISA-75.01.01 liquid Cv equation per path, as in the [linear control valve](linear_control_valve.md#3-physical--mathematical-implementation).
- **Trim:** a linear complementary characteristic (hot opening $x$, cold opening $1 - x$), as for a 3-way mixing valve to ISA-75.11.01.
- **Control loop:** an ideal steady-state temperature controller (TC → TCV); no thermostat element, no time constant.

## 3. Physical & Mathematical Implementation

### 3.1 Path pressure drop (`calculate_path_dp`)

Each inlet path is a valve with the opening of its role:

$$x_{\text{hot}} = m, \qquad x_{\text{cold}} = 1 - m, \qquad C_{v,\text{path}} = C_{v,\max} \cdot \max(10^{-4},\ x)$$

$$\Delta P_{\text{path}} = \frac{K_{Cv}\, \rho\, Q|Q|}{\big(C_{v,\text{path}}\, F_R\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

$m$ is the mix ratio, $F_R$ the viscosity correction of the [linear control valve](linear_control_valve.md#33-viscosity-correction-f_r-fluidpropertiesget_valve_fr). A path with $|Q| < 10^{-10}$ m³/s has no pressure drop.

### 3.2 Solver formulation

The TCV node's pressure unknown is its **mixed outlet** pressure. Each path loss is added to the edge that feeds that inlet:

$$P_{\text{out},s} - P_{\text{TCV}} - \Delta P_{\text{pipe}}(q) - \Delta P_{\text{path}}(q, \text{port}) = 0$$

The edge leaving the TCV starts at $P_{\text{TCV}}$. The inlet port pressures are reported as $P_{\text{TCV}} + \Delta P_{\text{path}}$. In the Jacobian the path derivative is a numerical central difference, floored at 100 Pa·s/m³ (see [base_node.md](base_node.md#33-jacobian)). `calculate_dp_derivative_path` gives the analytical value $2 K_{Cv} \rho |Q| / (C_{v,\text{path}} F_R)^2$.

### 3.3 Mix ratio search (`NetworkSolver._tcv_step`)

The solver finds the mix ratio between hydraulic solves, one step per outer iteration:

- Unknown $z = \operatorname{logit}(m)$, error $e = T_{\text{out}} - T_{\text{set}}$. Step $\Delta z = -\alpha\, e / \text{slope}$, limited to $|\Delta z| \le 3$ (odds change by at most a factor 20).
- Slope $dT_{\text{out}}/dz$: secant from the previous iteration, so density, throttling heat and inlet temperatures that move with the mix (e.g. a cooler outlet) are included. Before a secant exists, or when it is implausible (outside 0.05 to 20 times the estimate), the mass-weighted mixing balance gives $(T_{\text{hot}} - T_{\text{cold}})\, w (1 - w)$, $w$ = hot mass fraction.
- $\alpha$ starts at 1, halves (down to 1/16) when the error changes sign without at least halving (overshoot), and recovers while the error falls with the same sign.
- Setpoint outside the inlet span: straight to the end stop ($m$ = 0.001 or 0.999). Hot port colder than the cold port: the valve acts by port role, so it runs to an end stop (which one depends on the start).
- A step that leaves a port without forward flow goes back halfway to the last regular point.
- No forward flow, or equal inlet temperatures: small direct steps $\Delta m = -0.05\, e$.
- Settled at $|e| < 0.01$ K (`TCV_TOL_K`), at an end stop, or when the mix ratio no longer moves. Every run starts at $m = 0.5$.

## 4. Thermal & Energy Balance

The outlet temperature (`calculate`) follows the enthalpy balance of the inward streams with $c_p(T)$, as the [mixer](mixer.md#4-thermal--energy-balance) and the default node mixing (audit F1-42, D-04). The throttling heat of both forward paths is added as enthalpy (audit F1-16):

$$h(T_{\text{out}}) = \frac{\sum_k \dot m_k\, h(T_k) + \sum_{\text{paths}} Q\, \Delta P_{\text{path}}}{\sum_k \dot m_k}, \qquad h(T) = \int_{273.15\,\text{K}}^{T} c_p\, dT$$

$T_{\text{out}}$ is found with `FluidProperties.get_temperature_from_enthalpy`. Inward streams are inlets with $Q > 0$ and the outlet with reverse flow; with reverse flow on the outlet no throttling heat is added. A port without forward flow receives the mixed temperature.

For equal mass flows at 80 °C and 20 °C the enthalpy mix is 0.02 K above the mass-weighted mean for water, 0.66 K for 50 % glycol and 0.87 K for ISO VG 46. The controller holds the setpoint on this energy-balanced temperature.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Max Cv | Cv | `self.max_cv` | Cv | 0.1 | $> 0$ | Cv of each path fully open |
| Set Temperature | °C (°F) | `self.set_temperature` | K | 40 °C | fluid validity range | Mixed outlet setpoint |
| Hot port | index | `self.hot_port_idx` | - | 0 (Inlet 1, left) | 0, 1 | Which inlet is the hot port |

The mix ratio (`self.mix_ratio`) is a result.

## 6. Operating Modes & Model Boundaries

- **Steady state:** the settled mix ratio of an ideal controller ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `is_flow_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`). The solver registers the TCV by its class.
- **Inactive:** `active` has no effect.
- **Reverse flow:** a path with reverse flow is a resistance like a forward one; it gets the mixed temperature.
- **End stops:** 0.1 % and 99.9 % (the trim itself goes down to 0.01 %). An unreachable setpoint is reported at the end stop.
- **Operating cases:** setpoint, hot port and Cv can be overridden per case.
- **Not modelled:** diverting service (one inlet, two outlets), equal-percentage or characterised trims, the thermostat element and its offset, leakage across the closed port.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/scenarios/test_tcv_loop_convergence.py::test_tcv_reaches_setpoint_or_end_stop` | 35 scenarios (setpoints across the span and outside it, spans of a few K, hot port 1, inversion, Cv 1 and 200, long cold branch, unequal pressures, low flow, glycol and ISO VG 46 / 220, blocked cold branch, with a PRV, two TCVs in series and in parallel): setpoint within 0.01 K or an end stop, controls and properties converged, at most 30 outer iterations |
| `test_tcv_loop_convergence.py::test_tcv_result_does_not_depend_on_the_start` | Different start mix ratios: outlet temperatures within 0.02 K, minority branch flow within 1 % |
| `backend/tests/unit/equipment/test_three_way_tcv.py` | ISO VG 46, 80 °C / 20 °C → 40 °C within 0.5 K; hot saturated (cold source too warm) ends at 45 °C; cold saturated at 35 °C; hot port 1; hot at 10 bar vs cold at 1.2 bar; inversion; tiny Cv; downstream network reaches 45 °C within 0.5 K |
| `backend/tests/unit/equipment/test_three_way_tcv_viscosity.py::test_f1_05_tcv_paths_consistent_with_viscous_dp` | VG 46 at 60 °C / 15 °C: each inlet pressure minus the outlet pressure equals its path $\Delta P$ within 0.1 % |
| `backend/tests/unit/equipment/test_three_way_tcv_mixing.py` | Water, 50 % glycol and VG 46, equal mass flows at 80 °C / 20 °C: outlet matches an independent enthalpy balance (trapezoidal $\int c_p\,dT$) within 0.05 K; VG 46 mix 0.87 K above 50 °C within 0.1 K; with several kW of throttling heat still within 0.05 K |

## Data Fields

Node type: `three_way_tcv`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv | 0.1 |
| `set_temperature_c` | °C | 40 |
| `hot_port_idx` | index (0 or 1) | 0 |
