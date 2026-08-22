# Reducer / Expander (`reducer`)

The **Reducer / Expander** is a passive in-line piping component that models the fluid dynamic transition between two different nominal pipe diameters (e.g., $DN\ 80 \to DN\ 50$ or $3'' \to 2''$).

---

## 1. Functional Overview
* **Component Type:** Passive In-line Resistance & Area Transition (`reducer`)
* **Ports:** 1 Inlet (`inlet-0`) and 1 Outlet (`outlet-0`)
* **Governing Dimensional Standard:** **ASME B16.9** (Factory-Made Wrought Buttwelding Fittings — Concentric & Eccentric Reducers) and **ASME B36.10M / B36.19M** (Pipe Schedules).
* **Governing Hydraulic Standard:** **Crane Technical Paper No. 410 (Crane TP 410)** / Miller / Idelchik formulas for conical contractions and conical diffusers.

---

## 2. Mathematical Modeling & Physics

### A. Total Static Pressure Change ($\Delta P$)
The total static pressure drop across the reducer from inlet port $1$ to outlet port $2$ is the superposition of irreversible dissipation (head loss) and reversible kinetic energy conversion (Bernoulli effect):

$$\Delta P_{\text{total}} = P_1 - P_2 = \Delta P_{\text{loss}} + \Delta P_{\text{Bernoulli}}$$

### B. Bernoulli Dynamic Pressure Shift ($\Delta P_{\text{Bernoulli}}$)
For an incompressible fluid of density $\rho$ with volumetric flow rate $Q$:

$$\Delta P_{\text{Bernoulli}} = \frac{1}{2} \rho (v_2^2 - v_1^2) = \frac{1}{2} \rho Q |Q| \left( \frac{1}{A_2^2} - \frac{1}{A_1^2} \right)$$

* **Contraction ($D_1 > D_2$):** Fluid accelerates ($v_2 > v_1$), dynamic pressure increases, static pressure drops ($\Delta P_{\text{Bernoulli}} > 0$).
* **Diffuser / Expander ($D_1 < D_2$):** Fluid decelerates ($v_2 < v_1$), dynamic pressure recovers into static pressure ($\Delta P_{\text{Bernoulli}} < 0$).

### C. Crane TP 410 Form & Friction Losses ($\Delta P_{\text{loss}}$)

#### 1. Gradual Conical Contraction ($D_{\text{large}} \to D_{\text{small}}$, $\beta = D_{\text{small}} / D_{\text{large}} < 1$)
Referenced to the smaller diameter outlet velocity $v_2$:
* For total included cone angle $\theta \le 45^\circ$:
  $$K_{\text{form}, 2} = 0.5 (1 - \beta^2) \sqrt{\sin\left(\frac{\theta}{2}\right)}$$
* For $45^\circ < \theta \le 180^\circ$:
  $$K_{\text{form}, 2} = 0.8 \sin\left(\frac{\theta}{2}\right) (1 - \beta^2)$$

#### 2. Gradual Conical Diffuser / Expansion ($D_{\text{small}} \to D_{\text{large}}$, $\beta = D_{\text{small}} / D_{\text{large}} < 1$)
Referenced to the smaller diameter inlet velocity $v_1$:
* For total included cone angle $\theta \le 45^\circ$:
  $$K_{\text{form}, 1} = 2.6 \sin\left(\frac{\theta}{2}\right) (1 - \beta^2)^2$$
* For $45^\circ < \theta \le 180^\circ$:
  $$K_{\text{form}, 1} = 1.0 (1 - \beta^2)^2 \quad (\text{Borda-Carnot sudden expansion limit})$$

#### 3. Transition Wall Friction
Across the reducer fitting length $H$ with average diameter $D_{\text{avg}} = \frac{D_1 + D_2}{2}$:
$$K_{\text{fric}} = \frac{f \cdot H}{D_{\text{avg}}}$$
where Darcy friction factor $f$ is evaluated at $Re_{\text{avg}} = \frac{\rho |v_{\text{avg}}| D_{\text{avg}}}{\mu}$.

#### 4. Total Irreversible Loss
$$\Delta P_{\text{loss}} = \Delta P_{\text{form}} + \Delta P_{\text{fric}}$$

---

## 3. Analytical Jacobians for Solver Stability
To guarantee quadratic convergence in the Newton-Raphson solver, the analytical derivative is computed exactly:

$$\frac{\partial \Delta P_{\text{total}}}{\partial Q} = \rho |Q| \left( \frac{K_{\text{form}}}{A_{\text{ref}}^2} + \frac{K_{\text{fric}}}{A_{\text{avg}}^2} + \left(\frac{1}{A_2^2} - \frac{1}{A_1^2}\right) \right)$$

---

## 4. Thermal Balance & Viscous Dissipation
Reversible Bernoulli pressure shifts do not cause thermal entropy generation. Only irreversible head losses dissipate into fluid thermal energy:

$$\Delta T = \frac{|\Delta P_{\text{loss}}|}{\rho \cdot C_p}$$

---

## 5. Parameter Reference

| Parameter | Type | Unit | Default | Description |
|---|---|---|---|---|
| `diameter_in` | `float` | $\text{m}$ | `0.07792` | Inlet internal diameter ($ID_1$, ~DN80 STD) |
| `diameter_out` | `float` | $\text{m}$ | `0.05248` | Outlet internal diameter ($ID_2$, ~DN50 STD) |
| `length` | `float` | $\text{m}$ | `0.089` | ASME B16.9 end-to-end length $H$ |
| `cone_angle_deg` | `float` | $\text{deg}$ | `18.2` | Transition included angle $\theta$ |
| `reducer_type` | `str` | — | `"concentric"` | `"concentric"` or `"eccentric"` |
| `standard` | `str` | — | `"ASME_B16_9"` | `"ASME_B16_9"` or `"CUSTOM"` |
| `dn_large` | `int` | $\text{mm}$ | `80` | Large end nominal diameter ($DN_1$) |
| `dn_small` | `int` | $\text{mm}$ | `50` | Small end nominal diameter ($DN_2$) |
| `sch_large` | `str` | — | `"STD"` | Large end schedule |
| `sch_small` | `str` | — | `"STD"` | Small end schedule |
| `roughness` | `float` | $\text{m}$ | `0.000045` | Material absolute surface roughness |
