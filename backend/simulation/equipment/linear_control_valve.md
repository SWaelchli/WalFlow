# Linear Control Valve (`linear_control_valve`)

## 1. Overview & Purpose

A control valve with a fixed, user-set opening and a linear trim. It is a passive resistance: the pressure drop follows the liquid Cv equation for the effective Cv at that opening. Use it for a throttling valve, a hand valve or a control valve at a known position.

The same valve equation is used by the [linear regulator](linear_regulator.md) and the [remote control valve](remote_control_valve.md); there the solver sets the opening instead of the user.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| LCV-01 | Standard | IEC 60534-2-1:2011; ANSI/ISA-75.01.01-2012 | Sizing equation for incompressible flow (Cv definition) | ✅ IEC 60534-2-1:2011 §6.1 Eq. (1) |
| LCV-02 | Standard | IEC 60534-2-1:2011; ANSI/ISA-75.01.01-2012 | Valve Reynolds number and Reynolds number factor $F_R$ (section 3.3; documented deviations for valves very small or large for the line: no jump at Re$_V$ = 10, growth cap) | ✅ IEC 60534-2-1:2011 §9 Eq. (23), Annex A Eq. (A.6)-(A.8b) |
| LCV-04 | Standard | IEC 60534-2-1:2011 | Typical $F_L$ and $F_d$ of the default valve style | ✅ IEC 60534-2-1:2011 Table D.2 |
| LCV-03 | Standard | ANSI/ISA-75.11.01-2013; IEC 60534-2-4:2009 | Linear inherent flow characteristic | ⚪ Unverified |

The Cv equation and the Reynolds number factor $F_R$ follow IEC 60534-2-1 (section 3.3). Choked flow (§6.2) and the piping geometry factor $F_P$ (§8) are not modelled.

## 3. Physical & Mathematical Implementation

### 3.1 Effective Cv (linear trim)

$$C_{v,\text{eff}} = C_{v,\max} \cdot \frac{\text{opening}}{100}, \qquad \text{opening} \ge 0.1\,\%$$

$C_v$ is in US units (US gpm at 1 psi with water). 0.1 % (`MIN_OPENING_PCT`) is the smallest Cv-controlled opening; below it the valve is closed (section 3.2).

### 3.2 Pressure drop (`calculate_delta_p`)

$$\Delta P = \frac{K_{Cv}\, \rho\, Q\,|Q|}{\big(C_{v,\text{eff}}\, F_R\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

with $\Delta P$ in Pa, $Q$ in m³/s and $\rho$ in kg/m³. $K_{Cv} = 15\,850.32^2 \times 6894.76 / 1000$ converts the US Cv definition $Q_{\text{gpm}} = C_v \sqrt{\Delta P_{\text{psi}} / SG}$ to SI with $SG = \rho / 1000$. $C_{v,\text{eff}} F_R$ is kept at least $10^{-10}$ (only a guard; $F_R$ itself stays above zero, section 3.3).

**An opening below 0.1 %** (including 0 %) is a closed valve: $\Delta P = 10^{12}\, Q$, a linear stiffness that blocks the flow (leakage below $10^{-7}$ L/min per bar).

### 3.3 Reynolds number factor $F_R$ (`FluidProperties.get_iec_valve_fr`)

IEC 60534-2-1:2011 Annex A (D-29). The valve Reynolds number, Eq. (23) / (A.1):

$$\mathrm{Re}_V = \frac{N_4\, F_d\, Q}{\nu \sqrt{C_{v,\text{eff}}\, F_L}} \left(\frac{F_L^2\, C_{v,\text{eff}}^2}{N_2\, D^4} + 1\right)^{1/4}$$

with $Q$ in m³/h, $\nu = \mu / \rho$ in m²/s, $D$ in mm and the Cv constants of Table 1: $N_2 = 2.14 \times 10^{-3}$, $N_4 = 7.60 \times 10^{-2}$, $N_{18} = 1.00$, $N_{32} = 1.27 \times 10^2$.

The trim exponent $n$ uses the rated Cv and the valve size $d$, Eq. (A.8a) and (A.8b):

$$n = \frac{N_2}{\left(C_{v,\max} / d^2\right)^2} \ \text{ if } \frac{C_{v,\max}}{N_{18}\, d^2} \ge 0.016 \text{ (full-size trim)}, \qquad n = 1 + N_{32} \left(\frac{C_{v,\max}}{d^2}\right)^{2/3} \text{ otherwise (reduced trim)}$$

The factor, Eq. (A.6) for $\mathrm{Re}_V < 10$ and Eq. (A.7) for $\mathrm{Re}_V \ge 10$:

$$F_R = \min\!\left(\frac{0.026}{F_L}\sqrt{n\, \mathrm{Re}_V},\ 1\right), \qquad F_R = \min\!\left(1 + \frac{0.33\, F_L^{1/2}}{n^{1/4}} \log_{10}\frac{\mathrm{Re}_V}{10\,000},\ \frac{0.026}{F_L}\sqrt{n\, \mathrm{Re}_V},\ 1\right)$$

- **Valve size.** The valve is taken as line-size, as Annex A.4 tells the user for valves between reducers: $d = D$ = bore of the connected pipe (inlet pipe first, else outlet pipe, else DN50), set by the graph parser.
- **Opening.** $\mathrm{Re}_V$ uses the Cv at the current opening; $n$ uses $C_{v,\max}$ as $C_\text{rated}$.
- **Valve style.** $F_L$ (`fl`) and $F_d$ (`fd`) come from the valve style picked in the inspector (D-29). The styles are catalogue entries of type `control_valve` on the Catalogue page: the built-in catalogue holds the 28 Table D.2 rows that have a numeric $F_d$ (the tapered needle and the multistage rows are left out), and admins or pipe managers add manufacturer catalogues. **Custom** lets the user enter both factors. The node stores the style id and a copy of both numbers, so a file keeps its results when the catalogue changes. The default is globe single port, contoured plug, flow to open: $F_L = 0.9$, $F_d = 0.46$. They are full-travel values and are used at every opening; the standard lets the manufacturer's data replace them.
- **Laminar flow.** $F_R \propto \sqrt{\mathrm{Re}_V} \propto \sqrt{|Q|}$, so $\Delta P$ becomes linear in $Q$ at low flow. $F_R$ is kept above $10^{-9}$ so $\Delta P$ stays finite and is zero at $Q = 0$.
- **Scope (Annex A.4).** Newtonian, non-flashing liquids; $C/(N_{18}\, d^2) < 0.047$.

#### Deviation from the standard: no jump at Re$_V$ = 10

For valves very small or very large for their line, the transitional term (A.7) starts below the laminar term (A.6). The standard's pressure drop then jumps up at $\mathrm{Re}_V = 10$ and, just after, falls while the flow rises. The solver cannot converge on either, although the network is physically fine. WalFlow changes two things, and only for these valves:

1. **No jump.** From $\mathrm{Re}_V = 10$, $F_R$ is held at the laminar value of $\mathrm{Re}_V = 10$ until (A.7) rises past it.
2. **Growth cap.** $F_R$ may grow at most as $\mathrm{Re}_V^{0.75}$ (`IEC_FR_MAX_SLOPE`), so the pressure drop always rises at least as $\sqrt{Q}$. The cap starts where (A.7) takes over and ends where (A.7) grows slowly enough again.

Elsewhere $F_R$ is the standard's value. The result is conservative: the pressure drop is higher than the standard's, at most +20 % with $F_L = 0.9$ and +43 % with $F_L = 0.98$ within the scope, mostly over $\mathrm{Re}_V$ 10 to 40.

It needs both a badly sized valve and viscous liquid at low flow. With $F_L = 0.9$: Cv below 0.013 / 0.038 / 0.15 / 0.56 or above 10.6 / 30 / 117 / 446 on DN15 / 25 / 50 / 100. Examples:

- Cv 0.1 on DN50, ISO VG 46 at 40 °C: affected around 0.07 L/min.
- Cv 124 on DN50, ISO VG 46 at 15 °C: affected around 8 L/min.
- Water: practically never (Cv 124 on DN50 reaches $\mathrm{Re}_V = 10$ at 0.04 L/min).

### 3.4 Worked example

$C_{v,\max}$ = 10, 100 L/min at 40 °C, DN50 line ($d$ = 52.48 mm, reduced trim, $n$ = 4.0):

| Fluid | Opening | Re$_V$ | $F_R$ | $\Delta P$ |
| :--- | :--- | :--- | :--- | :--- |
| Water | 100 % | 107 000 | 1.000 | 0.48 bar |
| Water | 50 % | 151 000 | 1.000 | 1.91 bar |
| Water | 10 % | 337 000 | 1.000 | 47.7 bar |
| ISO VG 46 | 100 % | 1 520 | 0.819 | 0.62 bar |
| ISO VG 46 | 50 % | 2 150 | 0.852 | 2.28 bar |
| ISO VG 46 | 10 % | 4 810 | 0.930 | 47.9 bar |

Laminar: ISO VG 46 at 15 °C, 10 % opening: 1 L/min gives Re$_V$ = 12, $F_R$ = 0.200, $\Delta P$ = 0.105 bar; 2 L/min gives $\Delta P$ = 0.211 bar (linear in $Q$).

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
| Valve style | catalogue entry or Custom | `valve_style_id` | – | IEC Table D.2 globe single port, contoured plug, flow to open | catalogue `control_valve` rows, `custom` | Sets $F_L$ and $F_d$ from the [catalogue](../../../frontend/src/pages/CataloguePage.jsx) (Control valve styles); Custom makes them editable (D-29) |
| F_L (from the style, or Custom) | – | `self.fl` | – | 0.9 | $(0, 1]$ | Liquid pressure recovery factor $F_L$ (Table D.2) |
| F_d (from the style, or Custom) | – | `self.fd` | – | 0.46 | $> 0$ | Valve style modifier $F_d$ (Table D.2) |
| — (from connected pipe) | – | `self.pipe_diameter` | m | 0.05248 | $> 0$ | Valve size $d = D$ for $F_R$ |

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
| `backend/tests/unit/fluids/test_valve_reynolds_factor.py::test_iec_fr_matches_annex_a_reference` | $F_R$ hand-computed from Annex A at Re$_V$ 1 to $2 \times 10^4$: full-size trim (Cv 100), reduced trim (Cv 10), and Cv 124 on DN50 through the held value and the growth cap (section 3.3) |
| `test_valve_reynolds_factor.py` properties | $0 < F_R \le 1$; $F_R = 1$ from Re$_V$ = 10 000; $F_R$ continuous at Re$_V$ = 10 and never falling; $\Delta P$ rises at least as $\sqrt{Q}$ (F_L 0.5-0.98); the cap only lowers $F_R$, and only for valves it applies to |
| `backend/tests/unit/equipment/test_control_valve_reynolds_factor.py` | Linear, remote and 3-way valves: $\Delta P$ odd in $Q$ and zero at rest, linear in $Q$ for Re$_V \le 4$; `fl`, `fd` and the line size read by the parser; invalid $F_L$ / $F_d$ rejected |

The Cv equation itself is also checked through the regulator test `test_demand_flow_through_the_locked_regulator_matches_the_valve_equation`.

## Data Fields

Node type: `linear_control_valve`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv (US gpm/psi^0.5) | 0.05 |
| `opening_pct` | % | 50 |
| `fl` | factor $F_L$ (IEC 60534-2-1) | 0.9 |
| `fd` | factor $F_d$ (IEC 60534-2-1) | 0.46 |

The node data also carries `valve_style_id` (`<catalogue code>:<row code>` or `custom`, default `IEC_60534_2_1_TABLE_D2:globe_single_contoured_open`) for the inspector's valve style; the parser reads only `fl` and `fd` (D-29).
