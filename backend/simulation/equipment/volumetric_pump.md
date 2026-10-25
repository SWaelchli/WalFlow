# Volumetric Pump (`volumetric_pump`)

## 1. Overview & Purpose

A volumetric (positive displacement) pump delivers its displacement flow whatever the discharge pressure: gear, screw, piston and lobe pumps. In the network it sets the flow; the pressure rise follows from the downstream resistance.

Three limits act on it:

- **Maximum discharge pressure:** the outlet pressure is held at the limit, like an integral relief valve recirculating to suction; the delivered flow then drops below displacement.
- **Drive:** a fixed-speed motor keeps the flow and flags an overload; a drive with a power limit slows the pump down to its rated power.
- **Stopped:** a stopped PD pump blocks the line.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| PDP-01 | Standard | API Std 676, 4th ed. (2022); API Std 674, 3rd ed. (2010) | Flow set by displacement, relief protection on the discharge, rated power | ⚪ Unverified |
| PDP-02 | Standard | ANSI/HI 3.1-3.5-2021 | Definitions of displacement, slip and pump efficiency | ⚪ Unverified |
| PDP-03 | Standard | ANSI/HI 9.6.1-2024 | NPSHa compared with NPSHr plus a user margin (HI 9.6.1 covers rotodynamic pumps) | ⚪ Unverified 🚩 |

The model is an ideal PD pump with a stiff numerical slip, not a slip model from viscosity and clearances.

## 3. Physical & Mathematical Implementation

### 3.1 Displacement spring (`calculate_delta_p`)

$$\Delta P = k\,(Q_r - Q), \qquad k = \frac{10\ \text{MPa}}{0.01\, Q_{\text{ref}}}$$

$Q_r$ is the displacement flow, $Q_{\text{ref}}$ the case value of it (unchanged by the relief ramp). $k$ gives 100 bar per 1 % flow deviation, so the delivered flow stays within a fraction of a percent of displacement at any real pressure. $k = 10^{12}$ Pa·s/m³ if $Q_{\text{ref}} \le 0$.

- **Normal operation** ($Q < Q_r$): $\Delta P > 0$, the pump raises the pressure.
- **Pushed** ($Q > Q_r$, e.g. fed from a pressurised header): $\Delta P < 0$, the pump brakes the flow to its displacement instead of passing it freely.
- **Reverse flow** ($Q < 0$): $\Delta P = \Delta P(0) - k\,Q$, a stiff check valve continuous with the rise at zero flow.

The pump raises the pressure: $P_{\text{out}} = P_{\text{in}} + \Delta P$ (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)). The flow does not depend on the density.

### 3.2 Drive

`drive_type` selects what happens when the shaft power exceeds the motor rating $P_m$:

| `drive_type` | Model | Flag |
| :--- | :--- | :--- |
| `fixed_speed` (default) | An induction motor keeps its speed: the flow stays at displacement. | `motor_overload` when $P_{\text{shaft}} > 1.001\, P_m$ |
| `vfd_power_limit` | A power-limited drive slows the pump down: $\Delta P = \min\!\big(k (Q_r - Q),\ \Delta P_{\text{power}}\big)$ | `power_limited` when the power curve is the lower one |

$$\Delta P_{\text{power}} = \frac{P_m\, \eta}{\sqrt{Q^2 + 10^{-10}}}$$

The $10^{-10}$ term keeps the power curve finite at $Q = 0$. The switch between the spring and the power curve is a `min`, so the slope changes at the crossing.

Example (`vfd_power_limit`): $P_m$ = 5 kW, $\eta$ = 80 %, at 50 L/min: $\Delta P = 4000 / (50/60\,000) = 48$ bar.

### 3.3 Maximum discharge pressure

With the inlet pressure known (the solver passes it), the outlet is limited:

$$\Delta P_{\text{lim}} = P_{\text{max}} - P_{\text{in}}, \qquad \Delta P = \Delta P_{\text{lim}} + s\,(\Delta P_{\text{unlimited}} - \Delta P_{\text{lim}}) \quad \text{if } \Delta P_{\text{unlimited}} > \Delta P_{\text{lim}}$$

$s$ (`_limit_ratio`) gives the limited curve a small slope: full recirculation (dead-head, $Q = 0$) needs about 1 % above the limit (`LIMIT_ACCUMULATION`), like the accumulation of a relief valve. A flat cap would leave Newton without a slope. `pressure_cap_reached` is set when the outlet is within 1 Pa of $P_{\text{max}}$ or above.

| Operating point | Outlet pressure | Flow |
| :--- | :--- | :--- |
| Below the limit | from the network | displacement |
| On the limit | $P_{\text{max}} \dots 1.01\, P_{\text{max}}$ | below displacement (rest recirculates) |
| Dead-headed | about $1.01\, P_{\text{max}}$ | 0 |

### 3.4 Derivatives (`calculate_dp_derivative`, `outlet_derivatives`)

$$\frac{\partial \Delta P}{\partial Q} = \begin{cases} -k & \text{spring, and reverse flow} \\ -\dfrac{P_m\, \eta\, Q}{(Q^2 + 10^{-10})^{3/2}} & \text{on the power curve} \end{cases}$$

The pressure limit makes the outlet depend on the inlet pressure, so the solver uses `outlet_derivatives`, which returns both slopes of $P_{\text{out}} = P_{\text{in}} + \Delta P(Q, P_{\text{in}})$:

$$\frac{\partial P_{\text{out}}}{\partial P_{\text{in}}} = s, \quad \frac{\partial P_{\text{out}}}{\partial Q} = s\, \frac{\partial \Delta P}{\partial Q} \quad \text{on the limit;} \qquad 1 \text{ and } \frac{\partial \Delta P}{\partial Q} \text{ otherwise}$$

### 3.5 Shaft power, motor load

$$P_{\text{shaft}} = \begin{cases} \dfrac{|Q|\, \Delta P}{\max(0.01,\ \eta)} & \Delta P > 0 \ 0 & \Delta P \le 0 \end{cases}, \qquad \text{motor load} = 100 \cdot \frac{P_{\text{shaft}}}{P_m}\ \%$$

$\eta$ is the pump efficiency (motor losses not included); $P_m$ is the motor rating. A stopped or braking pump has zero shaft power (`pump_shaft_power` in [base_node.py](base_node.py)).

### 3.6 NPSH

$\text{NPSH}_a = (P_{\text{in}} - P_v)/(\rho g)$ is reported, and `cavitation_warning` is set when $\text{NPSH}_a < \text{NPSH}_r + \text{margin}$, as for the [centrifugal pump](centrifugal_pump.md#35-npsh-update_npsh-audit-f1-28).

### 3.7 Relief analysis ramp

The pump is a relief driver. `apply_relief_ramp(λ)` scales the displacement with speed: $Q_r \to \lambda\, Q_r$. A stopped pump is not ramped. See [relief_device.md](relief_device.md).

## 4. Thermal & Energy Balance

The share of the shaft power that is not hydraulic power heats the fluid:

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T_{\text{in}})} \cdot \frac{1 - \eta}{\eta}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$, with $\eta \ge 1$ % (the input minimum, also used for the shaft power), so the heat is exactly $P_{\text{shaft}} - |Q|\,\Delta P$. The factor depends on the sign of $\Delta P$ only, so the heat does not jump when the flow of a dead-headed pump changes sign.

A braking pump (the fluid drives it, $\Delta P < 0$, e.g. fed from a header above its displacement) is a pure resistance like a throttle: all of $Q|\Delta P|$ becomes heat, $\Delta T = |\Delta P|/(\rho c_p)$, and no motor regeneration is assumed (`pump_heat_factor` in [base_node.py](base_node.py)). Recirculation over the pressure limit adds no extra heat. A stopped pump is removed from the solve (section 6) and adds no heat.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Operating Status | bool | `self.active` | - | running | running / stopped | Stopped = blocks the line |
| Rated Flow | L/min (GPM) | `self.flow_rated` | m³/s | 100 L/min | $> 0$ | Displacement flow $Q_r$ |
| Drive | text | `self.drive_type` | - | fixed_speed | fixed_speed, vfd_power_limit | Behaviour above the motor rating |
| Max. Discharge Pressure | bar(a) (psi(a)) | `self.max_discharge_pressure` | Pa | 50 bar(a) | $> 1$ bar(a) | Outlet pressure limit |
| Motor Rating | kW (HP) | `self.motor_power` | W | 5 kW | $\ge 0$ | Motor rated power $P_m$ |
| Pump Efficiency | % | `self.efficiency` | fraction | 85 % | 1-100 % | Pump efficiency (power, heat, power limit) |
| NPSHr | m (ft) | `self.npshr_m` | m | 0 (not entered) | $\ge 0$ | Required NPSH from the datasheet |
| NPSH margin | m (ft) | `self.npsh_margin_m` | m | 0.5 | $\ge 0$ | Margin added to NPSHr for the warning |

An unknown `drive_type` is read as `fixed_speed`. The parser rejects an efficiency outside 1-100 %, a maximum discharge pressure $\le 1$ bar(a) and negative NPSH values.

## 6. Operating Modes & Model Boundaries

- **Steady state:** fixed speed (or the power-limited speed), no pulsation ($\Delta t = 0$).
- **Solver flags:**
  - `is_pressure_boundary = False`
  - `blocks_flow_on_shutdown = True`
  - `use_mcp_formulation = False`
  - `is_relief_driver = True`
- **Inactive:** the pump and its edges are removed from the solve (topology pruning, see [base_node.md](base_node.md#6-operating-modes--model-boundaries)). The sections on both sides get their pressure from their own neighbours; the suction side of a shut-in section takes the suction pressure.
- **Reverse flow:** blocked by a stiff check-valve characteristic.
- **Operating cases:** status, ratings, drive and limit can be overridden per case.
- **Not modelled:**
  - volumetric slip from viscosity and clearances (the flow is independent of the fluid);
  - pulsation of reciprocating pumps;
  - an external relief valve: the pressure limit is integral; for a relief line to a tank, add a [pressure safety valve](pressure_safety_valve.md);
  - heat of the recirculated flow on the pressure limit.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_volumetric_pump.py::test_volumetric_physics_isolation` | 100 L/min displacement: $\Delta P = 0$ at 100 L/min; 100 bar at 99 L/min; −100 bar at 101 L/min (1 %); VFD 5 kW × 0.8 at 50 L/min: 48 bar (1 %); half the efficiency gives half the pressure (5 %); dead-head and fixed-speed overload hold the outlet at 50-50.5 bar(a) |
| `test_volumetric_pump.py::test_volumetric_network_scenarios` | Flow independent of density (water and $\rho$ = 800 within 1 %); two pumps in parallel deliver twice the flow (10 %); in series the displacement (1 %); a 500 W VFD pump delivers less than displacement with a hydraulic power at most 5 % above $P_m \eta$ and is flagged `power_limited`; the same pump at fixed speed keeps its flow (1 %), is flagged `motor_overload`, and reports motor load $= Q \Delta P / (\eta P_m)$ (1 %) |
| `backend/tests/unit/equipment/test_pd_pressure_limit.py::test_dead_headed_pump_holds_its_limit` | Dead-headed with a 30 bar(a) limit: outlet 30-30.3 bar(a), flow between 0 and displacement, `pressure_cap_reached` |
| `test_pd_pressure_limit.py::test_pump_below_its_limit_is_unaffected` | Below the limit: displacement within 1 %, no flag |
| `test_pd_pressure_limit.py::test_multi_psv_example_unmitigated_stops_at_pump_limit` | Shipped multi-PSV example, unmitigated pass: outlet 50-50.5 bar(a) |
| `backend/tests/unit/equipment/test_pumps.py::test_f1_35_pushed_pd_pump_passes_its_displacement` | 10 bar(a) header → pump → tank: flow 100 L/min within 1 %, outlet below inlet (pump brakes) |
| `test_pumps.py::test_f1_36_fixed_speed_keeps_flow_and_flags_overload`, `test_f1_36_vfd_power_limit_reduces_flow_and_flags_it` | 400 m lift with 5 kW: fixed speed keeps 100 L/min and flags overload; VFD drops below 80 L/min at 5 kW shaft power (2 %) |
| `backend/tests/unit/equipment/test_pump_waste_heat.py::test_volumetric_pump_heats_the_fluid_by_its_inefficiency` | $\eta$ = 10 %: $\Delta T = \Delta P/(\rho c_p) \cdot (1-\eta)/\eta$ within 0.2 % |
| `test_pump_waste_heat.py::test_heat_is_shaft_power_minus_hydraulic_power_at_low_efficiency` | $\eta$ = 2, 5, 8 %: shaft power $Q\Delta P/\eta$ ($10^{-9}$), heat $= P_{\text{shaft}} - Q\Delta P$ within 0.2 % |
| `test_pump_waste_heat.py::test_heat_does_not_depend_on_the_sign_of_a_near_zero_flow` | Dead-headed pump at $Q = \pm 10^{-12}$ m³/s: same $\Delta T$ ($10^{-6}$) |
| `test_pump_waste_heat.py::test_braking_pump_turns_all_its_pressure_drop_into_heat` | Header drives flow above displacement: $\Delta T = |\Delta P|/(\rho c_p)$ within 0.2 %, zero shaft power |
| `backend/tests/unit/solver/test_active_inactive.py::test_inactive_volumetric_pump` | Stopped pump between a 5 m and a 1 m tank: flow below $10^{-6}$ m³/s |

## Data Fields

Node type: `volumetric_pump`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_rated_lmin` | L/min | 100 |
| `motor_power_kw` | kW | 5 |
| `efficiency_pct` | % | 85 |
| `drive_type` | text (`fixed_speed` / `vfd_power_limit`) | fixed_speed |
| `max_discharge_pressure_bara` | bar(a) | 50 |
| `npshr_m` | m | 0 |
| `npsh_margin_m` | m | 0.5 |
