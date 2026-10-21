# Heat Exchanger (`heat_exchanger`)

## 1. Overview & Purpose

A cooler (or heater) on the process side of a heat exchanger. The utility side (cooling water, air) is not modelled as a flow; it is an infinite-capacity medium at a fixed temperature. The exchanger is rated at a design point, and the outlet temperature at any other flow and inlet temperature follows from the effectiveness-NTU method.

| `rating_method` | Input | UA from |
| :--- | :--- | :--- |
| `rated_duty` (default) | rated cooling duty at rated flow and design inlet temperature | the design outlet temperature this duty gives |
| `design_temps` | design inlet and outlet temperature at rated flow | the design temperatures directly |
| `ua_direct` | UA in W/K | entered |

The pressure drop on the process side is quadratic through a rated drop at rated flow.

## 2. Governing Standards & Reference Literature

- **Effectiveness-NTU method:** Kays, W.M. & London, A.L., *Compact Heat Exchangers*; Incropera & DeWitt, *Fundamentals of Heat and Mass Transfer*, for $C_{\min}/C_{\max} \to 0$.
- **Dittus-Boelter correlation** ($\mathrm{Nu} \propto \mathrm{Re}^{0.8}$): flow scaling of UA for liquid-cooled exchangers.
- **API 661** (air-cooled heat exchangers) and **TEMA** standards: background for the rated duty, design temperatures and allowable pressure drop.

## 3. Physical & Mathematical Implementation

### 3.1 Rated UA (`_calculate_ua_rated`)

Medium temperature for sizing: $T_{m,\text{rated}}$ = the cooling medium temperature (water-cooled) or 20 °C (air-cooled). Rated mass flow $\dot m_r = Q_r\, \rho(T_{\text{in,design}})$.

For `rated_duty` the design outlet temperature is $T_{\text{out}} = T_{\text{in}} - \dot Q_r / (\dot m_r\, c_p)$. Then, for `rated_duty` and `design_temps`, the exact inversion for an infinite-capacity medium:

$$\varepsilon_d = \frac{T_{\text{in}} - T_{\text{out}}}{T_{\text{in}} - T_{m,\text{rated}}}, \qquad \text{NTU}_d = -\ln(1 - \varepsilon_d), \qquad UA_r = \text{NTU}_d\, \dot m_r\, c_p$$

$\varepsilon_d$ is clamped to $10^{-5} \dots 0.999$ for the calculation. The unclamped value is reported as `design_effectiveness` with `rating_status` (audit F1-40):

| `rating_status` | Condition | Meaning |
| :--- | :--- | :--- |
| `ok` | $\varepsilon_d \le 0.95$ | feasible rating |
| `high_effectiveness` | $0.95 < \varepsilon_d < 1$ | needs a very large exchanger |
| `infeasible` | $\varepsilon_d \ge 1$ | the rated duty needs the fluid colder than the medium |

$c_p$ is evaluated at the current inlet temperature.

### 3.2 UA at the operating flow

$$UA = UA_r \left(\frac{|Q|}{Q_r}\right)^{n}, \qquad n = \begin{cases} 0.8 & \text{water-cooled} \\ 0.6 & \text{air-cooled} \end{cases}$$

### 3.3 Outlet temperature (`calculate_temperature`)

$$\text{NTU} = \frac{UA}{\dot m\, c_p}, \qquad \varepsilon = 1 - e^{-\text{NTU}}, \qquad T_{\text{out}} = T_{\text{in}} - \varepsilon\,(T_{\text{in}} - T_m)$$

$T_m$ is the cooling medium temperature (water-cooled) or the global ambient temperature (air-cooled). For NTU > 50, $T_{\text{out}} = T_m$. The formula works in both directions: a fluid colder than the medium is heated. The actual duty is

$$\dot Q = \dot m\, c_p\, (T_{\text{in}} - T_{\text{out}})$$

### 3.4 Pressure drop (`calculate_delta_p`)

$$\Delta P = k\, Q|Q|\, \frac{\rho}{1000}\, f(\mathrm{Re}_{hx}), \qquad k = \frac{\Delta P_r}{Q_r^2}$$

$$\mathrm{Re}_{hx} = \frac{\rho\, (|Q| / A_{hx})\, d_{hx}}{\mu}, \qquad d_{hx} = 10\ \text{mm}, \quad A_{hx} = \max(10^{-4},\ Q_r / 2)\ \text{m}^2$$

$f$ is the viscosity factor of the [filter](filter.md#33-viscosity-factor-fluidpropertiesget_filter_viscosity_factor) ($1 + 100/\mathrm{Re}$ in the laminar range). $A_{hx}$ gives 2 m/s in the channels at rated flow.

The rated drop is therefore reproduced for a fluid of 1000 kg/m³ in turbulent flow. For other fluids it scales with density and viscosity:

| Fluid at rated flow (0.5 bar rated) | $\Delta P$ |
| :--- | :--- |
| Water, 20 °C | 0.499 bar |
| ISO VG 46, 40 °C | 0.529 bar |
| ISO VG 46, 20 °C | 0.728 bar |

### 3.5 Worked example

Default rating: 300 kW at 500 L/min, design inlet 50 °C, water-cooled at 10 °C. Inlet at 50 °C:

| Fluid | Flow | $\varepsilon_d$ | Outlet | Duty |
| :--- | :--- | :--- | :--- | :--- |
| Water | 250 L/min | 0.218 | 40.2 °C | 169 kW |
| Water | 500 L/min (rated) | 0.218 | 41.3 °C | 300 kW |
| Water | 750 L/min | 0.218 | 41.9 °C | 419 kW |
| ISO VG 46 | 250 L/min | 0.512 | 27.6 °C | 165 kW |
| ISO VG 46 | 500 L/min (rated) | 0.512 | 29.5 °C | 300 kW |

### 3.6 Derivative (`calculate_dp_derivative`)

With $c_2 = k \rho / 1000$:

$$\frac{\partial \Delta P}{\partial Q} = \begin{cases} c_2\,(2|Q| + c_{\text{lam}}), \quad c_{\text{lam}} = \dfrac{100\, A_{hx}\, \mu}{\rho\, d_{hx}} & \mathrm{Re}_{hx} < 2000 \\ 2\, c_2\, |Q| & \mathrm{Re}_{hx} > 4000 \end{cases}$$

and a linear blend in between. In the network Jacobian the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)).

## 4. Thermal & Energy Balance

Section 3.3 is the energy balance: the duty $\dot Q$ leaves the process fluid to the medium (or enters it when heating). The pressure drop adds no throttling heat. The duty and the outlet temperature are part of the property propagation between hydraulic solves, so density and viscosity downstream follow the cooled fluid.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Operating Status | bool | `self.active` | - | Active (On) | On / Off | Off: no heat transfer |
| Rating Method | text | `self.rating_method` | - | rated_duty | rated_duty, design_temps, ua_direct | How UA is found |
| Rated Flow | L/min (GPM) | `self.rated_flow_lmin` | L/min | 500 | $> 0$ | Process flow at the rating point |
| Rated Cooling | kW (BTU/h) | `self.rated_cooling_kw` | kW | 300 | $\ge 0$ | Duty at the rating point (`rated_duty`) |
| Design Inlet Temp | °C (°F) | `self.design_inlet_temp_c` | °C | 50 | fluid validity range | Process inlet at the rating point |
| Design Outlet Temp | °C (°F) | `self.design_outlet_temp_c` | °C | 40 | between inlet and medium | Process outlet at the rating point (`design_temps`) |
| Heat Transfer Coeff (UA) | W/K | `self.ua_direct_w_k` | W/K | 1000 | $\ge 0$ | UA at rated flow (`ua_direct`) |
| Cooler Type | text | `self.cooler_type` | - | water_cooled | water_cooled, air_cooled | UA exponent and medium temperature |
| Cooling Medium Temp | °C (°F) | `self.medium_temp_c` | °C | 10 | any | Medium temperature (water-cooled) |
| Rated ΔP | bar (psi) | `self.rated_dp_bar` | bar | 0.5 | $\ge 0$ | Process-side drop at rated flow |

A missing rated drop is 0.5 bar, not zero (audit F2-04). The parser rejects a rated flow $\le 0$.

## 6. Operating Modes & Model Boundaries

- **Steady state:** fixed medium temperature, no thermal inertia ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `is_flow_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** no heat transfer ($T_{\text{out}} = T_{\text{in}}$, duty 0); the pressure drop stays.
- **Zero flow:** no heat transfer.
- **Reverse flow:** the hydraulic drop is symmetric, but the thermal calculation always takes the inlet port as the entering stream. In reverse flow the outlet temperature is computed from the inlet port, which is not the entering fluid, so the reported temperatures and duty are not valid.
- **Air-cooled:** the rating uses 20 °C ambient; operation uses the drawing's ambient temperature. The medium temperature field is not used.
- **Operating cases:** status, rating and medium temperature can be overridden per case (e.g. summer and winter cooling water).
- **Not modelled:** the utility side (its flow, temperature rise and pressure drop), fouling, phase change, the pressure drop referenced to the system fluid (section 3.4), throttling heat of the pressure drop.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/fluids/test_thermal.py::test_cooler_sizing_modes` | `design_temps`, ISO VG 46, 387 L/min, 65 → 40 °C, medium 10 °C: at rated flow the outlet is 40 °C within $10^{-5}$ K; `ua_direct` 2000 W/K gives an outlet between 10 and 65 °C |
| `test_thermal.py::test_water_and_air_coolers` | Water- and air-cooled, cooling and heating: outlet between inlet and medium |
| `backend/tests/unit/equipment/test_heat_exchanger_rating.py::test_f1_40_audit_case_is_infeasible` | 300 kW from 100 L/min of oil with 40 K available: `infeasible`, $\varepsilon_d > 1$ |
| `test_heat_exchanger_rating.py::test_f1_40_modest_rating_is_ok` | 30 kW: `ok`, $0 < \varepsilon_d < 0.95$ |
| `backend/tests/unit/equipment/test_heat_exchanger_default.py` | Missing rated drop: 0.5 bar at rated flow within 1 Pa; an explicit value is kept |
| `backend/tests/unit/solver/test_active_inactive.py::test_inactive_heat_exchanger` | Inactive: $T_{\text{out}} = T_{\text{in}}$ within $10^{-6}$ K, duty 0 |
| `backend/tests/unit/solver/test_basic_components.py::test_heat_exchanger` | Network solve: outlet colder than inlet |

## Data Fields

Node type: `heat_exchanger`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `rated_cooling_kw` | kW | 300 |
| `rated_flow_lmin` | L/min | 500 |
| `rated_dp_bar` | bar | 0.5 |
| `design_inlet_temp_c` | °C | 50 |
| `design_outlet_temp_c` | °C | 40 |
| `medium_temp_c` | °C | 10 |
| `cooler_type` | text (`water_cooled` / `air_cooled`) | water_cooled |
| `rating_method` | text (`rated_duty` / `design_temps` / `ua_direct`) | rated_duty |
| `ua_direct_w_k` | W/K | 1000 |
