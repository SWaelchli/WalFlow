# Linear Control Valve (`linear_control_valve`)

## 1. Overview & Purpose

A control valve with a fixed, user-set opening and a linear trim. It is a passive resistance: the pressure drop follows the liquid Cv equation for the effective Cv at that opening. Use it for a throttling valve, a hand valve or a control valve at a known position.

The same valve equation is used by the [linear regulator](linear_regulator.md) and the [remote control valve](remote_control_valve.md); there the solver sets the opening instead of the user.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| LCV-01 | Standard | IEC 60534-2-1:2011; ANSI/ISA-75.01.01-2012 | Sizing equation for incompressible flow (Cv definition) | ✅ IEC 60534-2-1:2011 §6.1 Eq. (1) |
| LCV-02 | Standard | IEC 60534-2-1:2011; ANSI/ISA-75.01.01-2012 | Valve Reynolds number and viscosity correction $F_R$ (approximated, section 3.3) | ⚠️ Annex A $F_R$, D-29 |
| LCV-03 | Standard | ANSI/ISA-75.11.01-2013; IEC 60534-2-4:2009 | Linear inherent flow characteristic | ⚪ Unverified |

The Cv equation is the standard one. The viscosity correction is a smooth approximation in the spirit of IEC 60534-2-1, not its $F_R$ formula (section 3.3).

## 3. Physical & Mathematical Implementation

### 3.1 Effective Cv (linear trim)

$$C_{v,\text{eff}} = C_{v,\max} \cdot \frac{\text{opening}}{100}, \qquad \text{opening} \ge 0.1\,\%$$

$C_v$ is in US units (US gpm at 1 psi with water). 0.1 % (`MIN_OPENING_PCT`) is the smallest Cv-controlled opening; below it the valve is closed (section 3.2).

### 3.2 Pressure drop (`calculate_delta_p`)

$$\Delta P = \frac{K_{Cv}\, \rho\, Q\,|Q|}{\big(C_{v,\text{eff}}\, F_R\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

with $\Delta P$ in Pa, $Q$ in m³/s and $\rho$ in kg/m³. $K_{Cv} = 15\,850.32^2 \times 6894.76 / 1000$ converts the US Cv definition $Q_{\text{gpm}} = C_v \sqrt{\Delta P_{\text{psi}} / SG}$ to SI with $SG = \rho / 1000$. $C_{v,\text{eff}} F_R$ is kept at least $10^{-4}$.

**An opening below 0.1 %** (including 0 %) is a closed valve: $\Delta P = 10^{12}\, Q$, a linear stiffness that blocks the flow (leakage below $10^{-7}$ L/min per bar).

### 3.3 Viscosity correction $F_R$ (`FluidProperties.get_valve_fr`)

An equivalent trim diameter and a valve Reynolds number:

$$d_v = \max\!\left(0.002,\ 0.01\sqrt{C_{v,\text{eff}}}\right)\ \text{m}, \qquad \mathrm{Re}_v = \frac{\rho\, |Q|\, d_v}{\mu\, \pi d_v^2 / 4}$$

$$F_R = \min\!\left(1,\ \max\!\left(0.4,\ \frac{\mathrm{Re}_v + 200}{\mathrm{Re}_v + 400}\right)\right)$$

$F_R$ is smooth and falls from 1 (turbulent) to 0.5 at zero flow; the 0.4 floor is never reached. The pressure drop stays quadratic in $Q$ at every Reynolds number: at most four times the turbulent value. The fully laminar valve flow of IEC 60534-2-1 ($\Delta P \propto \mu Q$, $F_R \ll 0.5$) is not reproduced.

### 3.4 Worked example

$C_{v,\max}$ = 10, 100 L/min at 40 °C:

| Fluid | Opening | Re$_v$ | $F_R$ | $\Delta P$ |
| :--- | :--- | :--- | :--- | :--- |
| Water | 100 % | 102 000 | 0.998 | 0.48 bar |
| Water | 50 % | 145 000 | 0.999 | 1.92 bar |
| Water | 10 % | 323 000 | 0.999 | 47.8 bar |
| ISO VG 46 | 100 % | 1 460 | 0.892 | 0.52 bar |
| ISO VG 46 | 10 % | 4 610 | 0.960 | 44.9 bar |

### 3.5 Derivative

The class has no analytical derivative; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian), D-23).

## 4. Thermal & Energy Balance

The whole pressure drop is throttling loss and heats the fluid (audit F1-16):

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$, with density and viscosity re-evaluated at both ends. For water, about 0.024 K per bar.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Max Cv | Cv (US gpm/psi^0.5) | `self.max_cv` | Cv | 0.05 | $> 0$ | Flow coefficient at 100 % opening |
| Opening | % | `self.opening_pct` | % | 50 | 0-100 | Valve position; below 0.1 % = closed |

## 6. Operating Modes & Model Boundaries

- **Steady state:** fixed position, no stroking time ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect; close the valve with an opening below 0.1 %.
- **Reverse flow:** symmetric; $\Delta P$ is odd in $Q$.
- **Operating cases:** opening and Cv can be overridden per case.
- **Not modelled:**
  - other trims (equal percentage, quick opening);
  - choked flow and cavitation ($F_L$, $x_{FZ}$); `flashing_warning` flags an outlet below vapour pressure, but the flow is not limited;
  - piping geometry factor $F_P$ (reducers around the valve);
  - laminar valve flow (section 3.3);
  - rangeability: the trim stays linear down to 0.1 %, and the drop jumps there from the Cv law to the closed stiffness (no gradual seat closure).

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/fluids/test_throttling_heat.py::test_f1_16_throttling_heat_magnitude` | Cv 1 at 50 %, drop above 0.5 bar: outlet temperature rise $= \Delta P/(\rho c_p)$ within 2 % |
| `backend/tests/unit/fluids/test_npsh.py::test_f1_28_valve_outlet_below_vapor_pressure_is_flagged`, `test_f1_28_cold_valve_is_not_flagged` | Cv 5 at 50 % between a 5 m tank and an open tank: water at 120 °C sets `flashing_warning`, at 20 °C it does not |
| `backend/tests/unit/solver/test_basic_components.py::test_mass_balance` | Valve as the load of a mixer network; flows balance within $10^{-10}$ m³/s |
| `backend/tests/unit/equipment/test_linear_control_valve.py::test_d11_opening_below_minimum_is_closed` | 0, 0.05 and 0.0999 % are closed: $\Delta P = 10^{12} Q$ |
| `test_linear_control_valve.py::test_d11_minimum_opening_follows_the_cv_law` | 0.1 % follows the Cv law: twice the flow gives four times the drop (5 %) |

No dedicated benchmark of the Cv equation or $F_R$; the same equation is checked through the regulator test `test_demand_flow_through_the_locked_regulator_matches_the_valve_equation`.

## Data Fields

Node type: `linear_control_valve`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv (US gpm/psi^0.5) | 0.05 |
| `opening_pct` | % | 50 |
