# Calibrated Restriction (`calibrated_restriction`)

## 1. Overview & Purpose

A fixed restriction calibrated from one known operating point: flow $Q_0$, inlet and outlet pressure, temperature $T_0$ and calibration fluid. From that point the model scales the pressure drop to other flows, temperatures and fluids with one of three laws.

Use it for internal clearances, bearing feeds, nozzles, spray bars, bypass bores, a consumer known only from a datasheet point ("10 L/min at 2.5 bar"), or any resistance whose geometry is unknown.

| `restriction_model` | Law | Typical use |
| :--- | :--- | :--- |
| `orifice` (default) | Equivalent sharp-edged orifice with $C_d(\mathrm{Re})$ | Nozzles, bores, jets: quadratic when turbulent, viscous at low Re |
| `laminar` | $\Delta P \propto \mu\, Q$ | Capillaries, bearing clearances, fluid films |
| `quadratic` | $\Delta P \propto \rho\, Q^2$ | Fixed K-factor resistance |

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| CR-01 | Standard | ISO 5167-1:2022; ISO 5167-2:2022 | Orifice flow equation for the equivalent orifice | ✅ ISO 5167-1:2022 §5.1 F(1) (equation form) |
| CR-02 | Standard | ISO 5167-2:2022 | Permanent pressure loss ratio $(1 - \beta^2)$ (classic form) | ❌ Not in ISO 5167-2 (§5.4 gives F(7), 1 − β^1.9), D-28 |
| CR-03 | Literature | Wuest (1954), citation not identified; Idelchik, *Handbook of Hydraulic Resistance*, 4th ed. (2008) | Laminar discharge coefficient $C_d \approx 0.2\sqrt{\mathrm{Re}}$ of small orifices | ⚪ Unverified 🚩 |
| CR-04 | Principle | Hagen-Poiseuille law | Laminar law $\Delta P \propto \mu Q$ | ➖ Principle |
| CR-05 | Literature | Crane TP-410, *Flow of Fluids* (edition not fixed; newest confirmed 2018) | Resistance coefficient $K$ for the quadratic law | ⚪ Unverified |

## 3. Physical & Mathematical Implementation

### 3.1 Calibration (`_calibrate`)

$$q_0 = \max\!\left(10^{-6},\ \frac{Q_{0,\text{L/min}}}{60\,000}\right), \qquad \Delta P_0 = \max\!\big(1,\ (P_{\text{in},0} - P_{\text{out},0}) \cdot 10^5\big), \qquad \rho_0, \mu_0 = f(\text{fluid}_0, T_0)$$

Only the pressure **difference** of the calibration point matters. The calibration fluid is the system fluid (`system`) or a catalogue fluid, for example a datasheet measured with water.

Calibration is lazy (`_ensure_calibrated`): it runs at the first `calculate_delta_p`, `calculate_dp_derivative` or `calculate` call, after the parser has set the connected pipe bore and the global settings, and again only when one of its inputs changes (calibration point, model, resolved fluid, pipe bore).

| Model | Calibrated constant |
| :--- | :--- |
| `laminar` | $K_{\text{lam}} = \Delta P_0 / (\mu_0\, q_0)$ |
| `quadratic` | $K_{\text{quad}} = \Delta P_0 / (\rho_0\, q_0^2)$ |
| `orifice` | equivalent bore $d_{\text{eq}}$ with $\Delta P_{\text{orifice}}(d_{\text{eq}}; q_0, \rho_0, \mu_0) = \Delta P_0$ (bisection, clamped to 0.1 mm-10 m) |

### 3.2 Pressure drop (`calculate_delta_p`)

$$\Delta P_{\text{lam}} = K_{\text{lam}}\, \mu\, Q, \qquad \Delta P_{\text{quad}} = K_{\text{quad}}\, \rho\, Q|Q|$$

**Orifice model**, with $D$ the connected pipe bore, $\beta = \min(0.99,\ d_{\text{eq}}/D)$:

$$\Delta P_{\text{orifice}} = \underbrace{\frac{\rho\, v_1 |v_1|}{2} \cdot \frac{1 - \beta^4}{C_d^2\, \beta^4}}_{\text{differential pressure}} \cdot (1 - \beta^2), \qquad v_1 = \frac{Q}{\pi D^2 / 4}$$

$$C_d(\mathrm{Re}_o) = 0.60 \tanh\!\left(\frac{0.2\sqrt{\mathrm{Re}_o}}{0.60}\right), \qquad \mathrm{Re}_o = \frac{\rho\, |v_o|\, d_{\text{eq}}}{\mu}$$

$C_d$ (`FluidProperties.get_orifice_cd`, audit F1-25) is continuous and monotonic: $0.2\sqrt{\mathrm{Re}}$ (laminar, $\Delta P \propto \mu Q$) at low Re, 0.60 at high Re ($\Delta P \propto \rho Q^2$). So the orifice model moves by itself from viscous to quadratic behaviour as the flow or the viscosity changes.

$D$ is taken from the connected pipe (the upstream pipe first, else the downstream one; DN50 if none).

### 3.3 Worked example

Calibrated at 10 L/min, 3.5 → 1.0 bar(a) (2.5 bar), ISO VG 46 at 45 °C, DN25 line ($D$ = 26.6 mm; equivalent bore 3.8 mm):

| Operating point | `orifice` | `laminar` | `quadratic` |
| :--- | :--- | :--- | :--- |
| 10 L/min, 45 °C (calibration) | 2.50 bar | 2.50 bar | 2.50 bar |
| 20 L/min, 45 °C | 10.0 bar | 5.0 bar | 10.0 bar |
| 10 L/min, 20 °C (oil 3.6× more viscous) | 2.54 bar | 9.24 bar | 2.54 bar |
| 10 L/min, 80 °C | 2.44 bar | 0.73 bar | 2.44 bar |

At this point the equivalent bore runs turbulent, so the orifice model follows the quadratic law; with a smaller flow or a thicker oil it moves towards the laminar law.

### 3.4 Derivative (`calculate_dp_derivative`)

$$\frac{\partial \Delta P_{\text{lam}}}{\partial Q} = K_{\text{lam}}\, \mu, \qquad \frac{\partial \Delta P_{\text{quad}}}{\partial Q} = 2 K_{\text{quad}}\, \rho\, |Q|$$

$$\frac{\partial \Delta P_{\text{orifice}}}{\partial Q} = \frac{2\, c\, |Q|}{C_d^2}\left(1 - \frac{d\ln C_d}{d\ln \mathrm{Re}}\right), \qquad c = \frac{\rho}{2A_1^2} \cdot \frac{(1 - \beta^4)(1 - \beta^2)}{\beta^4}$$

$d\ln C_d / d\ln \mathrm{Re}$ (`get_orifice_cd_slope`) is 0.5 in the laminar limit and 0 in the turbulent limit; $|Q|$ is floored at a tiny flow so the slope stays positive at $Q = 0$. In the network Jacobian the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)).

## 4. Thermal & Energy Balance

The whole pressure drop is throttling loss (audit F1-16):

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Restriction Model | text | `self.restriction_model` | - | orifice | orifice, laminar, quadratic | Scaling law |
| Baseline Flow | L/min (GPM) | `self.flow_base_lmin` | L/min (→ m³/s) | 10 | $> 0$ | Calibration flow $Q_0$ |
| Baseline Inlet Pressure | bar(a) (psi(a)) | `self.inlet_pressure_base_bar` | bar (→ Pa) | 3.5 | $>$ outlet | Calibration inlet pressure |
| Baseline Outlet Pressure | bar(a) (psi(a)) | `self.outlet_pressure_base_bar` | bar (→ Pa) | 1.0 | $<$ inlet | Calibration outlet pressure |
| Baseline Temp | °C (°F) | `self.temp_base_c` | °C (→ K) | 45 | fluid validity range | Calibration temperature $T_0$ |
| Calibration Fluid | catalogue | `self.fluid_type` | - | system | system, catalogue id | Fluid of the calibration point |

Only a missing value takes the default; 0 °C is a valid calibration temperature. The parser rejects a flow ≤ 0, an outlet pressure ≤ 0 bar(a), an inlet pressure not above the outlet pressure and a temperature at or below absolute zero (`ModelInputError`). A calibration temperature below 0 °C is evaluated at 0 °C.

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic relation ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect.
- **Reverse flow:** symmetric in all three models ($\Delta P$ is odd in $Q$).
- **Recalibration:** only when a calibration input changes (see 3.1), so the first Newton solve already uses the connected pipe bore and the system fluid.
- **Orifice limit:** $\beta$ is capped at 0.99. A calibration drop smaller than a $\beta = 0.99$ orifice gives at $Q_0$ cannot be reproduced; use the quadratic model.
- **Operating cases:** all fields can be overridden per case.
- **Not modelled:** cavitation and choking in the restriction, compressibility, and a law between laminar and quadratic other than the orifice $C_d(\mathrm{Re})$.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_calibrated_restriction.py::test_calibrated_restriction_calibration` | 10 L/min, 3.5 → 1.0 bar at 45 °C (water): every model reproduces 2.5 bar within 0.01 %; derivative positive and within 1 % of a central difference |
| `test_calibrated_restriction.py::test_laminar_scaling` | Laminar: twice the flow or twice the viscosity gives twice the drop ($10^{-5}$) |
| `test_calibrated_restriction.py::test_quadratic_scaling` | Quadratic: twice the flow gives four times the drop ($10^{-5}$) |
| `test_calibrated_restriction.py::test_graph_parser_calibrated_restriction` | Parser reads 15 L/min, 4.0 / 1.5 bar(a), 50 °C, laminar, ISO VG 46 |
| `test_calibrated_restriction.py::test_d08_parsed_restriction_reproduces_calibration_at_first_call` | Parsed node, system fluid ISO VG 46, DN25 line: 2.5 bar at 10 L/min on the first call, all three models ($10^{-4}$) |
| `test_calibrated_restriction.py::test_d08_calibration_runs_once_and_again_only_after_a_change` | Repeated calls calibrate once; a new pipe bore triggers one recalibration |
| `test_calibrated_restriction.py::test_d08_zero_calibration_temperature_is_kept` | 0 °C stays 0 °C (constructor and parser) |
| `test_calibrated_restriction.py::test_d08_invalid_calibration_point_is_an_input_error` | Flow ≤ 0, inlet ≤ outlet, outlet ≤ 0 bar(a), temperature below absolute zero: `ModelInputError` naming the component |

No network benchmark at the calibration point and no throttling heat test for this component.

## Data Fields

Node type: `calibrated_restriction`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_base_lmin` | L/min | 10 |
| `inlet_pressure_base_bara` | bar(a) | 3.5 |
| `outlet_pressure_base_bara` | bar(a) | 1 |
| `temp_base_c` | °C | 45 |
| `restriction_model` | text (`orifice` / `laminar` / `quadratic`) | orifice |
| `fluid_type` | catalogue id (`system` = global) | system |
