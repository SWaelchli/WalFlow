# Pipe (edge)

## 1. Overview & Purpose

A pipe connects two components. It computes the friction pressure drop along its length and the temperature rise from viscous dissipation. Each hydraulic edge of a `.wlf` file becomes one `Pipe`; edges of type `SIGNAL` are sensing links and create no pipe.

In the network a pipe is a passive resistance: its pressure drop rises roughly with the square of the flow in turbulent flow and linearly in laminar flow. Where the flow leaves a tank or pressure source into the pipe, the pipe also takes the entry velocity head (section 3.4).

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| PIPE-01 | Principle | Darcy-Weisbach equation | Friction pressure drop | ➖ Principle |
| PIPE-02 | Literature | Churchill (1977), *Chem. Eng.* 84(24), 91–92 | One continuous friction factor for laminar, transition and turbulent flow | ⚪ Unverified |
| PIPE-03 | Literature | Colebrook (1939), *J. Inst. Civ. Eng.* 11(4), 133–156 | Turbulent limit that Churchill reproduces; independent reference in the tests | ⚪ Unverified |
| PIPE-04 | Literature | Crane TP-410, *Flow of Fluids* (edition not fixed; newest confirmed 2018) | Sharp-edged pipe entrance, $K = 0.5$ (A-29, page depends on the edition) | ⚪ Unverified 🚩 |

## 3. Physical & Mathematical Implementation

### 3.1 Geometry

$$A = \frac{\pi D^2}{4}, \qquad v = \frac{Q}{A}, \qquad \mathrm{Re} = \frac{\rho\, |v|\, D}{\mu}$$

$D$ is the internal diameter [m], $L$ the length [m], $\varepsilon$ the absolute roughness [m].

### 3.2 Friction pressure drop (`_friction_dp`)

$$\Delta P_{\text{f}} = f(\mathrm{Re})\, \frac{L}{D}\, \frac{\rho\, v\, |v|}{2}$$

The $v|v|$ form keeps the sign of the flow: reverse flow gives a negative drop of the same size. At $Q = 0$ (or $\mu = 0$) the drop is zero.

### 3.3 Friction factor (`_friction_factor`, Churchill 1977)

The function is `FluidProperties.get_darcy_friction_factor(Re, ε/D)`, shared with the [reducer](reducer.md#34-wall-friction-over-the-fitting).

$$f = 8\left[\left(\frac{8}{\mathrm{Re}}\right)^{12} + \frac{1}{(a + b)^{1.5}}\right]^{1/12}$$

$$a = \left[2.457 \ln\frac{1}{(7/\mathrm{Re})^{0.9} + 0.27\,\varepsilon/D}\right]^{16}, \qquad b = \left(\frac{37530}{\mathrm{Re}}\right)^{16}$$

- Laminar limit: $f \to 64/\mathrm{Re}$. Below $\mathrm{Re} = 10$ the code uses $64/\mathrm{Re}$ directly (Churchill gives the same value there).
- Turbulent limit: Colebrook-White within about 2 %.
- Transition (Re 2000-4000): one smooth curve, so the solver never sees a switch or a blend band. It differs from a "64/Re, then Colebrook" reference by a few percent in this band.

Typical values, 100 m of steel pipe ($\varepsilon$ = 0.045 mm) at 20 °C:

| Fluid | Pipe | Velocity | Flow | Re | $f$ | $\Delta P$ per 100 m |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Water | DN50 (52.5 mm) | 1 m/s | 130 L/min | 52 000 | 0.024 | 0.23 bar |
| Water | DN50 (52.5 mm) | 2 m/s | 260 L/min | 105 000 | 0.022 | 0.83 bar |
| Water | DN100 (102.3 mm) | 2 m/s | 986 L/min | 204 000 | 0.019 | 0.36 bar |
| ISO VG 46 | DN50 (52.5 mm) | 1 m/s | 130 L/min | 390 (laminar) | 0.163 | 1.36 bar |
| ISO VG 46 | DN100 (102.3 mm) | 2 m/s | 986 L/min | 1 530 (laminar) | 0.042 | 0.71 bar |

### 3.4 Entry from a reservoir

Tanks and pressure sources hold fluid at rest. Where the flow leaves one into the pipe, the static pressure drops by the velocity head of the acceleration from rest plus the entrance loss (Crane TP 410, sharp-edged entrance $K = 0.5$, `RESERVOIR_ENTRY_K`):

$$\Delta P_{\text{entry}} = (1 + K)\,\frac{\rho\,v\,|v|}{2}$$

- The term is active only at a reservoir end that the flow leaves: the inlet end for $Q > 0$, the outlet end for $Q < 0$. Value and slope are zero at $Q = 0$, so switching between the two ends is $C^1$-continuous.
- Where the flow enters a reservoir, the kinetic energy is lost in the vessel (exit loss $K = 1$) and the static pressure at the pipe end equals the reservoir pressure. No term is added.
- `HydraulicNetwork` sets the flags `inlet_at_reservoir` and `outlet_at_reservoir` from the topology when the network is built (a node with `is_pressure_boundary = True` at that end).
- The reported pipe pressure drop includes the entry term.

Without it, an expander close to a reservoir would recover static pressure that was never deducted, and a short line source → expander → tank had no steady-state solution. For why reservoir pressures are stagnation pressures, see [pressure_source.md](pressure_source.md#32-stagnation-pressure-not-line-pressure).

### 3.5 Total pressure drop

The static pressure drop between the reported pipe ends (`calculate_delta_p`):

$$\Delta P_{\text{pipe}} = \Delta P_{\text{f}} + \Delta P_{\text{entry}}$$

The network solves total pressures at the nodes ([base_node.md](base_node.md#36-total-pressure-at-nodes-static-pressure-at-ports)). An end on a node is at the node's total pressure minus the velocity head $h = \rho v^2/2$ (`velocity_head`); an end on a reservoir reports the reservoir pressure. The edge row of the network therefore takes the total-pressure drop (`stagnation_delta_p`):

$$\Delta P_{\text{pipe,0}} = \Delta P_{\text{pipe}} + h\,[\text{inlet end on a node}] - h\,[\text{outlet end on a node}]$$

| Ends | $\Delta P_{\text{pipe,0}}$ for $Q > 0$ |
| :--- | :--- |
| node → node | $\Delta P_{\text{f}}$ (the velocity head is the same at both ends) |
| reservoir → node | $\Delta P_{\text{f}} + K h$ (entrance loss; the acceleration from rest is reversible) |
| node → reservoir | $\Delta P_{\text{f}} + h$ (exit loss: the kinetic energy is lost in the vessel) |
| reservoir → reservoir | $\Delta P_{\text{f}} + (1 + K) h$ |

Reverse flow mirrors the table. The derivative is `stagnation_dp_derivative`. The pipe heating (section 4) leaves out the exit loss, which turns into heat in the vessel.

### 3.6 Derivative (`calculate_dp_derivative`)

Friction, with $\mathrm{Re} \propto |Q|$:

$$\frac{\partial \Delta P_{\text{f}}}{\partial Q} = \frac{L}{D}\, \frac{\rho\, |Q|}{2 A^2} \left(2 f + \frac{df}{d \ln \mathrm{Re}}\right)$$

$df/d\ln\mathrm{Re}$ is the exact derivative of the Churchill expression (`FluidProperties.get_darcy_friction_slope`, $-f$ in the laminar range). At $Q = 0$ the slope is the laminar (Hagen-Poiseuille) limit instead of zero, so a dead leg keeps a usable Jacobian:

$$\left.\frac{\partial \Delta P_{\text{f}}}{\partial Q}\right|_{Q=0} = \frac{32\, \mu\, L}{D^2 A}$$

Entry term:

$$\frac{\partial \Delta P_{\text{entry}}}{\partial Q} = (1 + K)\, \frac{\rho\, |Q|}{A^2}$$

Velocity-head ends of the total-pressure drop (`stagnation_dp_derivative`): $\partial h / \partial Q = \rho\, Q / A^2$, with the sign of each end as in section 3.5.

The solver uses this derivative directly and floors it at $10^{-3}$ Pa·s/m³.

## 4. Thermal & Energy Balance

Friction and the entrance loss become heat in the fluid. The acceleration from rest is reversible, so only the $K$ part of the entry term heats:

$$\Delta P_{\text{loss}} = \Delta P_{\text{f}} + \Delta P_{\text{entry}}\, \frac{K}{1 + K}, \qquad \Delta T = \frac{|\Delta P_{\text{loss}}|}{\rho\, c_p(T)}$$

The temperature rise is applied to the downstream end: the outlet for $Q \ge 0$, the inlet for $Q < 0$. Density and viscosity at both ends are then re-evaluated at their temperatures. There is no heat exchange with the surroundings (adiabatic pipe). The friction and entrance losses use the density and viscosity of the upstream end, the one the flow enters by (`upstream_port`, from the flow of the last property pass), so the result does not depend on the direction the pipe is drawn; so does the velocity head at both ends.

For water, $\Delta T \approx 0.024$ K per bar of friction loss.

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Pipe Length | m (ft) | `self.length` | m | 25 | $\ge 0$ | Developed length |
| Pipe Class & Dimensions | DN / schedule, or m | `self.diameter` | m | 0.1 | $> 0$ | Internal diameter (from the pipe class and schedule, or entered) |
| Roughness | mm | `self.roughness` | m | 0.045 mm | $\ge 0$ (0 = smooth) | Absolute wall roughness; only a missing value takes 0.045 mm |

The parser rejects a diameter $\le 0$ and a negative length or roughness (`ModelInputError`).

## 6. Operating Modes & Model Boundaries

- **Steady state:** algebraic relation, no water hammer or line packing ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`). A pipe is not a node; it is the edge term of the pressure balance.
- **Inactive:** a pipe has no `active` switch.
- **Reverse flow:** fully supported; friction and entry terms are odd in $Q$.
- **Operating cases:** pipe data is not overridden per case (case overrides apply to nodes).
- **Not modelled:**
  - elevation change along the pipe (no static head term; static head enters only at tanks, see [tank.md](tank.md));
  - fittings, bends and valves inside the pipe (add them as components);
  - heat loss to the surroundings;
  - compressibility, two-phase flow and cavitation in the pipe.
- **Roughness 0:** a hydraulically smooth wall (smooth-pipe Colebrook limit), e.g. for plastic or drawn tubing.
- The pipe class reference and sizing fields are stored for the inspector only (see Data Fields).

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/fluids/test_pipe_friction.py::test_f1_21_laminar_limit` | $f = 64/\mathrm{Re}$ within 0.1 % at Re 1, 100, 1000 |
| `test_pipe_friction.py::test_f1_21_turbulent_matches_colebrook` | Colebrook-White within 2 % at Re $10^4$ to $10^7$ ($D$ = 50 mm, $\varepsilon$ = 0.045 mm) |
| `test_pipe_friction.py::test_f1_21_transition_is_continuous_and_between_limits` | Re 1500-5450 in steps of 50: no step above 5 %; at Re 3000 within 10 % of Colebrook |
| `test_pipe_friction.py::test_f1_21_derivative_matches_numerical` | Derivative within 0.01 % of a central difference ($\rho$ = 870, $\mu$ = 0.04 Pa·s, $Q$ = $10^{-6}$ to 0.02 m³/s) |
| `test_pipe_friction.py::test_f1_21_zero_flow_derivative_is_laminar_limit` | Slope at $Q = 0$ equals $32 \mu L / (D^2 A)$ |
| `test_pipe_friction.py::test_zero_roughness_is_a_smooth_pipe`, `test_missing_roughness_takes_the_default`, `test_missing_roughness_is_stored_as_the_default` | Roughness 0 at Re $10^5$: smooth Colebrook within 2 % and more than 5 % below 0.045 mm; missing roughness = 0.045 mm, stored as such |
| `test_pipe_friction.py::test_friction_slope_is_the_exact_derivative`, `test_friction_slope_laminar_limit_is_minus_f` | $df/d\ln\mathrm{Re}$ within $10^{-5}$ of a central difference at Re 0.5 to $10^7$ (including both sides of Re 10 and the transition band), $\varepsilon/D$ = 0, 0.0009, 0.01; $-f$ at Re 0, $10^{-9}$, 1 |
| `test_pipe_friction.py::test_pipe_has_no_friction_factor_argument` | `Pipe(..., friction_factor=0.02)` raises `TypeError` |
| `backend/tests/unit/fluids/test_pipe_friction_oil.py::test_pipe_flow_matches_darcy_colebrook` | ISO VG 46, tanks 12 m and 2 m level, 100 m × 50 mm: gravity flow matches Darcy-Weisbach / Colebrook with entry loss within 1 % at 20 °C, 10 % at 60 °C (transition band) |
| `backend/tests/unit/equipment/test_pipe_reservoir_entry.py` | 0.5 bar from a tank or pressure source through 10 m DN50 to a tank: flow matches entry + friction within 1 %; entry term only at the end the flow leaves; only the $K$ part heats the fluid |
| `test_pipe_reservoir_entry.py::test_stagnation_drop_adds_entry_and_exit_loss_to_friction` | The four end combinations in both flow directions: total drop = friction (+ $K h$ leaving, + $h$ entering a reservoir); derivative matches a central difference |
| `test_pipe_reservoir_entry.py::test_expander_between_reservoirs_with_short_pipes` | Reservoir → 0.1-5 m DN50 → 2"×3" expander → DN80 → tank solves and matches an independent loss sum within 1 % |
| `backend/tests/unit/fluids/test_reverse_flow.py` | Reverse flow: magnitude within 2 % of the forward reference; temperature carried from the supplying end |
| `backend/tests/scenarios/test_literature_networks.py` | Jeppson (1974) 7-pipe network, Ch. V problems 2 and 3, p. 48 (`Example_Jeppson_7Pipe_Network.wlf`): every pipe flow within 0.01 cfs and friction loss within 0.15 ft of the published values; problem 2 junction heads within 0.2 ft and pressures within 0.1 psi. Largest deviations about 0.005 cfs, 0.07 ft, 0.10 ft and 0.05 psi, mostly from the reservoir entrance loss Jeppson neglects. Jeppson (1974) 48-pipe network, Ch. VI problem 3, pp. 70–71 (`Example_Jeppson_48Pipe_Network.wlf`): every pipe flow within 0.03 cfs and friction loss within 1 % (0.05 ft floor); largest deviations 0.018 cfs and 0.6 % |

## Data Fields

Pipe (edge) data. Field names follow the naming rule in [base_node.md](base_node.md).

| Field | Unit in file | Default |
|---|---|---|
| `label` | text | `Pipe <id>` |
| `type` | text (`PIPE` / `SIGNAL`) | PIPE |
| `length_m` | m | 25 |
| `diameter_m` | m | 0.1 |
| `roughness_mm` | mm | 0.045 |

The pipe class reference and sizing (`pipe_class_id`, `pipe_class_code`, `schedule_standard_code`, `standardDn`, `standardSch`, `outer_diameter_mm`, `wall_thickness_mm`) are stored for the inspector only; the solver uses `diameter_m` and `roughness_mm`.
