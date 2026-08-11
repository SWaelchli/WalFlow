# Equipment Documentation Standard (`<equipment>.md`)

Every equipment class in the backend (`backend/simulation/equipment/<name>.py`) **must** have a corresponding documentation file in the same directory (`backend/simulation/equipment/<name>.md`).

This document provides theoretical transparency, engineering standard citations, physical equations, unit conversions, and validation benchmarks for developers and engineering users.

---

## 📋 Required Structure for `<equipment>.md`

Every `<equipment>.md` file must contain the following 7 standard sections:

```markdown
# [Equipment Name] (`node_type_string`)

## 1. Overview & Purpose
Brief high-level description of what the equipment is, its role in a hydraulic P&ID, and its basic operating principles.

## 2. Governing Standards & Reference Literature
- **Primary Engineering Standards:** (e.g. ISO 5167, ISO 4126, IEC 60534, ANSI/ISA-75, API 520, Crane TP 410).
- **Secondary / Reference Literature:** (e.g. Idelchik, Miller, manufacturer technical white papers).
- **Standard Selection / Options:** (If multiple standards or rating methods are supported, describe each option).

## 3. Physical & Mathematical Implementation
- **Primary Hydraulic Equation:** Exact formula for pressure drop $\Delta P(Q, \rho, \mu)$ implemented in Python.
- **Flow Regimes & Blending:** How laminar, transitional, and turbulent regimes are computed and blended smoothly ($C^0$ and $C^1$ continuity).
- **Analytical Derivative:** Formula for $\frac{\partial \Delta P}{\partial Q}$ supplied to the Newton-Raphson Jacobian.
- **Solver Formulation:** MCP Fischer-Burmeister complementarity equations, dynamic shutdown flags, or boundary definitions.

## 4. Thermal & Energy Balance
- Formulas for temperature change ($dT$), Joule-Thomson throttling heating ($dT = \frac{|\Delta P|}{\rho \cdot C_p}$), mechanical heat dissipation, or heat exchanger effectiveness.

## 5. Parameter & Unit Specification Table
| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ... | ... | ... | ... | ... | ... | ... |

## 6. Operating Modes & Model Boundaries
- Steady-state assumption ($\Delta t = 0$, instantaneous algebraic equilibrium).
- Active vs. Inactive shutdown behavior (`blocks_flow_on_shutdown`).
- Reverse flow handling.
- Operating case overrides support.

## 7. Verification & Benchmarks
- Reference test file: `backend/tests/test_physics_<name>.py`.
- Benchmark calibration point values used in automated test assertions.
```

---

## 📝 Example: `backend/simulation/equipment/calibrated_restriction.md`

Here is an example showing how to write a complete companion documentation file:

```markdown
# Calibrated Restriction (`calibrated_restriction`)

## 1. Overview & Purpose
The Calibrated Restriction component represents fixed hydraulic restrictors, internal clearances, bypasses, and calibration orifices where the flow-versus-pressure drop characteristics are calibrated at a known design operating point $(Q_0, \Delta P_0, T_0)$.

## 2. Governing Standards & Reference Literature
- **ISO 5167-2:2003:** Measurement of fluid flow by means of pressure differential devices inserted in circular cross-section conduits (Orifice plates).
- **Crane Technical Paper No. 410 (TP 410):** Flow of Fluids Through Valves, Fittings, and Pipe (Resistance coefficient method).
- **Idelchik, I.E.:** Handbook of Hydraulic Resistance (4th Edition, Section 4: Resistance to Flow in Throttling Devices).

### Available Calculation Models
1. **Orifice Model (Default):** Square-root scaling with Reynolds-dependent discharge coefficient $C_d(\text{Re})$ and smooth laminar blending.
2. **Quadratic Model:** Fixed turbulent loss coefficient $K$ across all flow rates ($dP \propto \rho Q^2$).
3. **Laminar Model:** Linear viscous loss scaling with dynamic viscosity $\mu$ ($dP \propto \mu Q$).

## 3. Physical & Mathematical Implementation

### 3.1 Base Calibration Factor
At the baseline calibration point $(Q_0, \Delta P_0, \rho_0, \mu_0)$:
$$K_{\text{base}} = \frac{\Delta P_0}{\rho_0 \cdot Q_0^2}$$

### 3.2 Operating Pressure Drop
For the Orifice model:
$$\Delta P = K_{\text{base}} \cdot \rho \cdot Q |Q| \cdot \psi(\text{Re})$$
where $\psi(\text{Re})$ provides smooth transitional blending:
$$\psi(\text{Re}) = \begin{cases} 
1.0 + \frac{C_{\text{lam}}}{\text{Re}} & \text{Re} \le 2000 \\ 
1.0 & \text{Re} \ge 4000 \\ 
(1 - w) \cdot \left(1.0 + \frac{C_{\text{lam}}}{\text{Re}}\right) + w \cdot 1.0 & 2000 < \text{Re} < 4000 
\end{cases}$$
with $w = \frac{\text{Re} - 2000}{2000}$.

### 3.3 Analytical Derivative
$$\frac{\partial \Delta P}{\partial Q} = 2 K_{\text{base}} \rho |Q| \cdot \psi(\text{Re}) + K_{\text{base}} \rho Q^2 \frac{\partial \psi}{\partial Q}$$

## 4. Thermal & Energy Balance
Throttling friction dissipation converts kinetic/pressure energy into fluid thermal enthalpy:
$$dT = \frac{|\Delta P|}{\rho \cdot C_p(T)}$$

## 5. Parameter & Unit Specification Table
| Parameter | UI Unit | Backend Var | SI Unit | Default | Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Baseline Flow | L/min | `flow_base_lmin` | $\text{m}^3/\text{s}$ | `10.0` | $> 0$ | Calibrated flow rate |
| Inlet Pressure | bar | `inlet_pressure_base_bar` | Pa | `3.5` | $> 0$ | Calibrated inlet pressure |
| Outlet Pressure | bar | `outlet_pressure_base_bar` | Pa | `1.0` | $> 0$ | Calibrated outlet pressure |
| Base Temperature | °C | `temp_base_c` | K | `45.0` | $-50 \dots 200$ | Calibration fluid temp |
| Model | - | `restriction_model` | str | `'orifice'` | `orifice, quadratic, laminar` | Calculation formula standard |

## 6. Operating Modes & Model Boundaries
- **Steady-State Solver:** Static algebraic equation ($\Delta t = 0$).
- **Bidirectional Flow:** Handles reverse flow continuously ($Q < 0 \implies \Delta P < 0$).
- **Operating Cases:** Supports node-level parameter overrides per operating scenario.

## 7. Verification & Benchmarks
- **Test File:** `backend/tests/test_physics_calibrated_restriction.py`
- **Benchmark:** Given $Q_0 = 10\text{ L/min}$, $P_{\text{in}} = 3.5\text{ bar}$, $P_{\text{out}} = 1.0\text{ bar}$ at $45^{\circ}\text{C}$, the solver reproduces $\Delta P = 2.5000\text{ bar} \pm 10^{-4}\text{ bar}$ and verified analytical Jacobian derivatives within $1\%$ of central finite differences.
```
