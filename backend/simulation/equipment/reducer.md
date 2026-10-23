# Reducer / Expander (`reducer`)

## 1. Overview & Purpose

A reducer or expander is a conical fitting between two pipe sizes (e.g. DN80 → DN50 or 3" → 2"). It is a passive resistance with an area change: the static pressure across it is the sum of an irreversible loss (form and wall friction) and a reversible Bernoulli term from the change in velocity.

- **Ports:** one inlet (`inlet-0`, diameter $D_1$) and one outlet (`outlet-0`, diameter $D_2$).
- **Reducer** ($D_1 > D_2$): the fluid accelerates; the static pressure falls by more than the loss.
- **Expander** ($D_1 < D_2$): the fluid decelerates; part of the velocity head is recovered as static pressure, so the static pressure can **rise** across it.
- Node types `reducer` and `expander` build the same model; the direction follows from $D_1$ and $D_2$.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| RED-01 | Literature | Crane TP-410, *Flow of Fluids* (edition not fixed; newest confirmed 2018) | Loss coefficients of gradual contractions and enlargements, referenced to the small bore (A-26, page depends on the edition) | ⚪ Unverified 🚩 |
| RED-02 | Literature | Idelchik, *Handbook of Hydraulic Resistance*, 4th ed. (2008); Miller, *Internal Flow Systems*, 2nd ed. (1990) | Background for conical contractions and diffusers | ⚪ Unverified |
| RED-03 | Literature | Churchill (1977), *Chem. Eng.* 84(24), 91–92 | Darcy friction factor for the transition wall friction, shared with the [pipe](pipe.md#33-friction-factor-_friction_factor-churchill-1977) | ⚪ Unverified |
| RED-04 | Standard | ASME B16.9-2024; ASME B36.10M (edition not fixed); ASME B36.19M-2018 | Reducer and pipe dimensions (geometry only, not used in the hydraulics) | ⚪ Unverified |
| RED-05 | Standard / Literature | EN 10253-2:2021; EN 10220:2002; EN ISO 1127:1996 | Reducer and pipe dimensions (geometry only, not used in the hydraulics) | ⚪ Unverified |

Each reducer end takes its wall from the connected line's pipe class (size grid, then its schedule standard), otherwise from the schedule standard matching the reducer standard.

## 3. Physical & Mathematical Implementation

All quantities in SI units. $A_1, A_2$ are the inlet and outlet bore areas, $A_s$ the small-bore area, $\beta = D_{\text{small}}/D_{\text{large}}$, $\theta$ the included cone angle, $H$ the fitting length.

### 3.1 Total static pressure change (`calculate_losses`)

$$\Delta P = P_1 - P_2 = \Delta P_{\text{loss}} + \Delta P_{\text{Bernoulli}}$$

### 3.2 Bernoulli term

$$\Delta P_{\text{Bernoulli}} = \frac{\rho}{2}\,(v_2^2 - v_1^2) = \frac{\rho\, Q^2}{2}\left(\frac{1}{A_2^2} - \frac{1}{A_1^2}\right)$$

It depends on $Q^2$, not $Q|Q|$: the static pressure is always lower at the small bore, whatever the flow direction.

### 3.3 Form loss (`_get_form_loss_k`)

The coefficient is referenced to the small-bore velocity and chosen by the **actual** flow direction: flow from the small to the large bore is an enlargement, the other way a contraction. A reducer in reverse flow is therefore an expander.

| Case | $\theta \le 45°$ | $45° < \theta \le 180°$ |
| :--- | :--- | :--- |
| Contraction | $K = 0.8 \sin(\theta/2)\,(1 - \beta^2)$ | $K = 0.5\,(1 - \beta^2)\sqrt{\sin(\theta/2)}$ |
| Enlargement | $K = 2.6 \sin(\theta/2)\,(1 - \beta^2)^2$ | $K = (1 - \beta^2)^2$ (Borda-Carnot) |

$\theta$ is clamped to 1°-180° inside the sine. A cone angle $\le 0$ is computed from the geometry: $\theta = 2 \arctan\!\big(|D_1 - D_2| / (2H)\big)$. Equal diameters give $K = 0$.

$$\Delta P_{\text{form}} = K\,\frac{\rho\, Q|Q|}{2 A_s^2}$$

### 3.4 Wall friction over the fitting

Evaluated at the mean diameter $D_{\text{avg}} = (D_1 + D_2)/2$, area $A_{\text{avg}}$:

$$\Delta P_{\text{fric}} = f\,\frac{H}{D_{\text{avg}}}\,\frac{\rho\, Q|Q|}{2 A_{\text{avg}}^2}, \qquad \mathrm{Re} = \frac{\rho\,|Q|\,D_{\text{avg}}}{A_{\text{avg}}\,\max(10^{-7}, \mu)}$$

$f$ is the Churchill (1977) friction factor with $\varepsilon / D_{\text{avg}}$, the same function as the pipe (`FluidProperties.get_darcy_friction_factor`, audit D-07; see [pipe.md](pipe.md#33-friction-factor-_friction_factor-churchill-1977)): $64/\mathrm{Re}$ in laminar flow, Colebrook-like in turbulent flow, one smooth curve in between. Roughness 0 is a smooth wall. The fitting is short, so friction is a small part of the loss.

$$\Delta P_{\text{loss}} = \Delta P_{\text{form}} + \Delta P_{\text{fric}}$$

### 3.5 Worked example

Water at 20 °C, 3" × 2" STD ($D$ = 77.9 / 52.5 mm, $H$ = 89 mm, $\theta$ = 18.2°):

| Flow | Small-bore velocity | Fitting | Loss | Bernoulli | Total $P_1 - P_2$ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 100 L/min | 0.77 m/s | Reducer | 0.25 mbar | +2.35 mbar | +2.6 mbar |
| 100 L/min | 0.77 m/s | Expander | 0.41 mbar | −2.35 mbar | −1.95 mbar |
| 300 L/min | 2.31 m/s | Reducer | 2.2 mbar | +21.2 mbar | +23.4 mbar |
| 300 L/min | 2.31 m/s | Expander | 3.6 mbar | −21.2 mbar | −17.6 mbar |

The Bernoulli term dominates: an expander shows a static pressure rise, a reducer a drop about ten times its loss.

### 3.6 Derivative

The class has no analytical derivative; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian), D-23).

## 4. Thermal & Energy Balance

The Bernoulli term is reversible and adds no heat. Only the irreversible loss heats the fluid:

$$\Delta T = \frac{|\Delta P_{\text{loss}}|}{\rho\, c_p(T)}$$

applied to the downstream end (the outlet for $Q \ge 0$, the inlet for $Q < 0$), with density and viscosity re-evaluated at both ends.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Inlet bore | m (from the catalogue) | `self.diameter_in` | m | 0.07792 (DN80 STD) | $> 0$ | Internal diameter $D_1$ |
| Outlet bore | m (from the catalogue) | `self.diameter_out` | m | 0.05248 (DN50 STD) | $> 0$ | Internal diameter $D_2$ |
| Length | m | `self.length` | m | 0.089 | $> 0$ | End-to-end length $H$ |
| Cone angle | deg | `self.cone_angle_deg` | deg | 18.2 | $\le 0$: from geometry; else 1-180 | Included angle $\theta$ |
| Roughness | mm | `self.roughness` | m | 0.045 mm | $\ge 0$ (0 = smooth) | Wall roughness for the friction term |
| Type | text | `self.reducer_type` | - | concentric | concentric, eccentric | Inspector only; no hydraulic effect |
| Standard | text | `self.standard` | - | ASME_B16_9 | catalogue code | Inspector only |
| DN large / small, schedule | DN, text | `self.dn_large`, `self.dn_small`, `self.sch_large`, `self.sch_small` | - | 80 / 50, STD | catalogue | Inspector only; the bores carry the hydraulics |

The parser rejects a bore or length $\le 0$ and a negative roughness. Missing values take the defaults.

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic relation ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect.
- **Reverse flow:** supported. The form loss is odd in $Q$ and switches between contraction and enlargement with the flow direction; the Bernoulli term keeps its sign. Reverse flow through a 3" × 2" reducer is the mirror of forward flow through a 2" × 3" expander: $\Delta P_{\text{reverse}} = -\Delta P_{\text{forward}}$.
- **Next to a reservoir:** an expander right at a tank or pressure source only has a steady state because the pipe from the reservoir takes the entry velocity head, see [pipe.md](pipe.md#34-entry-from-a-reservoir).
- **Operating cases:** all fields can be overridden per case.
- **Not modelled:** eccentric versus concentric shape, flow separation in wide diffusers beyond the Crane coefficients, and cavitation at the small bore.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_reducer.py::test_reducer_crane_k_factors` | 3" × 2" ($\beta$ = 0.6735): at 18.2° $K_c = 0.8 \cdot 0.158158 \cdot 0.54638$, $K_e = 2.6 \cdot 0.158158 \cdot 0.54638^2$; at 90° $K_c = 0.5\sqrt{0.707107} \cdot 0.54638$, $K_e = 0.54638^2$; all within 0.01 %, referenced to the small bore |
| `test_reducer.py::test_reducer_contraction_losses_and_bernoulli` | 3" × 2" reducer, 100 L/min water: loss > 0, Bernoulli > 0, total = loss + Bernoulli within $10^{-5}$ |
| `test_reducer.py::test_reducer_expander_diffuser_recovery` | 2" × 3" expander: Bernoulli < 0, loss > 0 |
| `test_reducer.py::test_reducer_reverse_flow_symmetry` | Reverse $\Delta P$ = −forward $\Delta P$ within 0.01 % for the tested case |
| `test_reducer.py::test_zero_reducer_roughness_is_kept_as_smooth`, `test_reducer_roughness_is_read_in_mm` | 0.2 mm → 0.0002 m; missing → 0.045 mm; 0 stays 0 |
| `test_reducer.py::test_d07_reducer_friction_equals_pipe_friction` | Equal bores, 50 mm × 0.5 m, oil ($\rho$ = 870, $\mu$ = 0.03 Pa·s), $Q = 10^{-6}$ to $10^{-2}$ m³/s (laminar to turbulent), roughness 0 and 0.045 mm: $\Delta P$ equals a pipe of the same size within $10^{-9}$ |
| `backend/tests/unit/equipment/test_pipe_reservoir_entry.py::test_expander_between_reservoirs_with_short_pipes` | Expander 0.1-5 m from a reservoir: flow matches an independent Crane + Bernoulli + entry sum within 1 % |

## Data Fields

Node type: `reducer`, `expander`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `diameter_in_m` | m | 0.07792 (DN80 STD) |
| `diameter_out_m` | m | 0.05248 (DN50 STD) |
| `length_m` | m | 0.089 |
| `roughness_mm` | mm | 0.045 |
| `cone_angle_deg` | deg | 18.2 |
| `reducer_type` | text (`concentric` / `eccentric`) | concentric |
| `standard` | text (reducer catalogue code) | ASME_B16_9 |
| `dn_large` | DN | 80 |
| `dn_small` | DN | 50 |
| `sch_large` | text | STD |
| `sch_small` | text | STD |
