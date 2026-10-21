# Equipment Findings (temporary working list)

Found while writing the equipment documentation (ROADMAP "Detailed Equipment Documentation", done 2026-10-21). Nothing here is fixed yet.

**Code reference:** all file paths and line numbers below refer to commit `3790728` (`3790728882f8a0f1519d167a8c574f31faf705a6`, 2026-10-20, "fix(sim): defined pressure in stagnant branches"). No code was changed between that commit and the findings. Lines move as fixes land, so view a reference at that commit with `git show 3790728:<path>` when it no longer matches, and search for the quoted function name rather than relying on the line number. Delete this file once every finding is fixed or rejected; move anything deferred to `ROADMAP.md`.

How to work through it:

- Fix test-first (`TESTING.md` rule 3): write the failing test next to the component's tests, then fix. Mark the file with `pytestmark = pytest.mark.audit("D-xx")`.
- After a fix that changes physics, check `tests/regression/test_golden_examples.py` and regenerate the golden file only for an intended change.
- Update the component's `.md` in `backend/simulation/equipment/`: several documents describe the current (wrong) behaviour as a model boundary and must be corrected with the fix.
- Run `cd backend && python -m pytest` before finishing.

Status: `open` / `fixed` / `rejected`. "Confirmed" means it was reproduced by running the code; "code reading" means it was found by reading only.

## Overview

| ID | Component | Finding | Severity | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| D-01 | Splitter | Mixed temperature overwritten by the inlet temperature | High (wrong result) | Confirmed | fixed |
| D-02 | Heat exchanger | Thermal calculation ignores the flow direction | High (wrong result) | Confirmed | fixed |
| D-03 | Heat exchanger | Rated ΔP only reproduced for water; UA rated with the operating $c_p$ | Medium | Confirmed | fixed |
| D-04 | 3-way TCV | Mass-weighted mixing instead of the enthalpy balance | Medium | Confirmed | open |
| D-05 | Valves (all Cv devices) | Viscosity factor $F_R$ is not IEC 60534-2-1; no laminar valve flow | Medium | Code reading + numbers | open |
| D-06 | Pipe | Roughness 0 replaced by 0.045 mm | Medium | Code reading | open |
| D-07 | Reducer vs pipe | Two different friction factor functions | Low | Code reading | open |
| D-08 | Calibrated restriction | Calibrates before the parser sets bore and fluid; recalibrates every call; zero inputs replaced | Low | Confirmed | open |
| D-09 | Check valve with orifice | Ranked as a closed check valve in shut-in sections; model simplifications | Low (to verify) | Code reading | open |
| D-10 | Pumps | Efficiency floors differ between power and heat; braking PD pump heat | Low | Code reading | open |
| D-11 | Linear control valve | Jump between 0 % and 0.1 % opening | Low | Code reading | open |
| D-12 | Check valves (UI) | Cracking pressure labelled barg / psig but is a difference | Low (UI) | Code reading | open |
| D-13 | Solver / all components | Analytical `calculate_dp_derivative` unused except pipes and pumps | Info | Code reading | open |
| D-14 | Base node | `is_flow_boundary` is a dead flag | Cleanup | Code reading | open |
| D-15 | Pipe | `friction_factor` constructor argument unused | Cleanup | Code reading | open |
| D-16 | Tank | Default level 2 m in the UI, 1 m in the parser | Cleanup | Code reading | open |
| D-17 | PSV | `action_mode = rupture_disc` duplicates the rupture disc component | Cleanup / decision | Code reading | open |

---

## D-01 Splitter overwrites the mixed temperature

**Where:** `backend/simulation/equipment/splitter.py:16-29` (`Splitter.calculate`).

**What happens:** during property propagation the solver first calls `HydraulicNode.calculate_temperature()`, which correctly computes the enthalpy mix of all ports with inward flow and writes it to the ports with outward flow. Then `Splitter.calculate()` copies the **inlet** port's pressure, temperature, density and viscosity to **both outlets**, overwriting that mix.

This is only wrong when the inlet **and** one outlet both feed the splitter (reverse flow on that outlet) and only the other outlet leaves it. Forward splitting and full reverse flow (inlet leaves) are correct, which is why `test_reverse_flow_through_a_splitter_keeps_the_supplying_temperature` passes.

**Reproduction** (run from `backend/`):

```python
import sys; sys.path[:0] = ['.', 'tests/helpers']
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.splitter import Splitter
from physics_refs import solve
K = 273.15
a = Tank('A', fluid_level=10.0, temperature=20 + K)   # on the inlet
b = Tank('B', fluid_level=10.0, temperature=60 + K)   # on outlet-1, feeds backwards
s = Tank('S', fluid_level=0.0, temperature=20 + K)    # on outlet-0, the only outflow
spl = Splitter('spl', 2)
pa, pb, ps = Pipe('pa', 10, 0.05), Pipe('pb', 10, 0.05), Pipe('ps', 10, 0.05)
e = [{'source': 'a', 'target': 'x', 'pipe': pa},
     {'source': 'x', 'target': 'b', 'source_port': 'outlet-1', 'pipe': pb},
     {'source': 'x', 'target': 's', 'source_port': 'outlet-0', 'pipe': ps}]
solve({'a': a, 'b': b, 'x': spl, 's': s}, e)
print(spl.outlets[0].temperature - K)   # 20.0 °C
```

Flows: inlet +352 L/min, outlet-1 −351 L/min (inflow), outlet-0 +703 L/min. **Expected** outlet-0 ≈ 40 °C (enthalpy mix of two equal streams at 20 °C and 60 °C). **Actual** 20.0 °C. Energy is not conserved.

**Fix direction:** in `Splitter.calculate()` copy only pressure (and, if needed, density/viscosity at the port's own temperature), not the temperature; leave temperatures to `calculate_temperature`. Mirror how `Mixer.calculate()` does it (mix first, then evaluate properties at the mixed temperature). Check `MeasurePoint.calculate()`, which has the same copy pattern (harmless there with one inlet and one outlet, but keep them consistent).

**Test:** `tests/unit/solver/test_port_transport.py` next to the existing splitter case: the network above, outlet-0 temperature equals an independent enthalpy balance of the two inflows within 0.1 K.

**Docs to update:** `splitter.md` section 4 (remove the "Limitation" paragraph).

---

## D-02 Heat exchanger ignores the flow direction thermally

**Where:** `backend/simulation/equipment/heat_exchanger.py:143-189` (`calculate_temperature`).

**What happens:** the method always treats the **inlet port** as the entering stream (`ti = inlet.temperature`, `m_dot = |inlet.flow_rate| * inlet.density`) and always writes the result to the **outlet port**. In reverse flow the fluid enters at the outlet. The inlet port then holds a stale value (the property propagation only sets an inlet port's temperature for $Q \ge 0$), so the duty is computed from a wrong temperature and the cooled fluid is written to the wrong side.

**Reproduction** (run from `backend/`):

```python
import sys; sys.path[:0] = ['.', 'tests/helpers']
from physics_refs import solve
from simulation.equipment.heat_exchanger import HeatExchanger as H
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
for rev in (False, True):
    hx = H('hx', rated_cooling_kw=300, rated_flow_lmin=500, design_inlet_temp_c=50, medium_temp_c=10)
    hi = Tank('hi', fluid_level=10, temperature=323.15); lo = Tank('lo', fluid_level=0, temperature=323.15)
    if rev:
        e = [{'source': 'lo', 'target': 'x', 'pipe': Pipe('a', 1, 0.1)}, {'source': 'x', 'target': 'hi', 'pipe': Pipe('b', 1, 0.1)}]
    else:
        e = [{'source': 'hi', 'target': 'x', 'pipe': Pipe('a', 1, 0.1)}, {'source': 'x', 'target': 'lo', 'pipe': Pipe('b', 1, 0.1)}]
    solve({'hi': hi, 'lo': lo, 'x': hx}, e)
    print(rev, hx.inlets[0].flow_rate * 6e4, hx.inlets[0].temperature - 273.15, hx.outlets[0].temperature - 273.15, hx.actual_duty_kw)
```

| Case | Flow | "Inlet" T | "Outlet" T | Duty |
| :--- | :--- | :--- | :--- | :--- |
| Forward | +693 L/min | 50.0 °C | 41.8 °C | 392.5 kW |
| Reverse (same hydraulics mirrored) | −690 L/min | 20.0 °C (stale) | 18.0 °C | 97.8 kW |

**Expected** in reverse: fluid enters the outlet port at 50 °C, leaves the inlet port at about 41.8 °C, duty about 390 kW.

**Fix direction:** pick the entering and leaving port by the sign of the flow, as `Pipe.calculate`, `Reducer.calculate` and the valves do (`if inlet.flow_rate >= 0: ... else: ...`). Use the entering port's temperature and density for $\dot m c_p$.

**Test:** new `tests/unit/equipment/test_heat_exchanger_flow_direction.py`: the forward and reverse networks above give the same duty within 1 % and the leaving temperature on the correct port.

**Docs to update:** `heat_exchanger.md` section 6 (Reverse flow bullet).

---

## D-03 Heat exchanger rated ΔP not reproduced in the system fluid; UA rated with operating $c_p$

**Where:** `backend/simulation/equipment/heat_exchanger.py:113-141` (`calculate_delta_p`, `calculate_dp_derivative`), `:76-110` (`_calculate_ua_rated`).

**What happens, pressure drop:**

$$\Delta P = k\, Q|Q|\, \frac{\rho}{1000}\, f(\mathrm{Re}_{hx}), \qquad k = \Delta P_r / Q_r^2$$

The rated drop is therefore only reproduced for a fluid of 1000 kg/m³ in turbulent channel flow. The viscosity factor $f$ (filter function, $1 + 100/\mathrm{Re}$ below Re 2000) is not normalised at the rating point, so an oil at its reference temperature already gets extra drop. The filter had the same problem and was fixed in audit F1-19 (calibrate $K$ in the reference fluid at the reference temperature); the heat exchanger was not.

| Fluid at rated flow (500 L/min, 0.5 bar rated) | $\Delta P$ |
| :--- | :--- |
| Water, 20 °C | 0.499 bar |
| ISO VG 46, 40 °C | 0.529 bar (+6 %) |
| ISO VG 46, 20 °C | 0.728 bar |

Reproduction: `HeatExchanger('h').calculate_delta_p(500/6e4, rho, mu)` with $\rho$, $\mu$ from `FluidProperties` at those temperatures.

**What happens, UA:** `_calculate_ua_rated(cp)` is called from `calculate_temperature` with $c_p$ at the **current inlet** temperature, while $\dot m_r$ uses the density at the **design inlet** temperature. The rated UA (a property of the exchanger) therefore drifts with the operating temperature.

**Fix direction:**
- Pressure drop: calibrate like `Filter.get_resistance_k`: $k = \Delta P_r / (\rho_{\text{ref}} Q_r^2 f(\mathrm{Re}_{\text{ref}}))$ and $\Delta P = k \rho Q|Q| f(\mathrm{Re})$, with the reference state = system fluid at the design inlet temperature (or 20 °C aqueous / 40 °C oils as for the filter; decide and document). Consider an optional reference viscosity like the filter.
- UA: evaluate $c_p$ (and $\rho$) at the design inlet temperature inside `_calculate_ua_rated`; cache it, since the rating does not change during a run.

**Tests:** extend `tests/unit/equipment/test_heat_exchanger_default.py`: rated flow in ISO VG 46 at the reference temperature reproduces the rated drop within 0.1 %; `test_thermal.py::test_cooler_sizing_modes` must still give 40 °C at the design point.

**Golden examples:** likely to change (every heat exchanger in oil). Review and regenerate deliberately.

**Docs to update:** `heat_exchanger.md` sections 3.1, 3.4 and 6.

---

## D-04 3-way TCV mixes by mass-weighted temperature

**Where:** `backend/simulation/equipment/three_way_tcv.py:72-98` (`calculate`), line 86 `mix_temp = sum(m * t ...) / m_tot`.

**What happens:** the outlet temperature is the mass-weighted mean temperature (constant $c_p$) plus the throttling heat. The mixer and the default node mixing use the enthalpy balance with $c_p(T)$ (audit F1-42, `HydraulicNode.calculate_temperature`). The TCV controller then holds its setpoint on this mean, so the controlled temperature is not the energy-balanced one.

Enthalpy mix minus mass-weighted mean, equal mass flows at 80 °C and 20 °C:

| Fluid | Difference |
| :--- | :--- |
| Water | +0.02 K |
| Glycol 50 % | +0.66 K |
| ISO VG 46 | +0.87 K |

Reproduction: `FluidProperties.get_temperature_from_enthalpy(fluid, (h(353.15) + h(293.15)) / 2, 323.15)` versus 50 °C.

**Fix direction:** compute the mix with $\sum \dot m_k h(T_k)$ and `get_temperature_from_enthalpy`, as in `HydraulicNode.calculate_temperature`; add the throttling heat as enthalpy ($\sum Q \Delta P_{\text{path}}$ divided by $\sum \dot m$) before inverting. Simplest: reuse the base mixing for the inward streams, then add the heat.

**Tests:** `tests/unit/equipment/test_three_way_tcv.py` or a new file: ISO VG 46 80/20 °C at a fixed mix ratio, outlet temperature matches an independent enthalpy balance within 0.05 K. The 35 loop scenarios in `tests/scenarios/test_tcv_loop_convergence.py` must still converge.

**Golden examples:** TCV examples in oil will shift by up to about 0.9 K in mix ratio terms.

**Docs to update:** `three_way_tcv.md` section 4.

---

## D-05 Valve viscosity factor $F_R$ is not IEC 60534-2-1

**Where:** `backend/simulation/fluid_utils.py:334-342` (`get_valve_fr`). Used by `linear_control_valve.py`, `linear_regulator.py`, `remote_control_valve.py`, `three_way_tcv.py`, `check_valve.py`, `pressure_safety_valve.py`, `rupture_disc.py` (full bore).

**What happens:**

$$F_R = \min\!\left(1,\ \max\!\left(0.4,\ \frac{\mathrm{Re}_v + 200}{\mathrm{Re}_v + 400}\right)\right), \qquad d_v = \max(0.002,\ 0.01\sqrt{C_v})\ \text{m}, \qquad \mathrm{Re}_v = \frac{\rho |Q| d_v}{\mu\, \pi d_v^2/4}$$

- The docstring calls it the IEC 60534-2-1 factor; it is an ad-hoc smooth curve.
- $F_R$ is still 0.98 at Re 10 000 (IEC: 1.0 there) and never goes below 0.5 (the 0.4 clamp is never reached). The pressure drop stays $\propto Q^2$ at every Reynolds number, at most 4× the turbulent value. Real laminar valve flow ($\Delta P \propto \mu Q$, $F_R \ll 0.5$) is never reached, so valve drops for viscous oils at low flow are underestimated.
- The trim diameter $d_v = 0.01\sqrt{C_v}$ m is an assumption (Cv 1 → 10 mm), not the IEC $F_d$ / $N_{26}$ method.

Example, Cv 10 valve at 100 L/min, 40 °C: water Re 102 000 → $F_R$ 0.998; ISO VG 46 at 100 % open Re 1 460 → $F_R$ 0.892.

**Fix direction:** implement the IEC 60534-2-1 liquid viscosity correction: valve Reynolds number $\mathrm{Re}_v = \frac{N_4 F_d Q}{\nu \sqrt{C_v F_L}}\left(\frac{F_L^2 C_v^2}{N_2 d^4} + 1\right)^{1/4}$ and $F_R$ from the laminar / transitional expressions, with a smooth blend so Newton stays stable. Needs defaults for $F_d$ and $F_L$ per valve type (decide: globe 0.46 / 0.9, or user inputs). This is a physics change across many components; plan it as its own task.

**Tests:** a new `tests/unit/fluids/test_valve_viscosity.py`: $F_R = 1$ for turbulent flow, laminar limit $\Delta P \propto \mu Q$, continuity across the blend, and an IEC worked example.

**Golden examples:** every valve in a viscous fluid changes.

**Docs to update:** `linear_control_valve.md` section 3.3 (and the "Not modelled: laminar valve flow" bullets in the valve documents).

---

## D-06 Pipe roughness 0 is replaced by 0.045 mm

**Where:** `backend/simulation/equipment/pipe.py:32`

```python
eps = self.roughness if (self.roughness is not None and self.roughness > 0) else 0.000045
```

**What happens:** the parser accepts `roughness_mm = 0` (it only rejects negative values), but the pipe silently uses 0.045 mm, so a hydraulically smooth pipe (plastic, drawn tubing) cannot be modelled. The reducer does it right: `reducer.py` "0 is a valid (hydraulically smooth) roughness; only a missing value takes the default" (`test_zero_reducer_roughness_is_kept_as_smooth`).

**Fix direction:** `eps = 0.000045 if self.roughness is None else self.roughness`. Churchill handles $\varepsilon/D = 0$.

**Test:** `tests/unit/fluids/test_pipe_friction.py`: a pipe with roughness 0 matches the smooth-pipe Colebrook value within 2 % at Re $10^5$, and differs from 0.045 mm.

**Docs to update:** `pipe.md` sections 5 and 6 ("Roughness 0" bullet).

---

## D-07 Reducer and pipe use different friction factors

**Where:** `backend/simulation/equipment/reducer.py:96-115` (`_get_friction_factor`) versus `pipe.py:44-52` (`_friction_factor`, Churchill 1977).

**What happens:** the reducer uses 64 for Re < 1 (constant), 64/Re up to 2000, Swamee-Jain above 4000, and a **linear** blend between: $C^0$ but not $C^1$ at Re 2000 and 4000. The pipe was changed to Churchill in audit F1-21 to remove exactly this blend band. The effect is small (the fitting is short) but the code base has two friction functions.

**Fix direction:** move Churchill into `FluidProperties` (or a small `friction.py`) and use it from both; drop the reducer's own function. The reducer derivative should then use the same $2f + df/d\ln\mathrm{Re}$ form as the pipe.

**Test:** `tests/unit/equipment/test_reducer.py`: the reducer friction factor equals the pipe's at the same Re and $\varepsilon/D$; existing reducer tests must still pass.

**Docs to update:** `reducer.md` section 3.4.

---

## D-08 Calibrated restriction: calibration order, repeated recalibration, zero inputs

**Where:** `backend/simulation/equipment/calibrated_restriction.py:23-37` (constructor), `:47` (`_calibrate`), `:198` (`calculate` calls `_calibrate()`), parser `graph_parser.py:218-236` (sets `pipe_diameter` after construction) and `:484` (sets `global_settings` after construction).

**What happens:**
1. `_calibrate()` runs in the constructor, before the parser sets the connected pipe bore and the global settings. The orifice model is therefore first calibrated with DN50 and, for `fluid_type = system`, with water. The first Newton solve uses that calibration.
2. `calculate()` (called in every property propagation pass) recalibrates, with a 100-step bisection each time, which corrects the bore and fluid. The final result is right, but costs an extra outer iteration and repeated bisections.
3. `float(x or default)` in the constructor turns an entered 0 into the default (flow 0 → 10 L/min, temperature 0 °C → 45 °C, outlet pressure 0 → 1.0 bar).

**Reproduction** (run from `backend/`):

```python
from simulation.equipment.calibrated_restriction import CalibratedRestriction as C
from simulation.schemas import GlobalSettings
from simulation.fluid_utils import FluidProperties as F
n = C('r', 10.0, 3.5, 1.0, 45.0, 'orifice')
n.global_settings = GlobalSettings(fluid_type='iso_vg_46'); n.pipe_diameter = 0.0266   # as the parser does
t = 318.15; rho, mu = F.get_density('iso_vg_46', t), F.get_viscosity('iso_vg_46', t)
print(n.calculate_delta_p(10 / 6e4, rho, mu) / 1e5)   # 2.126 bar (should be 2.5)
n._calibrate(); print(n.calculate_delta_p(10 / 6e4, rho, mu) / 1e5)   # 2.500 bar
```

A full network solve (pressure source 3.5 bar(a) → restriction → 1.0 bar(a)) gives 9.999 L/min at 2.499 bar after 2 outer iterations, so the reported result is correct.

**Fix direction:** calibrate lazily: mark the calibration dirty when `pipe_diameter`, `global_settings` or an input changes (or have the parser call `_calibrate()` once after setting both), and drop the call from `calculate()`. Replace `float(x or default)` with `default if x is None else float(x)` and let the parser reject invalid values (flow ≤ 0, inlet ≤ outlet) with a `ModelInputError`.

**Tests:** `tests/unit/equipment/test_calibrated_restriction.py`: a parsed node (via `GraphParser`) reproduces the calibration drop in ISO VG 46 with a DN25 pipe at the first `calculate_delta_p` call; a zero or inverted calibration point is an input error.

**Docs to update:** `calibrated_restriction.md` sections 5 and 6 ("Recalibration" bullet, zero-input sentence).

---

## D-09 Check valve with orifice: shut-in ranking and model simplifications (to verify)

**Where:** `backend/simulation/solver.py:1596` (`_assign_stagnant_pressures`), `CHECK_VALVE_TYPES = ('check_valve', 'check_valve_orifice')` at `:1792`; `backend/simulation/equipment/check_valve_orifice.py:44-72`.

**What happens:**
1. In a section without a pressure boundary, a check valve with $|Q| \le 10^{-7}$ m³/s is treated as a closed leak path that separates its two sides. The check valve with orifice is in the same list, although its orifice always connects both sides. With no flow there is no pressure difference across the orifice, so both sides should share one pressure. Not reproduced; check whether a shut-in section behind a check valve with orifice can get a pressure different from the other side.
2. The seat conductance $k_v = C_v / \sqrt{K_{Cv} \rho}$ has no viscosity correction (the plain check valve has one).
3. In the open state the orifice is combined as a conductance evaluated at the **total** flow, $k_o = |Q| / \sqrt{\Delta P_{\text{ori}}(Q)}$, rather than at the actual valve $\Delta p$; and the cracking pressure is added to the parallel drop, so the orifice also "pays" the cracking pressure. An approximation, but undocumented in the code.
4. At $Q = 0$ the blend weight $s$ jumps (from 0 to about 0.5 when the cracking pressure is small), so the slope is discontinuous there.

**Fix direction:** first write the check for item 1 (scenario test). If confirmed, remove `check_valve_orifice` from the leak-path ranking (treat it as an open device). For items 2-4, decide whether to model the parallel paths properly: solve $Q = k_v\sqrt{\Delta p - P_{\text{crack}}} + Q_{\text{ori}}(\Delta p)$ for $\Delta p$ (a 1-D root per call) with $F_R$ on the seat.

**Tests:** `tests/unit/solver/test_stagnant_branches.py`: a section shut in behind a check valve with orifice takes the pressure of the other side within 1 Pa.

**Docs to update:** `check_valve_orifice.md` sections 3 and 6.

---

## D-10 Pump efficiency floors and braking PD pump heat

**Where:** `centrifugal_pump.py:101` and `volumetric_pump.py:142, 163` use `max(0.05, self.efficiency)` for shaft power; `centrifugal_pump.py:127` and `volumetric_pump.py:185` use `max(0.1, self.efficiency)` for the waste heat. The parser allows efficiencies down to 1 %.

**What happens:**
1. Between 1 % and 10 % efficiency the shaft power and the waste heat use different efficiencies, so the heat put into the fluid is not shaft power minus hydraulic power. Between 1 % and 5 % both are clamped.
2. A volumetric pump that brakes ($\Delta P < 0$, fed from a header) is heated by $|\Delta P|(1-\eta)/\eta$ as if it delivered. Physically the braking power $Q|\Delta P|$ is dissipated (or regenerated by the motor); the formula is not obviously right.

**Fix direction:** one floor for both (or raise the parser minimum to the floor, e.g. 5 %). For the braking case decide: all $Q|\Delta P|$ becomes heat (like a throttle, as the stopped centrifugal pump does), or no heat. Document the choice.

**Tests:** `tests/unit/equipment/test_pump_waste_heat.py`: at $\eta$ = 5 % the temperature rise matches $(P_{\text{shaft}} - Q\Delta P)/(\dot m c_p)$; a braking PD pump case with the chosen behaviour.

**Docs to update:** `centrifugal_pump.md` and `volumetric_pump.md` sections 3 and 4.

---

## D-11 Linear control valve jumps between 0 % and 0.1 %

**Where:** `backend/simulation/equipment/linear_control_valve.py:23-30` and `:51-53`.

**What happens:** exactly 0 % is a linear stiffness $\Delta P = 10^{12} Q$; any opening above 0 is clamped to at least 0.1 % with the quadratic Cv law. Typing 0.05 % gives the 0.1 % drop; 0 % gives a completely different (linear, closed) law. A case sweep from 0.1 % to 0 % jumps.

**Fix direction:** either document 0.1 % as the minimum controllable opening (and show it in the inspector), or blend smoothly from the 0.1 % curve to the closed stiffness between 0 and 0.1 %. Regulators and remote valves clamp to 0.1 % too, but they never use 0 % (lock-up and closed states are handled by the solver).

**Test:** `tests/unit/equipment/` (new `test_linear_control_valve.py`): the chosen behaviour at 0, 0.05 and 0.1 %.

**Docs to update:** `linear_control_valve.md` section 3.1.

---

## D-12 Cracking pressure labelled barg / psig

**Where:** `frontend/src/components/panels/SetupPanel.jsx:925` and `:952`

```jsx
renderLabel(`Cracking Pressure (${isImperial ? 'psig' : 'barg'})`, 'cracking_pressure_bar')
```

**What happens:** the cracking pressure is a pressure **difference** across the valve (`_bar` suffix, used as $\Delta p$ in the MCP condition), not a gauge pressure. The label suggests gauge.

**Fix direction:** label `bar` / `psi` (difference), like `Clean ΔP (bar)` on the filter. Check `UnitContext.jsx` converts it as a difference (no atmospheric offset). UI change: consult the `ui-ux-pro-max` skill per `AGENTS.md`.

**Test:** frontend unit test if the label is covered; otherwise `npm run lint` and `npm run build`.

**Docs to update:** remove the label notes in `check_valve.md` and `check_valve_orifice.md` section 5.

---

## D-13 Analytical derivatives unused for most components

**Where:** `backend/simulation/solver.py:1062-1080` (`calculate_jacobian`).

**What happens:** for the edge pressure rows the solver uses
- `Pipe.calculate_dp_derivative` (floored at $10^{-3}$);
- the pump's `calculate_dp_derivative` (volumetric pump: `outlet_derivatives`);
- a central difference of `_get_node_p_out` for **every other** component (valves, regulators, orifices, filters, reducers, heat exchangers, calibrated restrictions, flow source), step $h = \max(10^{-12}, 10^{-4}|Q|)$, so that viscosity corrections and branch switches are included (audit F1-12);
- a central difference of the whole row for MCP / relief rows.

The analytical `calculate_dp_derivative` methods of those components are only exercised by their unit tests. Several of them are approximations (they hold $F_R$, $C_d$, $K$ or the blend weight constant), which is harmless today but misleading. The equipment-creation skill still says "every equipment class should provide exact analytical derivatives".

**Fix direction:** a decision, not a bug: either (a) keep the numeric derivative and state in the skill that `calculate_dp_derivative` is optional (used by pipes and pumps only); or (b) switch the solver to the analytical derivatives where they are exact and keep the numeric one as a fallback. (a) is the low-risk choice.

**Docs:** `base_node.md` section 3.3 already describes the current behaviour; update the skill (`SKILL.md` "Analytical Jacobians" principle, `references/solver-stability.md`) to match the decision.

---

## D-14 `is_flow_boundary` is a dead flag

**Where:** `base_node.py:23`, `flow_source.py:37`, `pressure_source.py:29`. No component sets it to `True` and `solver.py` / `schemas.py` / `graph_parser.py` never read it. A flow source is recognised by `node_type == 'flow_source'` (`solver.py:39`, `:1225`).

**Fix direction:** remove the attribute and its mentions (`base_node.md`, `flow_source.md`, `pressure_source.md` and the other documents' solver flag lists, `references/equipment-archetypes.md` if mentioned, `tests/unit/equipment/test_sources.py` asserts it is `False`). Or give it a meaning (set it on the flow source and use it instead of the node type check). The skill's archetype table no longer claims pumps set it (corrected 2026-10-21).

---

## D-15 Unused `Pipe(friction_factor=...)` argument

**Where:** `backend/simulation/equipment/pipe.py:20` and `:28`. The friction factor is always computed by Churchill; `self.friction_factor` is never read. Tests still pass it (`tests/unit/equipment/test_sources.py` `_make_pipe(friction=0.02)`).

**Fix direction:** remove the argument and the attribute; update the callers in the tests.

---

## D-16 Tank default level differs between UI and parser

**Where:** `frontend/src/utils/nodeDefaults.js:47` (`level_m: 2.0` for a new tank) versus `backend/simulation/graph_parser.py:278` (`d.get('level_m', 1.0)`).

**What happens:** harmless in practice (a new tank always writes 2 m), but a file without `level_m` gets 1 m, and `tank.md` has to explain two defaults. The `## Data Fields` rule says the parser and `nodeDefaults.js` use the same defaults.

**Fix direction:** use one value in both (2 m or 1 m); update `tank.md` (sections 5 and Data Fields).

---

## D-17 PSV `action_mode = rupture_disc` duplicates the rupture disc component

**Where:** `backend/simulation/equipment/pressure_safety_valve.py:31`, `:61-62`, `:72-76`; UI option in `SetupPanel.jsx` ("Relief Action Mode").

**What happens:** the PSV has a rupture-disc mode (burst at set pressure, latched, full-bore Cv) that duplicates the dedicated `rupture_disc` component (which also has a reduced bore and its own status `intact` / `burst`). Two ways to model the same device, with different statuses (`cracked` versus `burst`).

**Fix direction:** a product decision. Either keep it (document as a convenience) or deprecate the mode: keep reading it for existing files, hide it in the UI, and point users to the rupture disc. Removing it from files is a format change (Versioning Policy in `AGENTS.md`).

**Docs to update:** `pressure_safety_valve.md` sections 1 and 3.2.
