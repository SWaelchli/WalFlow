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

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| HX-01 | Literature / Principle | Kays & London, *Compact Heat Exchangers*, 3rd ed. (1984); Bergman, Lavine, Incropera & DeWitt, *Fundamentals of Heat and Mass Transfer*, 8th ed. (2017); Effectiveness-NTU method | Effectiveness-NTU method, limit $C_{\min}/C_{\max} \to 0$ | ⚪ Unverified |
| HX-02 | Literature | Dittus & Boelter (1930), *Univ. Calif. Publ. Eng.* 2(13), 443–461 | Flow scaling of UA ($\mathrm{Nu} \propto \mathrm{Re}^{0.8}$) for liquid-cooled exchangers | ⚪ Unverified 🚩 |
| HX-03 | Standard | API Std 661, 7th ed. (2013, R2024); TEMA Standards, 11th ed. (2024) | Background for the rated duty, design temperatures and allowable pressure drop | ⚪ Unverified |

## 3. Physical & Mathematical Implementation

### 3.1 Rated UA (`_calculate_ua_rated`)

Medium temperature for sizing: $T_{m,\text{rated}}$ = the cooling medium temperature (water-cooled) or 20 °C (air-cooled). Rated mass flow $\dot m_r = Q_r\, \rho(T_{\text{in,design}})$.

For `rated_duty` the design outlet temperature is $T_{\text{out}} = T_{\text{in}} - \dot Q_r / (\dot m_r\, c_p)$. Then, for `rated_duty` and `design_temps`, the exact inversion for an infinite-capacity medium:

$$\varepsilon_d = \frac{T_{\text{in}} - T_{\text{out}}}{T_{\text{in}} - T_{m,\text{rated}}}, \qquad \text{NTU}_d = -\ln(1 - \varepsilon_d), \qquad UA_r = \text{NTU}_d\, \dot m_r\, c_p$$

$\varepsilon_d$ is clamped to $10^{-5} \dots 0.999$ for the calculation. The unclamped value is reported as `design_effectiveness` with `rating_status`:

| `rating_status` | Condition | Meaning |
| :--- | :--- | :--- |
| `ok` | $\varepsilon_d \le 0.95$ | feasible rating |
| `high_effectiveness` | $0.95 < \varepsilon_d < 1$ | needs a very large exchanger |
| `infeasible` | $\varepsilon_d \ge 1$ | the rated duty needs the fluid colder than the medium |

$c_p$ and $\rho$ are evaluated in the system fluid at the design inlet temperature, so $UA_r$ is a fixed property of the exchanger and does not drift with the operating temperature. The rating is cached and recomputed only when an input changes.

### 3.2 UA at the operating flow

$$UA = UA_r \left(\frac{|Q|}{Q_r}\right)^{n}, \qquad n = \begin{cases} 0.8 & \text{water-cooled} \\ 0.6 & \text{air-cooled} \end{cases}$$

### 3.3 Outlet temperature (`calculate_temperature`)

$$\text{NTU} = \frac{UA}{\dot m\, c_p}, \qquad \varepsilon = 1 - e^{-\text{NTU}}, \qquad T_{\text{out}} = T_{\text{in}} - \varepsilon\,(T_{\text{in}} - T_m)$$

$T_m$ is the cooling medium temperature (water-cooled) or the global ambient temperature (air-cooled). For NTU > 50, $T_{\text{out}} = T_m$. The formula works in both directions: a fluid colder than the medium is heated. The actual duty is

$$\dot Q = \dot m\, c_p\, (T_{\text{in}} - T_{\text{out}})$$

### 3.4 Pressure drop (`calculate_delta_p`)

$$\Delta P = k\, \rho\, Q|Q|\, f(\mathrm{Re}_{hx}), \qquad k = \frac{\Delta P_r}{\rho_{\text{ref}}\, Q_r^2\, f(\mathrm{Re}_{\text{ref}})}$$

$$\mathrm{Re}_{hx} = \frac{\rho\, (|Q| / A_{hx})\, d_{hx}}{\mu}, \qquad d_{hx} = 10\ \text{mm}, \quad A_{hx} = \max(10^{-4},\ Q_r / 2)\ \text{m}^2$$

$f$ is the viscosity factor of the [filter](filter.md#33-viscosity-factor-fluidpropertiesget_filter_viscosity_factor) ($1 + 100/\mathrm{Re}$ in the laminar range). $A_{hx}$ gives 2 m/s in the channels at rated flow.

The reference state is the system fluid at the design inlet temperature: $\rho_{\text{ref}}$, $\mu_{\text{ref}}$ and $\mathrm{Re}_{\text{ref}}$ at $Q_r$ (the same calibration as the [filter](filter.md)). The rated drop is reproduced exactly at the rating point in any fluid; away from it the drop follows density and viscosity. Default exchanger (0.5 bar at 500 L/min, design inlet 50 °C):

| Fluid at rated flow | $\Delta P$ |
| :--- | :--- |
| Water, 50 °C (reference) | 0.500 bar |
| Water, 20 °C | 0.505 bar |
| ISO VG 46, 50 °C (reference) | 0.500 bar |
| ISO VG 46, 40 °C | 0.539 bar |
| ISO VG 46, 20 °C | 0.741 bar |

A `pressure_drop_factor` passed to the constructor (tests only, not a data field) replaces $k$ by `pressure_drop_factor / 1000` without calibration.

### 3.5 Worked example

Default rating: 300 kW at 500 L/min, design inlet 50 °C, water-cooled at 10 °C. Inlet at 50 °C:

| Fluid | Flow | $\varepsilon_d$ | Outlet | Duty |
| :--- | :--- | :--- | :--- | :--- |
| Water | 250 L/min | 0.218 | 40.2 °C | 169 kW |
| Water | 500 L/min (rated) | 0.218 | 41.3 °C | 300 kW |
| Water | 750 L/min | 0.218 | 41.9 °C | 419 kW |
| ISO VG 46 | 250 L/min | 0.512 | 27.6 °C | 165 kW |
| ISO VG 46 | 500 L/min (rated) | 0.512 | 29.5 °C | 300 kW |

### 3.6 Derivative

The class has no analytical derivative; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)).

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

A missing rated drop is 0.5 bar, not zero. The parser rejects a rated flow $\le 0$.

## 6. Operating Modes & Model Boundaries

- **Steady state:** fixed medium temperature, no thermal inertia ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** no heat transfer ($T_{\text{out}} = T_{\text{in}}$, duty 0); the pressure drop stays.
- **Zero flow:** no heat transfer.
- **Reverse flow:** the hydraulic drop is symmetric. The thermal calculation takes the port the fluid enters by (the outlet port in reverse flow) and writes the cooled temperature to the port it leaves by, so duty and temperatures are the same as in forward flow.
- **Air-cooled:** the rating uses 20 °C ambient; operation uses the drawing's ambient temperature. The medium temperature field is not used.
- **Operating cases:** status, rating and medium temperature can be overridden per case (e.g. summer and winter cooling water).
- **Not modelled:** the utility side (its flow, temperature rise and pressure drop), fouling, phase change, throttling heat of the pressure drop.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/fluids/test_thermal.py::test_cooler_sizing_modes` | `design_temps`, ISO VG 46, 387 L/min, 65 → 40 °C, medium 10 °C: at rated flow the outlet is 40 °C within $10^{-5}$ K; `ua_direct` 2000 W/K gives an outlet between 10 and 65 °C |
| `test_thermal.py::test_water_and_air_coolers` | Water- and air-cooled, cooling and heating: outlet between inlet and medium |
| `backend/tests/unit/equipment/test_heat_exchanger_rating.py::test_f1_40_audit_case_is_infeasible` | 300 kW from 100 L/min of oil with 40 K available: `infeasible`, $\varepsilon_d > 1$ |
| `test_heat_exchanger_rating.py::test_f1_40_modest_rating_is_ok` | 30 kW: `ok`, $0 < \varepsilon_d < 0.95$ |
| `backend/tests/unit/equipment/test_heat_exchanger_default.py` | Missing rated drop: 0.5 bar at rated flow in water at 50 °C within 0.1 %; an explicit value is kept |
| `test_heat_exchanger_default.py::test_d03_rated_dp_is_reproduced_at_the_design_inlet_temperature` | Water and ISO VG 46 at the design inlet temperature: rated drop at rated flow within 0.1 % |
| `test_heat_exchanger_default.py::test_d03_rated_ua_uses_the_design_inlet_state_not_the_operating_temperature` | ISO VG 46 at 80 °C, rating at 50 °C: outlet equals an independent ε-NTU calculation with $UA_r$ from the design state within 0.01 K |
| `backend/tests/unit/equipment/test_heat_exchanger_flow_direction.py` | Mirrored forward and reverse networks: duty equal within 1 % |
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
