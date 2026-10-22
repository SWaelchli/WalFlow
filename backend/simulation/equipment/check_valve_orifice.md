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

### 3.2 Seat (`open_seat_dp`, shared with the check valve)

Above the cracking pressure the seat behaves like the plain check valve: Cv with the IEC 60534 viscosity factor $F_R(\mathrm{Re}_v)$, $\mathrm{Re}_v$ over the nominal seat bore $d_v = \max(2\ \text{mm},\ 0.01\sqrt{C_v})$:

$$\Delta P_{\text{seat}}(q_s) = \frac{K_{Cv}\, \rho\, q_s|q_s|}{(C_v F_R)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

### 3.3 Paths (`calculate_delta_p`)

- **Reverse flow, or forward flow with $\Delta P_{\text{ori}}(Q) \le P_{\text{crack}}$:** the seat is shut, all flow passes the orifice, $\Delta P = \Delta P_{\text{ori}}(Q)$.
- **Forward flow above cracking:** seat and orifice in parallel at **one** valve drop (D-09):

$$Q = q_o + q_s, \qquad \Delta P = \Delta P_{\text{ori}}(q_o) = P_{\text{crack}} + \Delta P_{\text{seat}}(q_s)$$

The orifice share $q_o \in (0, Q)$ is the single root of $\Delta P_{\text{ori}}(q_o) - P_{\text{crack}} - \Delta P_{\text{seat}}(Q - q_o)$ (Brent, tolerance $10^{-12}$ of the flow); the orifice drop rises and the seat drop falls with $q_o$. The drop is continuous everywhere and monotonic in $Q$; its slope has a kink where the seat cracks (the seat takes the extra flow at almost no extra drop), as a real check valve does.

### 3.4 Worked example

Cv 10, cracking 0.05 bar, 5 mm orifice in DN50 (52.5 mm), water at 20 °C. The orifice alone reaches the cracking pressure at about 2.25 L/min:

| Flow | $\Delta P$ | Path |
| :--- | :--- | :--- |
| −20 L/min | −3.96 bar | orifice (reverse) |
| 1 L/min | 0.010 bar | orifice |
| 2.5 L/min | 0.050 bar | seat just open |
| 5 L/min | 0.050 bar | seat + orifice |
| 10 L/min | 0.053 bar | seat + orifice |
| 60 L/min | 0.200 bar | seat + orifice |

### 3.5 Derivative

The class has no `calculate_dp_derivative` of its own; the solver differentiates the outlet pressure numerically (see [base_node.md](base_node.md#33-jacobian)).

## 4. Thermal & Energy Balance

The pressure drop is throttling loss (audit F1-16):

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Flow Coefficient (Cv) | Cv | `self.cv` | Cv | 10 | $\ge 0.001$ | Cv of the open seat |
| Cracking ΔP | bar (psi) | `self.cracking_pressure_bar` | bar (→ Pa) | 0.05 | $\ge 0$ | Pressure difference to open the seat |
| Orifice Diameter | mm (in) | `self.orifice_diameter` | m | 10 mm | $\ge 0.1$ mm, $< D$ | Bypass bore |
| Pipe bore | from the connected pipe | `self.pipe_diameter` | m | 0.1 m | $\ge 1$ mm | Line bore around the orifice |

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic relation ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `is_flow_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect.
- **Reverse flow:** passes through the orifice; $\Delta P$ is negative.
- **Shut-in sections:** the orifice always connects both sides, so it is no leak path in the stagnant-pressure ranking: at zero flow both sides share one pressure (D-09).
- **Operating cases:** all fields can be overridden per case.
- **Not modelled:** partial lift (the seat is a fixed Cv once cracked), seat leakage in reverse flow.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_check_valve_orifice.py::test_check_valve_orifice_physics` | Cv 10, 0.05 bar, 10 mm orifice in 100 mm: positive drop at 6 L/min, negative drop at −6 L/min, at least 0.05 bar at 60 L/min |
| `test_check_valve_orifice.py::test_graph_parser_check_valve_orifice` | Parser reads Cv 12, cracking 0.08 bar, orifice 15 mm |
| `backend/tests/unit/fluids/test_throttling_heat.py::test_f1_16_throttling_heat_magnitude` | Outlet temperature rise $= \Delta P/(\rho c_p)$ within 2 % |
| `test_check_valve_orifice.py::test_d09_flow_splits_between_seat_and_orifice_at_one_valve_drop` | Water and oil, cracking 0 / 0.05 / 0.3 bar, −20 to 200 L/min: inverted orifice flow plus plain check valve seat flow at the returned drop equals $Q$ ($10^{-8}$) |
| `test_check_valve_orifice.py::test_d09_seat_has_the_viscosity_correction` | Open seat in viscous oil needs more drop than at water viscosity |
| `test_check_valve_orifice.py::test_d09_drop_is_continuous_and_monotonic_through_zero_and_cracking` | Zero drop at zero flow, strictly rising, no jump at $Q = 0$ or at cracking |
| `test_check_valve_orifice.py::test_d09_non_finite_state_does_not_raise` | NaN flow, density or viscosity passes through (NaN or the orifice drop), no exception |
| `test_check_valve_orifice.py::test_d09_tiny_forward_flow_with_zero_cracking_does_not_raise` | Denormal forward flow with zero cracking pressure returns a drop between 0 and the orifice drop |
| `backend/tests/unit/solver/test_stagnant_branches.py::test_d09_section_behind_a_check_valve_with_orifice_takes_the_header_pressure` | Section between a stopped PD pump and the valve sits at header pressure (1 Pa), both solver methods |

## Data Fields

Node type: `check_valve_orifice`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `cv` | Cv | 10 |
| `cracking_pressure_bar` | bar | 0.05 |
| `pipe_diameter_m` | m | 0.1 |
| `orifice_diameter_m` | m | 0.01 |
