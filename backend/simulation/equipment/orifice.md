# Orifice (`orifice`)

## 1. Overview & Purpose

The Orifice component represents a concentric sharp-edged orifice plate installed in a circular pipe. It acts as a fixed restriction: for a given flow rate the plate produces a non-recoverable permanent pressure loss along the network (and a larger, recoverable differential pressure across the plate that is not modeled). The component calculates the **network permanent pressure loss** $\Delta P(Q, \rho, \mu)$ supplied to the solver, and therefore behaves as a passive (quadratic-dominated) hydraulic resistor. Only the network pressure loss is computed; flow-measurement (tap-differential) use is out of scope, so the RG coefficient is evaluated for corner taps.

Two calculation standards are selectable:

- **ISO 5167 (`standard='iso_5167'`, default):** ISO 5167-1:2022 / ISO 5167-2:2022 orifice plates, using the Reader-Harris/Gallagher (RG) discharge-coefficient correlation for the meter coefficient $C$ and the ISO 5167-2:2022 §5.4 Formula (7) permanent-pressure-loss ratio.
- **Classic Cd (`standard='classic_cd'`):** the legacy Reynolds-corrected discharge-coefficient model retained byte-for-byte for backward compatibility with existing diagrams.

## 2. Governing Standards & Reference Literature

- **ISO 5167-1:2022:** Measurement of fluid flow by means of pressure differential devices inserted in circular cross-section conduits running full — Part 1: General principles and requirements.
- **ISO 5167-2:2022:** Measurement of fluid flow … — Part 2: Orifice plates (primary implementation standard; supersedes ISO 5167-2:2003).
- **Future options (architecture supports adding them):** ASME MFC-3M (orifice plates), Crane Technical Paper No. 410 (resistance-coefficient method).

### Standard Selection

| `standard` value | Model | Notes |
| :--- | :--- | :--- |
| `iso_5167` | RG coefficient + §5.4 Formula (7) permanent loss | Default. Valid for $\beta \in [0.1, 0.75]$, $d \ge 12.5$ mm, $50 \le D \le 1000$ mm. |
| `classic_cd` | Legacy `C_d$(\mathrm{Re})$` + $(1-\beta^2)$ loss ratio | Legacy diagrams; behavior unchanged from before this feature. |

## 3. Physical & Mathematical Implementation

All quantities in SI units (Pa, m³/s, kg/m³, Pa·s, m). Liquids only (expansibility factor $\varepsilon = 1$).

### 3.1 Geometry

$$\beta = \frac{d}{D}, \qquad A_{\mathrm{pipe}} = \frac{\pi D^2}{4}, \qquad A_{\mathrm{orifice}} = \frac{\pi d^2}{4}$$

For the RG computation the inputs are clamped to the correlation's validity range: $\beta_{\mathrm{eff}} = \min(0.75, \max(0.1, \beta))$ and $d_{\mathrm{eff}} = \max(0.0125, d)$.

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

$$\mathrm{Re}_{\mathrm{valid}} = \begin{cases} 5000 & \beta \le 0.56 \\ 16000 & \beta > 0.56 \end{cases} \quad \text{(ISO 5167-2:2022 §5.3.1)}$$

The RG correlation is unphysical at very low $\mathrm{Re}$ (its $(10^6/\mathrm{Re})^{0.3}$ terms diverge as $\mathrm{Re}\to 0$, forcing $\Delta p \to 0$). To keep the Newton solver continuous down to zero flow, the RG coefficient is blended over a band $\mathrm{Re} \in [\mathrm{Re}_{\mathrm{lo}}, \mathrm{Re}_{\mathrm{valid}}]$ with $\mathrm{Re}_{\mathrm{lo}} = 0.4\,\mathrm{Re}_{\mathrm{valid}}$ to a viscous extension:

$$C_{\mathrm{low}} = \frac{0.6}{\sqrt{1 + 250/\mathrm{Re}_o}\,\sqrt{1-\beta^4}}, \qquad \mathrm{Re}_o = \frac{\mathrm{Re}_D}{\beta_{\mathrm{eff}}}$$

$$w = \mathrm{smoothstep}\!\left(\frac{\mathrm{Re}_D - \mathrm{Re}_{\mathrm{lo}}}{\mathrm{Re}_{\mathrm{valid}} - \mathrm{Re}_{\mathrm{lo}}}\right), \qquad C_{\mathrm{eff}} = (1-w)C_{\mathrm{low}} + w\,C_{\mathrm{RG}}$$

`smoothstep(t) = t^2(3-2t)` clamped to $[0,1]$ gives $C^0$ and $C^1$ continuity at both band edges. Below the band the model reproduces legacy-like viscous (laminar) behavior; at and above $\mathrm{Re}_{\mathrm{valid}}$ it is pure ISO 5167.

### 3.6 Analytical derivative

Semi-analytic chain rule through the closed-form meter coefficient $C_{\mathrm{eff}}(\mathrm{Re}_D)$, identical in structure to the forward model:

1. $C(\mathrm{Re}_D)$ is the closed-form blended coefficient (RG, blend, or legacy per standard).
2. $dC/d\mathrm{Re}_D$ via central difference of the closed form with relative step $10^{-4}\,\mathrm{Re}_D$ (absolute floor $10^{-3}$; forward difference fallback below the step).
3. Chain rule through $\Delta p = r(C)\, k\, q|q|/C^2$ with $k = 0.5\rho/A_{\mathrm{orifice}}^2$:
   - $d(\Delta p_{\mathrm{tap}})/dq = \Delta p_{\mathrm{tap}}(2/q - 2(dC/dq)/C)$ for $q \ne 0$
   - $d\mathrm{Re}_D/d|q| = \rho D / (\mu A_{\mathrm{pipe}})$
   - $dr/dC = -\dfrac{2\beta^2(1-\beta^4)}{S\,(S + C\beta^2)^2}$, $S = \sqrt{1 - \beta^4(1-C^2)}$
   - $d\Delta p/dq = r\, d(\Delta p_{\mathrm{tap}})/dq + \Delta p_{\mathrm{tap}}\,(dr/dC)\,(dC/d\mathrm{Re}_D)\,(d\mathrm{Re}_D/d|q|)\,\mathrm{sign}(q)$

The derivative is strictly positive in all regimes, as required by the passive-resistor Jacobian (`solver.py`). At $q \approx 0$ a closed-form viscous-limit value is used (linear slope of the laminar regime).

### 3.7 Legacy model (`standard='classic_cd'`)

Byte-for-byte previous behavior:

$$\Delta p = \underbrace{\tfrac{1}{2}\rho v_{\mathrm{pipe}}^2}_{\text{dynamic}} \cdot \frac{1-\beta^4}{C_d^2\,\beta^4}\cdot (1-\beta^2), \qquad C_d = C_d(\mathrm{Re}_o) \text{ from `fluid_utils.get_orifice_cd`}$$

with $\beta = \min(0.99, d/D)$ and the existing closed-form analytic derivative. `fluid_utils.get_orifice_cd` is shared by `check_valve_orifice`, `rupture_disc`, and `calibrated_restriction` and is **not** modified.

## 4. Thermal & Energy Balance

Throttling friction dissipation converts pressure energy into fluid thermal enthalpy (Joule–Thomson-like):

$$dT = \frac{|\Delta P|}{\rho\, C_p(T)}$$

applied to the fluid exiting the node (forward flow: inlet→outlet; reverse flow: outlet→inlet).

## 5. Parameter & Unit Specification Table

| Parameter | UI Unit | Backend Var | SI Unit | Default | Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Pipe Diameter | mm | `pipe_diameter` | m | `0.05248` (DN50) | $> 0$ | Connected-pipe internal diameter (auto-detected from the connected pipe when present) |
| Orifice Diameter | mm | `orifice_diameter` | m | `0.07` | $> 0$ | Orifice plate bore diameter |
| Standard | — | `standard` | str | `'iso_5167'` | `iso_5167`, `classic_cd` | Calculation standard |

## 6. Operating Modes & Model Boundaries

- **Steady-State Solver:** static algebraic equilibrium ($\Delta t = 0$); no time integration.
- **Bidirectional Flow:** fully symmetric $\Delta p(-Q) = -\Delta p(Q)$; $C$ depends on $|\mathrm{Re}_D|$.
- **Validity clamps (ISO model):** $\beta_{\mathrm{eff}}$ clamped to $[0.1, 0.75]$ and $d_{\mathrm{eff}}$ to $\ge 12.5$ mm for the RG computation; physical geometry is used for the tap differential pressure. Clamps keep the correlation well-behaved outside the formal validity range.
- **Reynolds boundary:** the "pure ISO" region begins at $\mathrm{Re}_D \ge 5000$ (or $16000$ for $\beta > 0.56$). Below $\mathrm{Re}_{\mathrm{valid}}$ the viscous blend applies; below $\mathrm{Re}_{\mathrm{lo}}$ the model is the legacy-like viscous extension. This boundary is explicit and intentional for Newton convergence.
- **Roughness validity (Tables 1 & 2):** exact $R_a/D$ roughness enforcement is not performed; documented as a validity note only, calculation is not blocked.
- **Active / Inactive:** shutting the orifice down does not block flow (passive resistor).
- **Operating cases:** supports node-level parameter overrides per operating scenario.

## 7. Verification & Benchmarks

- **Test file:** `backend/tests/test_physics_orifice.py` (11 tests).
- RG coefficient matches an independent reimplementation of ISO 5167-2:2022 Formula (4) to relative $10^{-9}$ across a matrix of $(\beta, \mathrm{Re}_D, D)$ including $D < 71.12$ mm.
- High-$\mathrm{Re}$ limit: $D \ge 71.12$ mm: $C \to 0.5961 + 0.0261\beta^2 - 0.216\beta^8$ within $10^{-4}$.
- Tap differential pressure satisfies $q_m = C A_o \sqrt{2\rho\Delta p}$ within $10^{-4}$.
- Permanent loss ratio matches a direct recomputation of §5.4 Formula (7) (using $C$, not $C_d$) within $10^{-4}$.
- Analytical derivative within $1\%$ of central finite differences across laminar, blend, and fully turbulent regimes ($\beta = 0.5$ and $0.7$, water at 20 °C, DN50).
- Continuity: no jumps in $\Delta p$ or its derivative across the blend bands.
- Legacy model: `classic_cd` reproduces the previous formula and derivative to $10^{-12}$.
- Network solve: tank → pipe → orifice → pipe → tank converges with positive orifice $\Delta P$.
