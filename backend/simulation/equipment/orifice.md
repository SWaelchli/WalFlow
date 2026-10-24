# Orifice (`orifice`)

## 1. Overview & Purpose

The Orifice component represents a concentric sharp-edged orifice plate installed in a circular pipe. It acts as a fixed restriction: for a given flow rate the plate produces a non-recoverable permanent pressure loss along the network (and a larger, recoverable differential pressure across the plate that is not modeled). The component calculates the **network permanent pressure loss** $\Delta P(Q, \rho, \mu)$ supplied to the solver, and therefore behaves as a passive (quadratic-dominated) hydraulic resistor. Only the network pressure loss is computed; flow-measurement (tap-differential) use is out of scope, so the RG coefficient is evaluated for corner taps.

Two calculation standards are selectable:

- **ISO 5167 (`standard='iso_5167'`, default):** ISO 5167-1:2022 / ISO 5167-2:2022 orifice plates, using the Reader-Harris/Gallagher (RG) discharge-coefficient correlation for the meter coefficient $C$ and the ISO 5167-2:2022 §5.4 Formula (7) permanent-pressure-loss ratio.
- **Classic Cd (`standard='classic_cd'`):** the Reynolds-corrected discharge-coefficient model of the calibrated restriction and the check valve orifice (`FluidProperties.get_classic_orifice_dp`). Its permanent loss uses Formula (7); files from before this change (loss ratio $1 - \beta^2$) give results up to 2.5 % different.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| ORI-01 | Standard | ISO 5167-2:2022 | Reader-Harris/Gallagher discharge coefficient (primary implementation standard) | ✅ ISO 5167-2:2022 §5.3.2.1 F(4) |
| ORI-02 | Standard | ISO 5167-2:2022 | Permanent pressure loss, §5.4 Formula (7) | ✅ ISO 5167-2:2022 §5.4.1 F(7) |
| ORI-03 | Standard | ISO 5167-2:2022 | Validity limits of the `iso_5167` model | ✅ ISO 5167-2:2022 §5.3.1 |
| ORI-04 | Standard | ISO 5167-1:2022 | General principles and requirements | ✅ ISO 5167-1:2022 §5.1 F(1) |

Future options (the architecture supports adding them): ASME MFC-3M-2004 (R2025) for orifice plates, Crane TP-410 resistance-coefficient method. Not cited for any claim.

### Standard Selection

| `standard` value | Model | Notes |
| :--- | :--- | :--- |
| `iso_5167` | RG coefficient + §5.4 Formula (7) permanent loss | Default. Valid for $\beta \in [0.1, 0.75]$, $d \ge 12.5$ mm, $50 \le D \le 1000$ mm. |
| `classic_cd` | Legacy $C_d(\mathrm{Re}_o)$ + Formula (7) loss ratio with that $C_d$ | Legacy diagrams; loss ratio was $1 - \beta^2$ in older versions. |

## 3. Physical & Mathematical Implementation

All quantities in SI units (Pa, m³/s, kg/m³, Pa·s, m). Liquids only (expansibility factor $\varepsilon = 1$).

### 3.1 Geometry

$$\beta = \frac{d}{D}, \qquad A_{\mathrm{pipe}} = \frac{\pi D^2}{4}, \qquad A_{\mathrm{orifice}} = \frac{\pi d^2}{4}$$

The RG computation uses the true geometry: $\beta_{\mathrm{eff}} = \min(0.99, \max(0.01, \beta))$ only guards against 0 and 1, and $d$ is not clamped. Outside the ISO limits ($\beta$ 0.1–0.75, $d \ge 12.5$ mm, $D$ 50–1000 mm) the correlation is extrapolated, and `iso_validity_issues` reports the violated limit.

### 3.2 Reader-Harris/Gallagher discharge coefficient (ISO 5167-2:2022 Formula (4), corner taps)

`_cd_rg_iso5167` computes and returns the **discharge coefficient $C_d$** (the same $C$ that appears in the standard's Formula (1) flow equation). For corner taps the tap-location terms vanish ($L_1 = L_2' = 0$), leaving:

$$
C_d = 0.5961 + 0.0261\beta^2 - 0.216\beta^8 + 0.000521\left(\frac{10^6\beta}{\mathrm{Re}_D}\right)^{0.7}
+ (0.0188 + 0.0063 A)\beta^{3.5}\left(\frac{10^6}{\mathrm{Re}_D}\right)^{0.3}
$$

with

$$A = \left(\frac{19000\beta}{\mathrm{Re}_D}\right)^{0.8}, \qquad \mathrm{Re}_D = \frac{\rho\, v_{\mathrm{pipe}}\, D}{\mu}$$

A small-diameter correction term $+0.011(0.75 - \beta_{\mathrm{eff}})(2.8 - D/0.0254)$ is applied **only when $D < 71.12$ mm**.

For the tap-dP denominator the blending logic uses the **meter coefficient** $C_m = C_d / \sqrt{1-\beta^4}$, computed in `_c_meter_from_re`. This absorbs the velocity-of-approach factor and allows the simpler tap-dP form $0.5\rho Q^2/(A_o^2 C_m^2)$.

### 3.3 Tap differential pressure

$$\Delta p_{\mathrm{tap}} = \frac{0.5\, \rho\, q\, |q|}{A_{\mathrm{orifice}}^2\, C^2}$$

Direction-aware through $q|q|$.

### 3.4 Permanent pressure loss (ISO 5167-2:2022 §5.4 Formula (7))

The network $\Delta P$ is the non-recoverable permanent loss. Formula (7) is defined in terms of **$C_d$ (discharge coefficient)**, not $C_m$:

$$r = \frac{\sqrt{1 - \beta^4(1 - C_d^2)} - C_d\beta^2}{\sqrt{1 - \beta^4(1 - C_d^2)} + C_d\beta^2}, \qquad \Delta p = r \cdot \Delta p_{\mathrm{tap}}$$

Since the blending logic works in $C_m$ space, $C_d$ is recovered just before the Formula (7) call:

$$C_d = C_m \cdot \sqrt{1 - \beta_{\mathrm{eff}}^4}$$

Passing $C_m$ to Formula (7) uncorrected would underestimate the permanent loss by 1–9% for $\beta \in [0.5, 0.75]$.

A simpler, less accurate approximation $\Delta\omega/\Delta p \approx 1 - \beta^{1.9}$ (ISO 5167-2:2022 §5.4.2) is documented for reference only and is not used in code.

### 3.5 Flow regimes & blending

ISO validity starts at the Reynolds limit $\mathrm{Re}_{\mathrm{valid}}(\beta)$:

$$\mathrm{Re}_{\mathrm{valid}} = \begin{cases} 5000 & \beta \le 0.56 \\ 16000\,\beta^2 & \beta > 0.56 \end{cases} \quad \text{(ISO 5167-2:2022 §5.3.1)}$$

The RG correlation is unphysical at very low $\mathrm{Re}$ (its $(10^6/\mathrm{Re})^{0.3}$ terms diverge as $\mathrm{Re}\to 0$, forcing $\Delta p \to 0$). To keep the Newton solver continuous down to zero flow, the RG coefficient is blended over a band $\mathrm{Re} \in [\mathrm{Re}_{\mathrm{lo}}, \mathrm{Re}_{\mathrm{valid}}]$ with $\mathrm{Re}_{\mathrm{lo}} = 0.4\,\mathrm{Re}_{\mathrm{valid}}$ to a viscous extension:

$$C_{\mathrm{low}} = \frac{0.60 \tanh\!\left(0.2\sqrt{\mathrm{Re}_o}/0.60\right)}{\sqrt{1-\beta^4}}, \qquad \mathrm{Re}_o = \frac{\mathrm{Re}_D}{\beta_{\mathrm{eff}}}$$

$$w = \mathrm{smoothstep}\!\left(\frac{\mathrm{Re}_D - \mathrm{Re}_{\mathrm{lo}}}{\mathrm{Re}_{\mathrm{valid}} - \mathrm{Re}_{\mathrm{lo}}}\right), \qquad C_{\mathrm{eff}} = (1-w)C_{\mathrm{low}} + w\,C_{\mathrm{RG}}$$

`smoothstep(t) = t^2(3-2t)` clamped to $[0,1]$ gives $C^0$ and $C^1$ continuity at both band edges. Below the band the model reproduces legacy-like viscous (laminar) behavior; at and above $\mathrm{Re}_{\mathrm{valid}}$ it is pure ISO 5167.

### 3.6 Derivative

The class has no analytical derivative; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)).

### 3.7 Legacy model (`standard='classic_cd'`)

Byte-for-byte previous behavior:

$$\Delta p = \underbrace{\tfrac{1}{2}\rho v_{\mathrm{pipe}}^2}_{\text{dynamic}} \cdot \frac{1-\beta^4}{C_d^2\,\beta^4}\cdot r(C_d, \beta), \qquad C_d = C_d(\mathrm{Re}_o) \text{ from `fluid_utils.get_orifice_cd`}$$

with $\beta = \min(0.99, d/D)$ and $r$ from Formula (7) (section 3.4), evaluated with this $C_d$. `fluid_utils.get_orifice_cd` is shared by `check_valve_orifice`, `rupture_disc`, and `calibrated_restriction` (tanh blend into 0.60).

## 4. Thermal & Energy Balance

Throttling friction dissipation converts pressure energy into fluid thermal enthalpy (Joule–Thomson-like):

$$dT = \frac{|\Delta P|}{\rho\, C_p(T)}$$

applied to the fluid exiting the node (forward flow: inlet→outlet; reverse flow: outlet→inlet), with density and viscosity re-evaluated at both ends.

## 5. Parameter & Unit Specification Table

| Parameter | UI Unit | Backend Var | SI Unit | Default | Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Pipe Diameter | mm | `pipe_diameter_m` | m | `0.1` | $> 0$ | Connected-pipe internal diameter (auto-detected from the connected pipe when present) |
| Orifice Diameter | mm | `orifice_diameter_m` | m | `0.07` | $> 0$ | Orifice plate bore diameter |
| Standard | — | `standard` | str | `'iso_5167'` | `iso_5167`, `classic_cd` | Calculation standard |

## 6. Operating Modes & Model Boundaries

- **Steady-State Solver:** static algebraic equilibrium ($\Delta t = 0$); no time integration.
- **Bidirectional Flow:** fully symmetric $\Delta p(-Q) = -\Delta p(Q)$; $C$ depends on $|\mathrm{Re}_D|$.
- **ISO geometry limits:** the RG correlation uses the true $\beta$ (guarded to 0.01–0.99) and $d$. Outside $\beta$ 0.1–0.75, $d \ge 12.5$ mm or $D$ 50–1000 mm it is extrapolated, and `iso_validity_issues` reports the violated limit.
- **Reynolds boundary:** the "pure ISO" region begins at $\mathrm{Re}_D \ge 5000$ (or $16000\,\beta^2$ for $\beta > 0.56$). Below $\mathrm{Re}_{\mathrm{valid}}$ the viscous blend applies; below $\mathrm{Re}_{\mathrm{lo}}$ the model is the legacy-like viscous extension. This boundary is explicit and intentional for Newton convergence.
- **Roughness validity (Tables 1 & 2):** exact $R_a/D$ roughness enforcement is not performed; documented as a validity note only, calculation is not blocked.
- **Active / Inactive:** shutting the orifice down does not block flow (passive resistor).
- **Operating cases:** supports node-level parameter overrides per operating scenario.

## 7. Verification & Benchmarks

- **Test file:** `backend/tests/test_physics_orifice.py` (11 tests).
- RG coefficient matches an independent reimplementation of ISO 5167-2:2022 Formula (4) to relative $10^{-9}$ across a matrix of $(\beta, \mathrm{Re}_D, D)$ including $D < 71.12$ mm.
- High-$\mathrm{Re}$ limit: $D \ge 71.12$ mm: $C \to 0.5961 + 0.0261\beta^2 - 0.216\beta^8$ within $10^{-4}$.
- Tap differential pressure satisfies $q_m = C A_o \sqrt{2\rho\Delta p}$ within $10^{-4}$.
- Permanent loss ratio matches a direct recomputation of §5.4 Formula (7) (using $C$, not $C_d$) within $10^{-4}$.
- Continuity: no jumps in $\Delta p$ across the blend bands.
- Legacy model: `classic_cd` reproduces the tanh $C_d$ law with the Formula (7) loss ratio to $10^{-12}$.
- `test_orifice.py::test_d26_reynolds_limit_above_beta_056_is_16000_beta_squared`: β = 0.75, Re_D 9 100 gives the pure RG drop and no Reynolds issue; Re_D 8 500 reports the issue (limit 16 000·β² = 9 000).
- `test_orifice.py::test_d28_permanent_loss_is_tap_dp_times_formula_7`: orifice `classic_cd`, calibrated restriction, check valve orifice and reduced-bore rupture disc, β = 0.5: drop = tap differential × Formula (7) within $10^{-9}$.
- Network solve: tank → pipe → orifice → pipe → tank converges with positive orifice $\Delta P$.

## Data Fields

Node type: `orifice`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `pipe_diameter_m` | m | 0.1 (replaced by the connected pipe's bore) |
| `orifice_diameter_m` | m | 0.07 |
| `standard` | text (`iso_5167` / `classic_cd`) | iso_5167 |
