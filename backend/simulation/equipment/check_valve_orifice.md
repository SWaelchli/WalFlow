# Check Valve with Bypass Orifice (`check_valve_orifice`)

## 1. Overview & Purpose

A check valve with a drilled bypass orifice in its disc or body. The orifice always passes flow, in both directions. In the forward direction the main seat opens once the orifice alone would need more than the cracking pressure; the seat and the orifice then carry the flow in parallel.

Use it for a check valve with a warm-up or pressure-equalising hole, a discharge check valve that lets a standby pump drain or fill slowly, or a non-return valve with a deliberate leak.

Unlike the plain [check valve](check_valve.md), this component is an ordinary single-valued resistance, not a complementarity (MCP) model.

## 2. Governing Standards & Reference Literature

- **IEC 60534-2-1:** liquid Cv equation for the open seat.
- **ISO 5167-1 / ISO 5167-2:** orifice equation and permanent pressure loss ratio $(1 - \beta^2)$ (classic form) for the bypass, as for the [calibrated restriction](calibrated_restriction.md#32-pressure-drop-calculate_delta_p).
- **API 594:** check valves (cracking pressure).

## 3. Physical & Mathematical Implementation

### 3.1 Orifice path (`_calculate_orifice_dp`)

With $D$ the connected pipe bore, $d$ the orifice, $\beta = \min(0.99,\ d/D)$:

$$\Delta P_{\text{ori}} = \frac{\rho\, v_1|v_1|}{2} \cdot \frac{1 - \beta^4}{C_d^2\, \beta^4} \cdot (1 - \beta^2), \qquad C_d = 0.60 \tanh\!\left(\frac{0.2\sqrt{\mathrm{Re}_o}}{0.60}\right)$$

$v_1$ is the pipe velocity, $\mathrm{Re}_o$ the orifice Reynolds number. The parser sets $D$ from the connected pipe (upstream first), overriding `pipe_diameter_m`.

### 3.2 Seat open: parallel paths

Conductances in the form $Q = k\sqrt{\Delta P}$:

$$k_v = \frac{C_v}{\sqrt{K_{Cv}\, \rho}}, \qquad k_o = \frac{|Q|}{\sqrt{\max(1,\ |\Delta P_{\text{ori}}(Q)|)}}, \qquad \Delta P_{\text{par}} = P_{\text{crack}} + \left(\frac{Q}{k_v + k_o}\right)^2$$

$K_{Cv} = 1.732 \times 10^9$. $k_o$ is the orifice conductance evaluated at the total flow. The seat has no viscosity correction.

### 3.3 Blend (`calculate_delta_p`)

$$s = \begin{cases} \tfrac{1}{2}\left(1 + \tanh\dfrac{\Delta P_{\text{ori}} - P_{\text{crack}}}{1000\ \text{Pa}}\right) & Q > 0 \\ 0 & Q \le 0 \end{cases}, \qquad \Delta P = (1 - s)\,\Delta P_{\text{ori}} + s\,\Delta P_{\text{par}}$$

- **Reverse flow and low forward flow:** all flow through the orifice.
- **Forward flow above cracking:** seat and orifice in parallel.
- The transition is centred where the orifice drop equals the cracking pressure, with a width of about 10 mbar.

### 3.4 Worked example

Cv 10, cracking 0.05 bar, 5 mm orifice in DN50 (52.5 mm), water at 20 °C:

| Flow | $\Delta P$ | Path |
| :--- | :--- | :--- |
| −20 L/min | −3.96 bar | orifice (reverse) |
| 1 L/min | 0.010 bar | orifice |
| 5 L/min | 0.051 bar | transition |
| 10 L/min | 0.054 bar | seat + orifice |
| 60 L/min | 0.201 bar | seat + orifice |

### 3.5 Derivative

The class has no `calculate_dp_derivative` of its own; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)). The blend is smooth for $Q > 0$; at $Q = 0$ the slope of $s$ changes (with a small cracking pressure, $s$ jumps from 0 to about 0.5 while both drops are near zero).

## 4. Thermal & Energy Balance

The pressure drop is throttling loss (audit F1-16):

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Flow Coefficient (Cv) | Cv | `self.cv` | Cv | 10 | $\ge 0.001$ | Cv of the open seat |
| Cracking Pressure | bar (psi) | `self.cracking_pressure_bar` | bar (→ Pa) | 0.05 | $\ge 0$ | Pressure difference to open the seat |
| Orifice Diameter | mm (in) | `self.orifice_diameter` | m | 10 mm | $\ge 0.1$ mm, $< D$ | Bypass bore |
| Pipe bore | from the connected pipe | `self.pipe_diameter` | m | 0.1 m | $\ge 1$ mm | Line bore around the orifice |

The inspector labels the cracking pressure in barg/psig; the value is a pressure difference.

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic relation ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `is_flow_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect.
- **Reverse flow:** passes through the orifice; $\Delta P$ is negative.
- **Shut-in sections:** with $|Q| \le 10^{-7}$ m³/s it is ranked as a check-valve leak path like the plain check valve, although its orifice connects both sides.
- **Operating cases:** all fields can be overridden per case.
- **Not modelled:** the orifice seeing the full valve $\Delta p$ when the seat is open (it is combined as a conductance), viscosity correction of the seat, partial lift.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_check_valve_orifice.py::test_check_valve_orifice_physics` | Cv 10, 0.05 bar, 10 mm orifice in 100 mm: positive drop at 6 L/min, negative drop at −6 L/min, at least 0.05 bar at 60 L/min |
| `test_check_valve_orifice.py::test_graph_parser_check_valve_orifice` | Parser reads Cv 12, cracking 0.08 bar, orifice 15 mm |
| `backend/tests/unit/fluids/test_throttling_heat.py::test_f1_16_throttling_heat_magnitude` | Outlet temperature rise $= \Delta P/(\rho c_p)$ within 2 % |

No dedicated benchmark of the parallel-path drop against an independent calculation.

## Data Fields

Node type: `check_valve_orifice`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `cv` | Cv | 10 |
| `cracking_pressure_bar` | bar | 0.05 |
| `pipe_diameter_m` | m | 0.1 |
| `orifice_diameter_m` | m | 0.01 |
