# Check Valve (`check_valve`)

## 1. Overview & Purpose

A check valve (non-return valve) lets fluid pass in one direction only. In the forward direction it opens when the pressure difference reaches its cracking pressure; against reverse flow it closes tight.

Use it on pump discharges (so a standby pump does not run backwards), in parallel supply lines, and anywhere backflow must be prevented.

## 2. Governing Standards & Reference Literature

- **IEC 60534-2-1:** liquid Cv equation for the open valve loss.
- **API 594 / API 6D:** check valves (cracking pressure, non-return function).
- **Fischer, A. (1992):** "A special Newton-type optimization method", *Optimization* 24: the Fischer-Burmeister function for complementarity problems.

## 3. Physical & Mathematical Implementation

### 3.1 Open valve loss (`calculate_open_friction_and_deriv`)

$$\Delta P_{\text{fric}}(Q) = \frac{K_{Cv}\, \rho\, Q|Q|}{\big(\max(10^{-4},\ C_v F_R)\big)^2}, \qquad K_{Cv} = 1.732 \times 10^9$$

with the viscosity correction $F_R$ of the [linear control valve](linear_control_valve.md#33-viscosity-correction-f_r-fluidpropertiesget_valve_fr).

### 3.2 Complementarity condition

A check valve is either closed or open:

| State | Flow | Pressure difference $\Delta p = P_{\text{in}} - P_{\text{out}}$ |
| :--- | :--- | :--- |
| Closed | $Q = 0$ | $\Delta p \le P_{\text{crack}}$ |
| Open | $Q > 0$ | $\Delta p = P_{\text{crack}} + \Delta P_{\text{fric}}(Q)$ |

With $a = Q / 10^{-3}$ and $b = (P_{\text{crack}} + \Delta P_{\text{fric}}(Q) - \Delta p) / 10^5$ this is the complementarity problem $a \ge 0$, $b \ge 0$, $a \cdot b = 0$.

### 3.3 Fischer-Burmeister formulation (`calculate_delta_p` with `p_in_pa`, `p_out_pa`)

$$\phi(a, b) = \sqrt{a^2 + b^2 + \varepsilon^2} - (a + b) = 0, \qquad \varepsilon = 10^{-4}$$

$\phi = 0$ holds exactly when the complementarity condition holds (for $\varepsilon \to 0$). $\phi$ is smooth, so Newton can cross between closed and open without switching equations. $\varepsilon$ smooths the corner: a closed valve with 1 bar across it leaks about $5 \times 10^{-12}$ m³/s.

The solver gives the valve's edge this row (`use_mcp_formulation = True`, see [base_node.md](base_node.md#34-complementarity-mcp-components)): the method returns $\Delta p - 10^5 \phi$, so the edge pressure balance reads $\phi = 0$. $P_{\text{out}}$ is estimated as the downstream node pressure plus the outlet pipe loss. The Jacobian of the row is a numerical central difference of the whole row (audit F1-12).

### 3.4 Smoothed fallback (`calculate_delta_p` without pressures)

Outside the Newton system (property propagation, thermal balance) the valve uses a smooth single-valued curve:

$$\Delta P = P_{\text{crack}} \tanh\!\left(\frac{Q}{q_s}\right) + \frac{K_{Cv}\, \rho\, Q|Q|}{C_{v,b}^2}, \qquad C_{v,b} = s\, C_v F_R + (1 - s) \cdot 10^{-4}, \quad s = \tfrac{1}{2}\big(1 + \tanh(Q / q_s)\big)$$

with $q_s = 10^{-5}$ m³/s (0.6 L/min). Reverse flow sees a closed-valve leak Cv of $10^{-4}$. `calculate_dp_derivative` is the analytical slope of this curve.

### 3.5 Worked example

Cv 10, cracking 0.05 bar, water at 20 °C:

| Forward flow | Friction | $\Delta p$ when open |
| :--- | :--- | :--- |
| 30 L/min | 0.044 bar | 0.094 bar |
| 60 L/min | 0.175 bar | 0.225 bar |
| 120 L/min | 0.695 bar | 0.745 bar |

The cracking pressure stays in the open-state drop at every flow (the spring is not modelled as reaching full lift).

## 4. Thermal & Energy Balance

The pressure drop is throttling loss (audit F1-16), with the drop of the smoothed curve (3.4):

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied to the outlet for $Q \ge 0$ and to the inlet for $Q < 0$. A closed valve passes no flow and adds no heat.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Flow Coefficient (Cv) | Cv | `self.cv` | Cv | 10 | $\ge 0.001$ | Cv of the open valve |
| Cracking ΔP | bar (psi) | `self.cracking_pressure_bar` | bar (→ Pa) | 0.05 | $\ge 0$ | Pressure difference to open |

## 6. Operating Modes & Model Boundaries

- **Steady state:** open or closed equilibrium; no slam, no disc dynamics ($\Delta t = 0$).
- **Solver flags:**
  - `use_mcp_formulation = True`
  - `is_pressure_boundary = False`, `blocks_flow_on_shutdown = False`
- **Inactive:** `active` has no effect.
- **Reverse flow:** blocked (leakage below $10^{-11}$ m³/s at normal pressures).
- **Shut-in sections:** a check valve with $|Q| \le 10^{-7}$ m³/s counts as closed for sections without a pressure boundary. Such a section takes its pressure through the check valve as a leak path, ranked after a stopped pump and before a relief seat (see [base_node.md](base_node.md#6-operating-modes--model-boundaries)).
- **Operating cases:** Cv and cracking pressure can be overridden per case.
- **Not modelled:** partial lift between cracking and full open, reverse flow needed to close the disc, water hammer at closing, the cracking pressure falling off at high flow.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/solver/test_check_valve_mcp.py::test_fischer_burmeister_check_valve` | Cv 10, 0.05 bar, 60 L/min water: with $\Delta p$ = cracking + friction the MCP form returns that drop within 1 Pa; closed with 0.5 bar reverse difference it returns $\Delta p$ within 1 Pa |
| `test_check_valve_mcp.py::test_check_valve_mcp_in_solver` | Source tank 1 m, sink tank 10 m: the valve closes, flow below $10^{-5}$ m³/s |
| `test_check_valve_mcp.py::test_dynamic_topology_reduction` | A valve in a dead end is pruned; zero flow on its pipe |
| `backend/tests/unit/equipment/test_check_valve.py::test_check_valve_forward_and_reverse` | Smoothed curve: forward drop at 60 L/min above the cracking pressure; reverse drop negative |
| `backend/tests/unit/solver/test_stagnant_branches.py::test_dead_leg_behind_a_check_valve_takes_the_header_pressure` | A dead leg behind a closed check valve takes the header pressure |
| `backend/tests/unit/fluids/test_throttling_heat.py::test_f1_16_throttling_heat_magnitude` | Open valve: outlet temperature rise $= \Delta P/(\rho c_p)$ within 2 % |

## Data Fields

Node type: `check_valve`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `cv` | Cv | 10 |
| `cracking_pressure_bar` | bar | 0.05 |
