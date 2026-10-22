# Centrifugal Pump (`centrifugal_pump`)

## 1. Overview & Purpose

A centrifugal pump adds head to the flow along a falling curve through its rated duty point. Where it operates on the curve follows from the system curve of the connected network. The pump is rated in **head**, so its pressure rise follows the fluid density: the same pump gives less pressure in oil than in water.

A stopped pump is a locked-rotor resistance in both directions. At the suction the available NPSH is computed and compared with the required NPSH plus a margin.

Node types `centrifugal_pump` and the older `pump` build the same model.

## 2. Governing Standards & Reference Literature

- **Pump affinity laws** ($Q \propto n$, $H \propto n^2$): used for the relief-analysis speed ramp.
- **ISO 9906 / ANSI/HI 14.6** (pump acceptance tests): definitions of rated flow, rated head, shutoff head and pump efficiency.
- **ANSI/HI 9.6.1** (NPSH margin): NPSHa compared with NPSHr plus a user margin.
- **Gülich, J.F.:** *Centrifugal Pumps* — quadratic head curve and locked-rotor resistance as an engineering approximation.

The curve is a duty-point approximation, not a manufacturer's curve fit.

## 3. Physical & Mathematical Implementation

### 3.1 Head curve (`calculate_delta_p`, running)

$$H(Q) = H_0 + C\, Q\,|Q|, \qquad H_0 = H_r \left(1 + \frac{r}{100}\right), \qquad C = \frac{H_r - H_0}{Q_r^2} \le 0$$

$$\Delta P = \rho\, g\, H(Q), \qquad g = 9.81\ \text{m/s}^2$$

| Symbol | Meaning |
| :--- | :--- |
| $Q_r$, $H_r$ | rated flow [m³/s] and rated head [m] |
| $r$ | rise to shutoff [%] |
| $H_0$ | shutoff head at $Q = 0$ [m] |
| $\rho$ | density at the pump inlet [kg/m³] |

The pump raises the pressure: $P_{\text{out}} = P_{\text{in}} + \Delta P$ (see [base_node.md](base_node.md#32-how-a-component-enters-the-equations)).

- **Beyond the zero-head flow** $Q > Q_r \sqrt{H_0/(H_0 - H_r)}$ the head becomes negative and the pump acts as a resistance; the curve stays continuous.
- **Reverse flow** (audit F1-34): $H = H_0 - C\,Q^2$ rises above the shutoff head. A weaker pump in parallel therefore dead-heads instead of passing reverse flow at shutoff head.

Example curve, $Q_r$ = 100 L/min, $H_r$ = 50 m, $r$ = 20 %:

| Flow | Head | Water ($\rho$ = 998 kg/m³) |
| :--- | :--- | :--- |
| 0 | 60 m | 5.87 bar |
| 50 L/min | 57.5 m | 5.63 bar |
| 100 L/min (rated) | 50 m | 4.90 bar |
| 150 L/min | 37.5 m | 3.67 bar |
| 245 L/min | 0 m | 0 bar |
| −100 L/min (reverse) | 70 m | 6.85 bar |

### 3.2 Stopped pump (locked rotor)

With `active = false` the pump is a resistance in both directions (decision D2). It loses its rated head at rated flow:

$$\Delta P = -\rho\, g\, H_r \left[(1 - \varepsilon)\, x|x| + \varepsilon\, x\right], \qquad x = \frac{Q}{Q_r}, \quad \varepsilon = 0.05$$

The linear share $\varepsilon$ (`LOCKED_ROTOR_LINEAR_SHARE`) keeps the resistance defined at zero flow. A stopped centrifugal pump stays in the solve (`blocks_flow_on_shutdown = False`), so flow can pass through it, for example from a parallel running pump.

### 3.3 Derivative (`calculate_dp_derivative`)

$$\frac{\partial \Delta P}{\partial Q} = \begin{cases} 2\,\rho\, g\, C\,|Q| & \text{running} \\ -\rho\, g\, \dfrac{H_r}{Q_r}\left[2 (1 - \varepsilon)|x| + \varepsilon\right] & \text{stopped} \end{cases}$$

The running slope is zero at $Q = 0$ and symmetric in $\pm Q$. The solver uses this derivative directly in the Jacobian (pumps are the exception to the numeric differentiation, see [base_node.md](base_node.md#33-jacobian)).

### 3.4 Shaft power (`shaft_power`)

$$P_{\text{shaft}} = \begin{cases} \dfrac{|Q|\, \Delta P}{\max(0.01,\ \eta)} & \Delta P > 0 \ 0 & \Delta P \le 0 \end{cases}$$

$\eta$ is the hydraulic pump efficiency (motor losses not included). A running pump with reverse flow and $\Delta P > 0$ (a stronger parallel pump pushes flow back through it) still draws $|Q|\,\Delta P/\eta$: the motor drives the impeller, and the power goes to 0 smoothly at $Q = 0$. A stopped or braking pump has zero shaft power (`pump_shaft_power` in [base_node.py](base_node.py)). The case KPI sums this power.

### 3.5 NPSH (`update_npsh`, audit F1-28)

$$\text{NPSH}_a = \frac{P_{\text{in}} - P_v(T_{\text{in}})}{\rho\, g}$$

$P_{\text{in}}$ is the static inlet pressure, $P_v$ the vapour pressure of the system fluid. NPSHa is always reported. `cavitation_warning` is set when the pump is running and

$$\text{NPSH}_a < \text{NPSH}_r + \text{margin}$$

NPSHr = 0 means "not entered"; the warning then fires only when NPSHa falls below the margin.

### 3.6 Relief analysis ramp

The pump is a relief driver. `apply_relief_ramp(λ)` scales the speed by the affinity laws: $Q_r \to \lambda Q_r$, $H_r \to \lambda^2 H_r$, $H_0 \to \lambda^2 H_0$ ($C$ unchanged). A stopped pump is not ramped. See [relief_device.md](relief_device.md).

## 4. Thermal & Energy Balance

The share of the shaft power that is not hydraulic power heats the fluid:

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T_{\text{in}})} \cdot \frac{1 - \eta}{\eta}$$

with $\eta \ge 1$ % (the input minimum, also used for the shaft power), so the heat is exactly $P_{\text{shaft}} - |Q|\,\Delta P$ (D-10). The factor depends on the sign of $\Delta P$ only, so the heat does not jump when the flow of a dead-headed pump changes sign. In reverse flow this leaves out the throttling loss of the backflow (no four-quadrant characteristic); it is an approximation.

A stopped pump, and a running pump the fluid drives through it ($\Delta P < 0$, beyond runout), is a pure resistance: all its pressure loss becomes heat ($\Delta T = |\Delta P| / (\rho c_p)$, `pump_heat_factor` in [base_node.py](base_node.py)). The rise is applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$; density and viscosity are then re-evaluated at both ends.

Example: water, 50 m head (4.9 bar), $\eta$ = 75 %: $\Delta T \approx 0.04$ K.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Operating Status | bool | `self.active` | - | running | running / stopped | Stopped = locked-rotor resistance |
| Rated Flow | L/min (GPM) | `self.flow_rated` | m³/s | 100 L/min | $> 0$ | Duty point flow $Q_r$ |
| Rated Head | m (ft) | `self.head_rated` | m | required (new pump in the UI: 50 m) | $> 0$ | Duty point head $H_r$ |
| Rise to Shut-off | % | `self.rise_pct` | - | 20 | $\ge 0$ | Shutoff head above rated head |
| Pump Efficiency | % | `self.efficiency` | fraction | 75 % | 1-100 % | Hydraulic efficiency (power and heat) |
| NPSHr | m (ft) | `self.npshr_m` | m | 0 (not entered) | $\ge 0$ | Required NPSH from the datasheet |
| NPSH margin | m (ft) | `self.npsh_margin_m` | m | 0.5 | $\ge 0$ | Margin added to NPSHr for the warning |

The parser rejects a missing or non-positive rated head (older files with only `pressure_rated_bar` are deliberately not converted, decision D1), an efficiency outside 1-100 % and a negative NPSH value.

## 6. Operating Modes & Model Boundaries

- **Steady state:** fixed speed, no start-up or run-down ($\Delta t = 0$).
- **Solver flags:**
  - `is_pressure_boundary = False`
  - `is_flow_boundary = False`
  - `blocks_flow_on_shutdown = False` (a stopped pump is a resistance, not a block)
  - `use_mcp_formulation = False`
  - `is_relief_driver = True`
- **Inactive:** locked-rotor resistance, no heat from efficiency, zero shaft power, no cavitation warning.
- **Reverse flow:** running pump: head rises above shutoff; stopped pump: resistance.
- **Operating cases:** status and all ratings can be overridden per case (e.g. duty and standby pump).
- **No static head of its own:** suction and discharge heights enter through the tank elevations, see [tank.md](tank.md#32-elevation-and-the-common-datum).
- **Not modelled:**
  - viscosity correction of head and efficiency (ANSI/HI 9.6.7); the curve is the water curve for every fluid, scaled only by density;
  - efficiency varying along the curve; $\eta$ is one value;
  - variable speed in normal operation (only the relief ramp changes speed);
  - the velocity head at the suction in NPSHa (conservative by $v^2/2g$);
  - cavitation effects on the curve; the warning does not change the hydraulics.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_pumps.py::test_f1_18_pump_pressure_rise_follows_density` | $Q_r$ = 100 L/min, $H_r$ = 50 m, 20 %: $\Delta P = \rho g \cdot 50$ at rated flow and $\rho g \cdot 60$ at zero flow (water 20 °C, VG 46 at 20 and 80 °C), within $10^{-9}$ |
| `test_pumps.py::test_f1_18_operating_point_in_oil_system` | VG 46 at 40 °C lifted 30 m between tanks: head 30 m within 0.3 m; flow $Q_r\sqrt{3}$ within 1 % |
| `test_pumps.py::test_f1_34_running_pump_resists_reverse_flow` | At $-Q_r$: $\Delta P = \rho g \cdot 70$ m; slope 0 at $Q = 0$ and equal at $\pm Q_r$ |
| `test_pumps.py::test_d2_stopped_pump_loses_rated_head_at_rated_flow` | Stopped: $\Delta P = \mp 1000 \cdot g \cdot 50$ Pa at $\pm Q_r$ |
| `test_pumps.py::test_f1_36_kpi_power_is_shaft_power_and_stopped_pump_counts_zero` | Case KPI power is the shaft power; a stopped pump counts zero |
| `test_pumps.py::test_d1_old_file_with_rated_pressure_only_is_blocked`, `test_efficiency_outside_1_to_100_pct_is_rejected` | Missing rated head and efficiency outside 1-100 % are input errors |
| `backend/tests/unit/equipment/test_pump_waste_heat.py::test_centrifugal_pump_heats_the_fluid_by_its_inefficiency` | VG 46, $\eta$ = 50 %: $\Delta T = \Delta P/(\rho c_p) \cdot (1-\eta)/\eta$ within 0.2 % |
| `test_pump_waste_heat.py::test_perfect_pump_adds_no_heat` | $\eta$ = 100 %: $\Delta T$ below 1 mK (pipe friction only) |
| `test_pump_waste_heat.py::test_d10_heat_is_shaft_power_minus_hydraulic_power_at_low_efficiency` | $\eta$ = 2, 5, 8 %: shaft power $Q\Delta P/\eta$ ($10^{-9}$), heat $= P_{\text{shaft}} - Q\Delta P$ within 0.2 % |
| `test_pump_waste_heat.py::test_d10_braking_pump_turns_all_its_pressure_drop_into_heat` | 60 m head drives flow beyond runout: $\Delta T = |\Delta P|/(\rho c_p)$ within 0.2 %, zero shaft power |
| `test_pump_waste_heat.py::test_d10_heat_does_not_depend_on_the_sign_of_a_near_zero_flow` | Dead-headed pump at $Q = \pm 10^{-12}$ m³/s: same $\Delta T$ ($10^{-6}$) |
| `test_pump_waste_heat.py::test_d10_running_pump_in_reverse_flow_still_draws_shaft_power` | $Q$ = −2 L/s, $\eta$ = 50 %: shaft power $|Q|\Delta P/\eta$, $\Delta T = \Delta P/(\rho c_p)\cdot(1-\eta)/\eta$ on the inlet ($10^{-9}$) |
| `backend/tests/unit/fluids/test_npsh.py::test_f1_28_npsha_matches_hand_calculation` | Supply tank 3 m level: NPSHa $= (P_{\text{in}} - P_v)/(\rho g)$ within $10^{-9}$, between 9 and 13 m |
| `test_npsh.py::test_f1_28_warns_when_npsha_below_npshr_plus_margin`, `test_f1_28_margin_is_editable` | Warning with NPSHr 20 m; none with NPSHr 3 m + 0.5 m; a margin equal to NPSHa triggers it |
| `backend/tests/unit/solver/test_active_inactive.py::test_f3_16_stopped_pump_between_equal_heads_passes_no_flow` | A stopped pump between equal heads passes no flow |

## Data Fields

Node type: `centrifugal_pump`, `pump`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_rated_lmin` | L/min | 100 |
| `head_rated_m` | m | required |
| `rise_to_shutoff_pct` | % | 20 |
| `efficiency_pct` | % | 75 |
| `npshr_m` | m | 0 |
| `npsh_margin_m` | m | 0.5 |
