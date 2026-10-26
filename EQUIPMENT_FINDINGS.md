# Equipment Findings (temporary working list)

Found while writing the equipment documentation (ROADMAP "Detailed Equipment Documentation", done 2026-10-21). Nothing here is fixed yet.

**Code reference:** all file paths and line numbers below refer to commit `3790728` (`3790728882f8a0f1519d167a8c574f31faf705a6`, 2026-10-20, "fix(sim): defined pressure in stagnant branches"). No code was changed between that commit and the findings. Lines move as fixes land, so view a reference at that commit with `git show 3790728:<path>` when it no longer matches, and search for the quoted function name rather than relying on the line number. Delete this file once every finding is fixed or rejected; move anything deferred to `ROADMAP.md`.

How to work through it:

- Fix test-first, following the bug-fix decision tree in the `walflow-qa` skill: strengthen a contract property or add a reference row with `pytest.param(..., id="D-xx")` before adding a new test function; mark a new file with `pytestmark = pytest.mark.audit("D-xx")`.
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
| D-04 | 3-way TCV | Mass-weighted mixing instead of the enthalpy balance | Medium | Confirmed | fixed |
| D-05 | Valves (all Cv devices) | Viscosity factor $F_R$ is not IEC 60534-2-1; no laminar valve flow | Medium | Code reading + numbers | rejected |
| D-06 | Pipe | Roughness 0 replaced by 0.045 mm | Medium | Code reading | fixed |
| D-07 | Reducer vs pipe | Two different friction factor functions | Low | Code reading | fixed |
| D-08 | Calibrated restriction | Calibrates before the parser sets bore and fluid; recalibrates every call; zero inputs replaced | Low | Confirmed | fixed |
| D-09 | Check valve with orifice | Ranked as a closed check valve in shut-in sections; model simplifications | Low | Confirmed | fixed |
| D-10 | Pumps | Efficiency floors differ between power and heat; braking PD pump heat | Low | Code reading | fixed |
| D-11 | Linear control valve | Jump between 0 % and 0.1 % opening | Low | Code reading | fixed |
| D-12 | Check valves (UI) | Cracking pressure labelled barg / psig but is a difference | Low (UI) | Code reading | fixed |
| D-13 | Solver / all components | Analytical `calculate_dp_derivative` unused except pipes and pumps | Info | Code reading | fixed |
| D-14 | Base node | `is_flow_boundary` is a dead flag | Cleanup | Code reading | fixed |
| D-15 | Pipe | `friction_factor` constructor argument unused | Cleanup | Code reading | fixed |
| D-16 | Tank | Default level 2 m in the UI, 1 m in the parser | Cleanup | Code reading | fixed |
| D-17 | PSV | `action_mode = rupture_disc` duplicates the rupture disc component | Cleanup / decision | Code reading | fixed |
| D-18 | Mixer | Inlet with reverse flow reports default density / stale viscosity | Low | Confirmed (property test) | fixed |
| D-19 | Junctions / reducer | Junction joining different pipe diameters gains kinetic energy; with a reducer the network can have no steady state | Medium | Confirmed (property test) | open |
| D-20 | Solver | Reported pressures lag the last property update; a pipe after a viscous drop can show a small static rise | Low | Confirmed (property test) | fixed |
| D-21 | Solver / dead legs | Stagnant branches keep the 20 °C port default (cold and warm start), depending on the flow noise sign | Low | Confirmed (property test) | fixed |
| D-22 | Solver | Junctions balance volume flow, not mass flow; mixing at different temperatures loses ~0.4 % mass | Low / decision | Confirmed (property test) | fixed |
| D-23 | Solver / equipment | Analytical dp derivatives of most components are never used by the solver (dead code) | Low / cleanup | Mutation testing | fixed |
| D-24 | Solver / junctions | A junction downstream of two hot supplies reports ~1 K below the coldest supply without any cooler | Medium | Confirmed (property test, explore) | fixed |
| D-25 | Frontend / file format | The `.wlf` header is written by hand in three places instead of by `serializeDiagram`, so it can drift when the format changes | Low / cleanup | Code review | fixed |
| D-26 | Orifice | ISO Reynolds limit for β > 0.56 is a flat 16 000 instead of 16 000·β² (ISO 5167-2:2022 §5.3.1); up to +12 % permanent loss in the ISO-valid range | Medium (wrong result) | Confirmed (standard + calculation) | fixed |
| D-27 | Orifice / docs | `orifice.md` §3.1 describes the old β and d clamps (0.1-0.75, d ≥ 12.5 mm); the code uses 0.01-0.99 and no d clamp | Low / docs | Code reading | fixed |
| D-28 | Calibrated restriction, check valve orifice, rupture disc / docs | Permanent loss ratio (1 − β²) is attributed to ISO 5167-2, which gives only Formula (7) and 1 − β^1.9 | Low / decision | Confirmed (standard) | fixed |
| D-29 | Cv valves (all) | Viscosity factor $F_R$ floors at 0.5: no laminar range of IEC 60534-2-1 Annex A; Δp 1-2+ orders too low below Re_V ≈ 20 | Medium (wrong result, viscous fluids) | Confirmed (standard + calculation) | fixed |
| D-30 | Calibrated restriction, reducer, fluid properties | Unused local variables `sign_q`, `dp_bern`, `t_c` | Cleanup | Code reading (AST check) | fixed |
| D-31 | Solver / 3-way TCV | Mix-ratio loop cycles on an S-shaped outlet temperature (laminar paths) and still reports `controls_converged` | Medium (wrong result reported as converged) | Test (D-29a), trace | fixed |
| D-32 | Solver | Hydraulic solve fails for flows below about 1e-7 m³/s (e.g. Cv 0.1 TCV with a Cv 0.01 load on ISO VG 46) | Low (micro flows) | Test (D-29a), trace | rejected (cause was D-29) |
| D-33 | Linear control valve, remote control valve, regulator (Results tab) | Valve chart draws the bare Cv equation in the browser, without $F_R$ and the valve style | Low (display only) | User question | fixed |
| D-34 | Solver / stagnant sections | Two separate graph walks and thresholds for stagnant pressures and dead-leg temperatures; the temperature graph is rebuilt on every property pass | Cleanup | Code review | open |
| D-35 | Solver / micro flows | Pressure drop of a pipe behind a very stiff micro-flow edge is off by ~5 Pa (pipe absorbs the edge residual) | Low | Confirmed (property test, explore) | fixed |
| D-36 | Solver / micro flows | Explore profile: oil networks with junction flows near 1e-8 m³/s fail the junction enthalpy check, or the outer loop does not settle in 100 iterations | Low | Confirmed (property test, explore) | open |

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

**Resolution (rejected, duplicate):** merged into D-29, which checks the same `get_valve_fr` approximation against the IEC 60534-2-1 text. The fix is tracked there.

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

**Resolution (fixed):** option (a). The solver keeps the numerical derivative; the equipment-creation skill (`SKILL.md` principle 3, `references/backend-physics.md` §3.2, `references/equipment-documentation-standard.md`) states that `calculate_dp_derivative` is optional and used for pipes and pumps only.

---

## D-14 `is_flow_boundary` is a dead flag

**Where:** `base_node.py:23`, `flow_source.py:37`, `pressure_source.py:29`. No component sets it to `True` and `solver.py` / `schemas.py` / `graph_parser.py` never read it. A flow source is recognised by `node_type == 'flow_source'` (`solver.py:39`, `:1225`).

**Fix direction:** remove the attribute and its mentions (`base_node.md`, `flow_source.md`, `pressure_source.md` and the other documents' solver flag lists, `references/equipment-archetypes.md` if mentioned, `tests/unit/equipment/test_sources.py` asserts it is `False`). Or give it a meaning (set it on the flow source and use it instead of the node type check). The skill's archetype table no longer claims pumps set it (corrected 2026-10-21).

**Resolution (fixed):** removed. The attribute is gone from `base_node.py`, `flow_source.py` and `pressure_source.py`, from every equipment document's solver flag list, `DEVELOPMENT.md`, the equipment-creation skill and `test_sources.py`.

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

**Resolution (fixed):** the latching behaviour was already its own mode, `pop_latching`; `rupture_disc` survived only as a load alias. The alias is removed in `pressure_safety_valve.py` and in the `App.jsx` import. Old files are not supported (file format 0.2 is a new installation), so no migration or format change is needed; an unknown mode reads as `pop_action`. The `pop_latching` mode stays.

---

## D-18 Mixer inlet with reverse flow reports the default density

**Where:** `backend/simulation/equipment/mixer.py` (`calculate`). Found by `tests/scenarios/test_network_invariants.py::test_junctions_conserve_energy` (two pressure sources at different pressures, one inlet flows backwards).

**What happened:** `Mixer.calculate` refreshed density and viscosity only on its outlet. An inlet carrying reverse flow (outward) kept the `Port` default 1000 kg/m³ and a stale viscosity, so its telemetry and any mass-weighted balance over it were wrong (heavy crude: 1000 instead of 933.7 kg/m³). Temperatures and flows were correct.

**Fix:** the mixer calls `update_outward_properties()` like the splitter and measure point (D-01), and no longer copies inlet 0's density and viscosity onto an outlet with reverse flow (found in review). Doc: `mixer.md` section 4.

---

## D-19 Junction with different pipe diameters plus a reducer has no steady state

**Where:** the static-pressure node model (`backend/simulation/solver.py`, splitter / mixer / any node joining pipes) together with the reducer's Bernoulli term (`reducer.py`, `calculate_losses`). Found by `tests/scenarios/test_network_invariants.py` (convergence and mass properties) in the full run.

**What happens:** every port of a node is at one static pressure. Where a large pipe feeds a small one at a node, the flow accelerates with no loss, so it gains kinetic energy for free. The reducer, modelled in static pressure, converts velocity head back into static pressure. Around a loop this gain grows with the flow faster than friction, so above a threshold there is no steady state and Newton fails ("Backtracking line search failed to decrease residual"). Without the reducer the free kinetic energy is only dissipated and the same networks solve.

**Reproducers** (pipes 1 m long, smooth; water or heavy crude; tank level 1 m, 10 °C):
1. Pressure source 2.0 bara (pipe DN 135 mm) and pressure source 1.5 bara (pipe 135 mm → reducer 135 → 50 mm, length 0.37 m → pipe 50 mm) into a mixer, mixer → pipe 50 mm → tank. Flow runs backwards through the reducer. Solves at 1.9 bara, fails at 1.7 bara and below.
2. Two pressure sources 2.0 bara into a mixer, pipe 135 mm to a splitter; branch A: check valve (Cv 1); branch B: pipe 50 mm → reducer 50 → 135 mm → pipe 135 mm; both into a mixer → tank.

**Fix direction:** account for kinetic energy where pipes of different diameters meet (total pressure at nodes, or a sudden contraction / expansion loss at each mismatched port), so a junction can no longer gain energy. This is a solver physics change and moves golden results. Until then the reducer is left out of the generated networks (`helpers/strategies.NETWORK_COMPONENTS`); its contract and reference tests still run.

**Docs to update:** `reducer.md` section 6, `splitter.md` / `mixer.md` section 3.4.

---

## D-20 Reported pressures lag the last property update

**Where:** `backend/simulation/solver.py`, outer property loop (`properties_converged = max_temp_change < 0.05`). Found by `tests/scenarios/test_network_invariants.py::test_pressure_is_continuous_and_falls_along_the_flow` (explore profile).

**What happens:** Newton solves the pressures with the densities and viscosities of the previous outer iteration. The loop stops when temperatures change less than 0.05 K, and the final `calculate()` sets port pressures from the updated properties. Each component then matches its own model, but a pipe's equation holds only for the old properties. With heavy crude (viscosity ~4 %/K) a 0.05 K step moves a viscous drop by ~0.2 %. Example: tank → pump (20 l/min, 20 m) → pipe 18 mm → heat exchanger (rated 20 l/min / 1 bar, 1.7 bar actual) → pipe 135 mm → tank, all 1 m, heavy crude at 10 °C: the last pipe shows a 37–50 Pa static rise in the flow direction where its model gives a 4–16 Pa drop.

**Fix direction:** after the properties converge, run one more Newton solve with the final properties (cheap with the warm start), so reported pressures and every pipe equation agree. Until then the network property allows a lag of 0.2 % of the network's pressure span (`PRESSURE_LAG`); remove it with the fix.

**Same lag in temperatures and properties** (explore profile, 2026-10-23):
- `test_well_posed_network_reaches_a_finite_steady_state_with_fluid_properties`: pressure source 11 bara at 10 °C → orifice (ISO 5167, pipe ID e⁻² m, bore 0.0677 m) → tank 1 m, heavy crude. The orifice outlet reports density 933.710 kg/m³, the value ~0.52 K below its reported temperature: the throttle warming of ~0.55 K is not in the properties yet. The property allows `PROPERTY_LAG_K`; remove it with the fix.

---
**Resolution (fixed):**
- **Solver:** once the temperatures change by less than 0.05 K and the pressure controllers and 3-way TCVs have settled, the outer loop holds the fluid properties fixed for the next hydraulic solve. The loop ends only on such a frozen solve, with the controllers still at their setpoints and a TCV that was on its setpoint still on it; otherwise the properties are propagated again. Telemetry does not propagate again, so the reported pressures satisfy every component equation with the reported densities and viscosities. At the iteration limit, one extra frozen solve runs before reporting. Pumps recompute NPSHa from the reported suction pressure. The shipped examples need 0–2 more outer iterations (14 → 22 in the worst case, Large Reference Network case 1) and all report `controls_converged`. Golden results stay within tolerance.
- **Orifice density lag:** a component bug, not the loop. The orifice and calibrated restriction copied the inlet density and viscosity to the warmed outlet; they now evaluate both ports at their own temperature, as the control valves do. The calibrated restriction also takes the outlet properties in reverse flow, as the orifice does.
- **Tests:** `PRESSURE_LAG` and `PROPERTY_LAG_K` are removed. The pressure property checks every pipe's drop against its own model with the reported properties, with the heavy crude case as an `@example`. The orifice and calibrated restriction tests have a warmed-outlet property row.
- **Not fixed here:** the junction energy residual of `test_junctions_conserve_energy` is unchanged (about 330 J/kg). It is a temperature convergence issue in loops of junctions and moved to D-24.

---

## D-21 Exact-hit warm start leaves stagnant branches at the default temperature

**Where:** `backend/simulation/solver.py`, warm-start path ("Exact Hit"). Found by `tests/scenarios/test_network_invariants.py::test_warm_start_reaches_the_cold_start_state` (explore profile).

**What happens:** pressure source 15 bara and pressure source 9 bara → check valve (Cv 1) into a mixer → tank, heavy crude at 10 °C. The check valve closes (flow ~1e-12 m³/s). After a cold start the dead branch shows 283.21 K (its neighbour); after an exact-hit warm start of the same file it shows 293.15 K, the `Port` default. Pressures, flows and all flowing temperatures agree. The user sees a dead leg at 20 °C or 10 °C depending on whether the run is the first one.

**Fix direction:** the warm-start path must run the same stagnant-port temperature fill as the cold start (or restore cached temperatures with the cached state). Until then the warm-start property compares temperatures only at flowing ports; remove that with the fix.

**Resolution (fixed):** not warm-start specific. The warm start only changes the initial guess. Closed-branch flows are about ±1e-12 m³/s with a noise sign, and temperatures follow the sign. A dead leg could therefore end with no port feeding it, and keep the 20 °C default on cold starts too (reproduced with a 15/9 bara pair). The 10 °C seen on the cold start was luck. `_fill_stagnant_temperatures` (end of `_propagate_properties`) now gives every port with $|Q| \le$ `Q_DEAD_LEG` (1e-9 m³/s; the check-valve threshold `Q_STAGNANT` = 1e-7 would also catch real trickles, e.g. a heat exchanger behind a Cv 0.001 valve) the temperature of its nearest seed, walking through stagnant ports and pruned sections. Seeds are the pressure-boundary ports and the leaving temperature of a node with flow. Crossing a stagnant node is one step, so each side of a closed check valve takes its own neighbour's temperature. Test: `test_stagnant_branches.py::test_dead_leg_behind_a_check_valve_takes_the_temperature_of_its_nearest_live_side`. The warm-start property now compares temperatures at every port. Doc: `base_node.md` section 3.

---

## D-22 Junctions balance volume flow, not mass flow

**Where:** node mass rows in `backend/simulation/solver.py` (`q_in - q_out`, volume flows, see `base_node.md` section 3.1). Found while checking `test_junctions_conserve_energy`.

**What happens:** every node conserves volume flow. Where streams of different temperature mix, densities differ, so mass is not conserved: seawater at 0 °C (1028 kg/m³) and 55 °C (1009 kg/m³) mixed 1:1 leaves the mixer with ~0.4 % less mass than enters. Temperatures are right (the mixer mixes by mass), so the effect is a small inconsistency in mass flow telemetry and in the flow split, largest for big temperature differences and fluids with a strong thermal expansion.

**Fix direction:** a modelling decision. Either keep the volume balance (document it as a limit of the incompressible model in `base_node.md` section 6) or balance mass flow (`rho_in q_in - rho_out q_out`), which couples the hydraulic rows to the property loop. The network properties compare specific enthalpies, not absolute enthalpy flows, so they hold either way.

The same rows hold at two-port nodes, so a component that changes the temperature keeps volume flow too (water heated from 10 to 80 °C: ~2.8 % mass lost).

**Resolution (2026-10-25):** mass balance chosen. The node rows weight each edge flow by $\rho_j/\bar\rho$, the edge density where the flow enters the next node (the density that node mixes with), in the flow direction of the last property pass, held fixed within each hydraulic solve (`_edge_mass_weights`). The mixer and 3-way TCV no longer overwrite the solved outlet flow with the volume sum of their inlets, and the reported port flows are written from the edges again after the components ran (they set outlet = inlet volume flow). `test_mass_is_conserved` checks $\sum \rho q$ at every node, with a pinned 0 °C / 55 °C seawater mixer. The gate then showed that the solve evaluated component curves at the outlet edge flow and the property pass at the inlet flow; with mass balance they differ, and on a stiff curve (PD pump slip) the pump heat was 60x too high. Now every component curve is evaluated at its inlet volume flow, edge mass flow / inlet density (`f` of `_edge_weights`), in the solve, the Jacobian and the report (`base_node.md` section 3.2, `equipment-creation` skill). Remaining limit: one volume flow per pipe, so a pipe's own thermal expansion is not modelled (`base_node.md` section 6).

---

## D-23 Unused analytical derivatives

**Where:** `calculate_dp_derivative` (and helpers) in the equipment classes; the solver's Jacobian assembly in `backend/simulation/solver.py` (search for `is_pump = isinstance(src_node, (CentrifugalPump, VolumetricPump))`). Found by the phase 3 mutation run (2026-10-23, see the `walflow-qa` skill, "Mutation testing").

**What happens:** the solver uses the analytical derivative only for pumps (`calculate_dp_derivative`, `VolumetricPump.outlet_derivatives`) and pipes. Every other node is differentiated numerically (`_numeric_derivative` over `_get_node_p_out`, F1-12), so viscosity corrections and branch switches are included. Their own `calculate_dp_derivative` methods are therefore never called in a simulation, only by tests. In `orifice.py` 45 mutants in `calculate_dp_derivative`, `_iso_ratio_derivative_wrt_cd` and `_dc_dre` survive the suite once the derivative tests are deleted; nothing a user runs can notice a bug there. The derivative tests for orifice, check valve orifice, filter, reducer and pipe friction were deleted in phase 3 for that reason.

**Candidates** (verify each against every call site first, e.g. `three_way_tcv.calculate_dp_derivative_path`, warm start, relief and remote-pilot paths, flow source, heat exchanger and reducer as edge-like nodes): `orifice.py` (with `_iso_ratio_derivative_wrt_cd`, `_dc_dre`), `check_valve.py`, `filter.py`, `reducer.py`, `heat_exchanger.py`, `calibrated_restriction.py`, `linear_control_valve.py`, `linear_regulator.py`, `remote_control_valve.py`, `relief_device.py`, `flow_source.py`, `three_way_tcv.py`, and the `base_node.py` default. Keep pumps and `pipe.py`.

**Fix direction:** a cleanup decision. Either delete the unused methods (and the `.md` sections that describe them), leaving the base-class default if something still dispatches on it, or deliberately switch the solver to the analytical derivatives for speed, then test them with a contract property (analytical vs. numerical slope for every two-port in `RESISTANCE_DATA`) instead of per-component tests. Rerun the gate and the golden examples either way; a mutation run on the touched modules confirms nothing live was removed.

**Resolution (fixed):** deleted. The analytical derivatives of calibrated restriction, check valve, filter, heat exchanger, linear regulator, linear and remote control valve, flow source, reducer, relief device, orifice (with `_iso_ratio_derivative_wrt_cd`, `_dc_dre`) and the three-way TCV path are gone, and `FluidProperties.get_orifice_cd_slope` with them. `calculate_open_friction_and_deriv` of the check valve, PSV and rupture disc is replaced by the value-only `open_seat_dp` / `open_dp`. Pumps, the pipe and the base-class numerical fallback stay. Derivative tests and the `.md` derivative sections are removed or reduced to a note.

---

## D-24 Junction colder than every supply

**Where:** temperature propagation through mixers and splitters, `backend/simulation/solver.py` outer property loop and `HydraulicNode.calculate_temperature()` (`base_node.py`). Found by `tests/scenarios/test_network_invariants.py::test_dissipation_never_cools_and_mixing_stays_between_its_streams` (explore profile, 2026-10-23).

**What happens:** two pressure sources at 1.5 bara (359.39 K and 334.81 K) feed mixer `n0` through check valves. `n0` feeds splitter `n6`; one branch runs through a check valve (cracking 0) and the other straight to mixer `n7`, which feeds a tank (level 1 m). Heavy crude, pipes 1 m with ID e⁻² m. Splitter `n6` reports 333.85 K, 0.96 K below the coldest supply, although the network has no cooler and dissipation can only warm the fluid. Reproduce with `HYPOTHESIS_PROFILE=explore python -m pytest "tests/scenarios/test_network_invariants.py::test_dissipation_never_cools_and_mixing_stays_between_its_streams" --hypothesis-seed=102041974071240473996831196549072861885` (the run hit hypothesis's shrink time limit, so the example is not minimal).

**Related (moved from D-20):** `test_junctions_conserve_energy` under the explore profile. ISO VG 100 at 0 °C, source 2 bara → splitter → mixer `n8` fed directly and through a heat exchanger (medium 5 °C), inside a loop of splitters, mixers and a check valve → tank. A leaving stream of `n8` is about 330 J/kg (≈0.18 K) off the mixed enthalpy of its arriving streams, more than the 0.1 K `TEMPERATURE_TOL`; reproduce with `@reproduce_failure('6.170.5', b'AXicc2TTYIACRwYNByhTw/4DVIwZLq1xAK4OCBmBMg4CMBkBFBlGoElwXUim4zAJjw24ZJDN4kCzm0nDQQTTbpgYPgupJU66VwGOXR2T')`. A fresh explore run found a larger case (node `n6`, about 2970 J/kg off): `@reproduce_failure('6.170.5', b'AXicc2TQcFBhAANHRg37DxCmhgMHOoMBCjQOQBmOIIjQ4siMS4kjTs149AAhQs4BzkB3DVgtE07H4TadCZtZGg4iCGNJNRSnONz1BwSQxQG7pRzO')`. It is unchanged by the D-20 fix (frozen final properties), so it is not a reporting lag: the property propagation (`property_iterations`, 0.01 K) or the outer loop's 0.05 K step stops before the temperatures around the junction loop have converged.

**Open question:** whether this is the same loop-convergence residual as the energy cases above, a near-stagnant check-valve branch picking up a wrong temperature (compare D-21), or a mixing error. Find it by shrinking the example first, then printing each port's flow and temperature per outer-loop iteration.

**Fix direction:** depends on the cause. The property stays as it is; it fails under the explore profile until this is fixed. The default profile does not draw this case.

**Diagnosis (2026-10-25):** three separate causes.
- Test artifact: the property ignored arriving streams below 1e-7 m³/s, so a real trickle into a mixer looked like a mixer hotter than its streams. Arriving streams now count from 1e-9 m³/s; the trickle network is pinned as an `@example`.
- (a) Outer-loop cycle near a flow reversal: a branch close to zero flow flips direction, the mixed temperature changes, the new viscosities flip it back. Transformer oil network: a 4-cycle with the mixer outlet swinging 274–299 K; heavy crude network: the tank branch flipping between +3.6e-9 and −2.6e-7 m³/s. Both ended at 100 outer iterations with flows and temperatures from different states.
- (b) Loops of junctions: in a splitter → check valve → mixer loop behind a dead tank branch, a spurious 4.2e-7 m³/s circulation keeps the loop near the 293.15 K start value. Each Gauss-Seidel pass changes it by less than 0.01 K, so the loop reports converged about 1 K below every supply. Likely the cause of the `test_junctions_conserve_energy` residual.

**Resolution (a) fixed:** the property update uses damped flows $Q_{\text{prop}}$ once successive corrections swing back. Properties count as converged only when $Q_{\text{prop}}$ matches the solved flows (1e-4 relative, same direction on every non-dead edge); see `base_node.md` §4.2. Both networks converge in 8 outer iterations and are pinned as `@example`s; `solved()` in `test_network_invariants.py` now also requires `properties_converged`.

**Resolution (b) fixed:** between the Gauss-Seidel passes, `_solve_mixing` solves the junction mixing of all nodes as one sparse linear system (one unknown temperature per edge; component heating, pipe ΔT and the heat exchanger slope $1-\varepsilon$ taken from the current pass, so the passes only refine what is nonlinear); see `base_node.md` §4.2. The loop now sits at its supply temperature plus dissipation (294.20 K) instead of 293.16 K, and is pinned as an `@example`.

**Resolution (energy residual) fixed:** the explore failure of `test_junctions_conserve_energy` that remained (also on the D-24a commit) was a ~9e-11 m³/s hot trickle, solver noise below `Q_DEAD_LEG`, mixed into a junction 68 K colder: 0.1 K off. `calculate_temperature` and `has_inflow` now ignore flows at or below `Q_DEAD_LEG` (moved to `base_node.py`), like the mixing solve and the dead-leg fill; pinned as an `@example`. Run time of the shipped examples unchanged or lower (golden + solver-method subset 4.7 s, was 5.6 s).

---

## D-25 File header written by hand in three places

**Where:** `frontend/src/App.jsx` (blank cloud diagram payload, near `/api/diagrams`), `frontend/src/components/modals/ProjectManagerModal.jsx` and `frontend/src/components/panels/Sidebar.jsx` build the `.wlf` header (`version`, `format`, `app_version`, ...) as literals instead of calling `serializeDiagram` (`frontend/src/utils/diagramFile.js`). Found while planning the phase 4 round-trip test (2026-10-23).

**What happens:** nothing today; all three write format 0.2. When the file format changes, these copies can drift from `serializeDiagram` and write files that `checkDiagramFile` rejects or that miss new fields. The round-trip test in `diagramFile.test.js` covers only `serializeDiagram`.

**Fix direction:** a cleanup. Build those payloads with `serializeDiagram` (empty nodes and edges where needed), so one function owns the header.

**Resolution (fixed):** App.jsx (blank cloud diagram), ProjectManagerModal.jsx (new diagram) and Sidebar.jsx (blank diagram after deleting the open drawing) build their payload with `serializeDiagram`; no hand-written header remains.

---

## D-26 Orifice Reynolds limit for large β

**Where:** `backend/simulation/equipment/orifice.py::_re_valid` and `orifice.md` §3.5. Found by verifying claim ORI-03 against ISO 5167-2:2022 (2026-10-23, `docs/STANDARDS_REGISTER.md`).

**What happens:** ISO 5167-2:2022 §5.3.1 sets the lower Reynolds limit for corner and D-D/2 tappings at Re_D ≥ 5 000 for β ≤ 0.56 and Re_D ≥ 16 000·β² for β > 0.56. `_re_valid` returns a flat 16 000 for β > 0.56. The value is the top of the blend band (Re_lo = 0.4·Re_valid) and the threshold of `iso_validity_issues`. At β = 0.75 (ISO limit 9 000) the model still blends towards the viscous extension: C_d is 5.4 % below Reader-Harris/Gallagher at Re_D 9 000 (permanent loss about +12 %), 4.2 % at 10 000 (+9 %), 2.0 % at 12 000 (+4 %); and the warning flags ISO-valid points as invalid.

**Fix direction:** return `16000.0 * beta ** 2` for β > 0.56 (continuous with 5 000 at β = 0.56 within 0.4 %), update `orifice.md` §3.5, and add a reference row at β = 0.75, Re_D just above 9 000 expecting the pure RG coefficient. Check the golden examples for orifices with β > 0.56.

**Resolution (fixed):** `_re_valid` returns 16 000·β² for β > 0.56; `orifice.md` §3.2 and §6 updated; reference test `test_d26_reynolds_limit_above_beta_056_is_16000_beta_squared` (β 0.75, Re_D 9 100 and 8 500). No golden example changed.

---

## D-27 Orifice document describes the old clamps

**Where:** `backend/simulation/equipment/orifice.md` §3.1 (and the clamp text around line 135). Found while verifying ORI-03 (2026-10-23).

**What happens:** the document says the RG inputs are clamped to β 0.1-0.75 and d ≥ 12.5 mm. Since F1-39 the code uses the true β, guarded only to 0.01-0.99 (`_beta_eff`), with no d clamp, and reports the ISO limits through `iso_validity_issues`.

**Fix direction:** correct the document; no code change.

**Resolution (fixed):** `orifice.md` §3.1 and §6 describe the true-β guard (0.01-0.99), no d clamp and the `iso_validity_issues` report. The C_low formula in §3.2 now shows the tanh $C_d$ law the code uses.

---

## D-28 Permanent loss ratio (1 − β²) has no ISO source

**Where:** `calibrated_restriction.py`, `check_valve_orifice.py`, `rupture_disc.py` and the `classic_cd` model of `orifice.py`; claims CR-02 and CVO-02 in the register. Found by verifying against ISO 5167-2:2022 (2026-10-23).

**What happens:** the documents attribute the ratio permanent loss / differential pressure = 1 − β² to ISO 5167-2. The standard gives Formula (7) (§5.4.1) and the simpler approximation 1 − β^1.9 (§5.4.2) only. Numerically 1 − β² is within −2.4 % … +2.5 % of Formula (7) for β 0.2-0.75, so the results are close; the citation is wrong.

**Fix direction:** a decision: (a) use Formula (7) with the model's C_d, as the orifice does; (b) use §5.4.2, 1 − β^1.9; or (c) keep 1 − β² and cite a source that gives it. (a) or (b) changes results by up to 2.5 %.

**Resolution (fixed):** option (a). `FluidProperties.get_orifice_permanent_loss_ratio` (Formula (7)) with the component's $C_d$ is used by the calibrated restriction (calibration and drop), the check valve orifice, the reduced-bore rupture disc and the orifice `classic_cd` model; the ISO orifice model delegates to it. Reference test `test_d28_permanent_loss_is_tap_dp_times_formula_7`. Golden examples regenerated: `Example_Multi_PSV_Protection` (both PSVs blocked) −0.031 bar (−0.45 %), `Example_Parallel_Pumps` (check valve orifice bypasses) flows +0.08 %.

## D-29 Valve viscosity factor F_R has no laminar range

**Where:** `fluid_utils.py::FluidProperties.get_valve_fr`, used by every Cv-based component (linear control valve, regulator, remote control valve, three-way TCV, check valve, check valve with orifice, PSV, rupture disc); claim LCV-02 in the register. Found by verifying against IEC 60534-2-1:2011 (read as DIN EN 60534-2-1:2012-01) on 2026-10-23.

**What happens:** WalFlow uses F_R = (Re_v + 200)/(Re_v + 400), clamped to 0.4-1, with Re_v over an equivalent bore 0.01·√Cv. The standard (Annex A, Eq. A.6-A.8b, with Re_V from Eq. 23) lets F_R fall as √Re_V in laminar flow, so Δp ∝ μQ. WalFlow's F_R never drops below 0.5, so its Δp is at most four times the turbulent value. Compared with Annex A for globe and ball valves (water, 46 and 500 cSt): Δp within −13 % … +11 % for Re_V ≈ 40 to 10⁵; below Re_V ≈ 20 (viscous oil, small Cv, low flow) Δp is 1 to 2+ orders of magnitude too low. At Re_V ≥ 10 000 the standard has F_R = 1, WalFlow 0.98-0.999 (Δp +0.1 … +9 %). The documents state the simplification; the docstring calls it the IEC factor.

**Fix direction:** implement Eq. (23) and Annex A with defaults for F_L and F_d (e.g. a globe valve from Table D.2), and the valve size (or C/d²) as an input, keeping F_R smooth for the solver; or keep the approximation and add a warning when Re_V < ~20. Changes results only in laminar and transitional valve flow.

**Resolution (fixed, D-29a):** the three control valves (linear control valve, remote control valve, three-way TCV per path) use the Annex A factor as written (`FluidProperties.get_iec_valve_fr`): Re_V from Eq. (23), F_R from Eq. (A.6)/(A.7), n from Eq. (A.8a)/(A.8b), Cv constants of Table 1. The valve is line-size (A.4): the parser passes the connected pipe bore. F_L = 0.9 and F_d = 0.46 (Table D.2, globe single port, contoured plug, flow to open) are node properties `fl`, `fd`, validated by the parser. F_R is kept above zero, so Δp is linear in Q in laminar flow. One deliberate deviation, agreed with the user: where (A.7) starts below (A.6) at Re_V = 10 (valves very small or very large for the line, e.g. Cv < 0.15 or Cv > 117 on DN50 with F_L 0.9), the standard's F_R jumps down and the pressure drop has a gap with no flow, which made the hydraulic solve fail (TCV test network, a property-test network with heavy crude). From Re_V = 10, F_R is held at least at the (A.6) value at Re_V = 10. Just after, where (A.7) takes over at a small F_R, the standard's Δp falls with rising flow (a glycol property-test network failed there), so F_R may grow at most as Re_V^0.75 (`IEC_FR_MAX_SLOPE`): Δp rises at least as √Q. Within scope Δp is then up to +20 % (F_L 0.9) / +43 % (F_L 0.98) above the standard, over Re_V ≈ 10-40. Documented with examples in [linear_control_valve.md](backend/simulation/equipment/linear_control_valve.md) §3.3. The check valves, PSV, rupture disc and regulator are outside IEC 60534 and keep `get_valve_fr`; their own standards may replace it later. **D-29b (fixed):** the valve styles are catalogue entries of type `control_valve` in the fitting catalogue (same API, permissions, import/export and built-in rules). The built-in catalogue `IEC_60534_2_1_TABLE_D2` holds the 28 Table D.2 rows with a numeric F_d (`services/valve_style_defaults.py`; tapered needle and multistage left out). The `/pipes` page is renamed `/catalogue` (old link forwards) with a third tab, Control valve styles, laid out like the fitting standards tab. The three valve inspectors pick a style or Custom; the node stores `valve_style_id` and a copy of `fl` and `fd`.

---

## D-30 Unused local variables

**Where:** found by an AST check for unused names while removing the analytical derivatives (D-23), 2026-10-23:
- `calibrated_restriction.py::calculate_delta_p`: `sign_q` is computed and never used (the drop takes its sign from `flow_rate`).
- `reducer.py::calculate`: `dp_bern` from `calculate_losses` is unpacked and never used.
- `fluid_utils.py::FluidProperties.get_vapor_pressure`: `t_c` is computed before the model branch and never used.

**What happens:** nothing; dead code that a reader may take for a missing step.

**Fix direction:** a cleanup. Delete the three names (unpack `dp_bern` as `_`). Check each branch first, so no model was meant to use them.

**Resolution (fixed):** the three names are removed (`dp_bern` unpacked as `_`). No branch needed them: the drop takes its sign from `flow_rate`, the reducer heats only with `dp_loss`, and the vapour-pressure models work in kelvin.

---

## D-31 3-way TCV loop cycles on an S-shaped outlet temperature

**Where:** `solver.py::NetworkSolver._tcv_step` and the reporting at the end of `solve`. Found when D-29a made laminar valve paths possible: `test_three_way_tcv.py::test_tcv_downstream_network_integration` (ISO VG 46, TCV Cv 0.1, load Cv 0.01), 2026-10-23.

**What happens:** with laminar paths the split goes with opening^1.5 divided by viscosity, so the outlet temperature against the mix ratio is S-shaped. The secant between two points on the flat part underestimates the slope near the setpoint, the step overshoots to the other flat part, and the step factor (halved on overshoot, doubled on progress) locks into a 4-step cycle (mix 0.66 → 0.09 → 0.17 → 0.81, error ±11-13 K) for all 100 iterations. The solve then returns `success` and `controls_converged = True`: `controls_converged` only covered the pressure controllers.

**Fix direction:** keep the secant, but bracket the setpoint once the error has changed sign and bisect when a step would leave the bracket; report an unsettled TCV.

**Resolution (fixed):** regular steps keep the latest mix on each side of the setpoint (a too-cold and a too-hot end); a step that would leave the bracket bisects it. An end not refreshed for more than 4 regular steps (`TCV_BRACKET_AGE`) expires; a bracket whose ends share one mix (the setpoint moved) is dropped: the first iterations run before the inlet temperatures and properties settle, and a stale end held the mix at 0.5, 6 K off. A TCV still off its setpoint at the iteration limit sets `controls_converged = False`, which the UI shows as "Control loops did not settle". With D-29a, TCV Cv 0.5 to 10 settle within 0.01 K in 7-17 iterations.

---

## D-32 Hydraulic solve fails for micro flows

**Where:** `solver.py` (Newton / line search; flows below 1e-7 m³/s are reset to the initial guess in the warm-start handling of `solve`, and the TCV treats paths below 1e-9 m³/s as stagnant). Found with D-29a, 2026-10-23.

**What happens:** the TCV test network with a Cv 0.1 TCV and a Cv 0.01 load on ISO VG 46 now flows about 0.016 L/min (2.6e-7 m³/s, laminar). The hydraulic solve fails with "Backtracking line search failed to decrease residual". It is reported as a failure, not hidden. Before D-29a the floor F_R ≥ 0.5 gave about 0.08 L/min.

**Fix direction:** review the solver's absolute flow thresholds and the residual scaling for very small flows, together with the solver findings D-19 to D-24.

**Resolution (rejected, misdiagnosed):** not a solver limit. The Cv 0.01 load on DN50 is a valve far too small for its line, where the standard's F_R made the pressure drop fall with rising flow (D-29). With the F_R growth cap of D-29 the network solves (0.010 L/min, 45.00 °C in 20 iterations), although its flow is close to the 1e-7 m³/s threshold.

---

## D-33 Valve chart ignores F_R and the valve style

**Where:** `frontend/src/components/details/ValveDetails.jsx` (Results tab of the linear control valve, remote control valve and regulator). Found by a user question after D-29b, 2026-10-23.

**What happens:** the chart computed its curves itself with $\Delta P = K_{Cv} \rho Q^2 / C_v^2$. It left out $F_R$, so two valve styles drew the same curve, and at low Reynolds numbers the curve did not pass through the solved operating point.

**Resolution (fixed):** the telemetry of the three valves carries `valve_curves` (`routers/simulation.py::valve_curves`): flow and $\Delta P$ at the current and at the full opening from the valve's own `calculate_delta_p`, with the solved inlet fluid, 61 points from 0 to max(300 L/min, 2 × the current flow). The chart draws these points and no longer computes $\Delta P$. The operating point is drawn at the valve's own pressure (inlet for backpressure, outlet otherwise), so it lies on the curve. A valve sensing elsewhere (e.g. the API 614 spill-over valve: inlet 7.66 bar(a), header 6.50 bar(a)) shows its sensed pressure in the values below the chart; the setpoint line marks the target.

---

## D-34 Two walks over stagnant sections

**Where:** `backend/simulation/solver.py`, `_fill_stagnant_temperatures` (dead-leg temperatures, D-21) versus `_side_links` / `_assign_stagnant_pressures` (stagnant pressures, `port.stagnant` flags). Found by the code review of the D-21 fix (2026-10-25).

**What happens:** the same topology is walked twice, with two meanings of "stagnant":
- pressures: sections shut in by a closed check valve, stopped pump or closed relief device, with a check valve counted as closed below `Q_STAGNANT` (1e-7 m³/s);
- temperatures: ports with $|Q| \le$ `Q_DEAD_LEG` (1e-9 m³/s, the solver's flow noise).

Nothing is wrong today: a port flagged `stagnant` with a flow between the two thresholds carries real flow, and its temperature follows that flow correctly. But a change to one walk (e.g. a new blocking device) can miss the other. In addition, `_fill_stagnant_temperatures` rebuilds its port graph (pipe chains, node-interior links) on every `_propagate_properties` call: every outer iteration, up to 20 final property passes and the telemetry. The topology is fixed for the solver's lifetime. `_solve_mixing` (D-24) adds a third copy of the per-edge direction logic (upstream port and pipe end by flow sign) next to the passes of `_propagate_properties`, also rebuilt on every call.

**Fix direction:** a cleanup. Build one port graph once per solver (like `edges_into` / `edges_out_of`), and use it for both the pressure groups and the temperature fill, so only the flow-dependent classification is done per call. Keep the two thresholds, but define them next to each other with the reason for each.

**Tests:** no behaviour change. `test_stagnant_branches.py` and `test_network_invariants.py` (warm start, also under the explore profile) must stay green; a mutation run on the merged walk confirms both uses are covered.

---

## D-35 Pipe drop off by ~5 Pa behind a stiff micro-flow edge

**Where:** `backend/simulation/solver.py`, hydraulic solve and reported pressures. Found by `tests/scenarios/test_network_invariants.py::test_pressure_is_continuous_and_falls_along_the_flow` under the explore profile while checking D-24 (2026-10-25); fails identically on the commit before the D-24 changes.

**What happens:** tank (1 m, 264.15 K) → centrifugal pump (20.1 L/min, 20.1 m rated) → linear control valve (Cv 1, 5 % open) → tank (1 m), ISO VG 150, pipes 1 m with ID e⁻² m. The valve passes 2.5e-8 m³/s at a 2.12 bar drop (laminar, about 8.5e12 Pa·s/m³). The pipe after it reports a 5.42 Pa drop, but its own drop at the reported flow and properties is 0.021 Pa; the test allows 5 Pa. Nothing is flagged stagnant, `max_residual` is 4.2e-7, the solve converges in 4 outer iterations.

**Likely cause (not confirmed):** at that stiffness a flow error of about 6e-13 m³/s, far below the solver's flow tolerances, is already 5 Pa. The reported port pressures follow each component's drop from the node pressures, so the pipe takes up what is left of the edge equation.

**Fix direction:** confirm by printing the edge residual in Pa. Then either scale the edge residual by the edge's own slope (pressure tolerance instead of flow tolerance) or report the pipe outlet pressure from its own drop. A second, separate observation from the same explore runs: one run of `test_network_invariants.py` took 88 minutes (the others 4 minutes); the slow example was not captured.

**Resolution (fixed):** not the edge residual: at the final state the residuals are at most 0.04 Pa. The valve's inlet and outlet pipes carry 2.542694e-8 and 2.542758e-8 m³/s (a node mass residual of 6.4e-13 m³/s, inside the flow tolerance). The solve evaluates the valve drop at the outlet edge's flow, the report evaluated it at the inlet port's flow; at 8.3e12 Pa·s/m³ that is 5.36 Pa, which the reported valve outlet pressure carried into the next pipe. The report now evaluates a node's drop at the flow leaving through its outlet, as the solve does; the pipe matches its own drop within the solve residual, and the valve's reported drop differs from its drop at the inlet flow by 2.5e-5 relative. The 88-minute run is not addressed.

---

## D-36 Junction enthalpy and outer loop at micro flows (explore)

**Where:** `test_junctions_conserve_energy` (`backend/tests/scenarios/test_network_invariants.py`), explore profile, seed `181318304813737089310484609464376911635`. Found while checking the mass balance change (D-22); both cases fail identically on the commit before it (8e5de77).

**What happens:** two generated `sae_10w30` networks:
1. 13 nodes, 14 edges (mixers, splitters, check valves, heat exchangers, two pressure sources, a tank): `success` but `properties_converged = false` after 100 outer iterations.
2. A mixer `n7` with inlet 0 feeding 2.2e-9 m³/s at 5 °C, the outlet feeding 9.4e-8 m³/s at 0 °C (reverse) and inlet 1 leaving at 0.104 °C: the enthalpy check fails (199 vs 0.058 J/kg). The flows are just above `Q_DEAD_LEG` (1e-9 m³/s).

The networks are saved in the session scratchpad only; rebuild them from the `@reproduce_failure` blobs of an explore run with that seed.

**Fix direction:** reproduce, pin both as `@example`s, then check whether the mixing at flows near `Q_DEAD_LEG` (`select_inward`, `_solve_mixing`) or the test's `MIXING_FLOW_TOL` is wrong.

