# Phase 1: Backend Physical Correctness

Scratch scripts (not in repo): `solve_examples.py`, `jac_check.py` in the session scratchpad; the one-off checks are reproduced inline below so they can be rerun.

---

## 1A. Solver core

**Commit:** `3e46a3b` · **Date:** 2026-10-13

### How the solver works (summary for later phases)

- Unknowns: one pressure per internal (non-boundary) node, plus one flow per edge. Tanks and pressure sources are fixed-pressure boundaries.
- Equations: mass balance per internal node (`5·(Qin−Qout)/1e-3`), plus one pressure balance per edge: `P_src_out(P_src, q) − P_tgt − ΔP_pipe(q) [− ΔP_tcv(q)] = 0`. The system is square (1.1 ✔). Flow sources pin their own pressure to atmospheric instead of a mass balance.
- Inner solve: sparse Newton with backtracking ([solver.py:594](../../backend/simulation/solver.py#L594)); fallback to SciPy `root(method='lm')`.
- Outer loop ([solver.py:196](../../backend/simulation/solver.py#L196)): fixed-point updates of regulator/RCV openings (P-control, gain 15 %/bar × damping) and TCV mix ratios, plus temperature/property propagation.
- Each node has ONE pressure (its inlet). Outlet pressure is `P_in − ΔP_node(q_edge)` per outgoing edge.

### Verified OK

- 1.1 Square system; mass balance and flow-source rows are correct; the regularisation `1e-9·x` is negligible (~2e-12 m³/s).
- 1.2 Analytical Jacobian matches finite differences for pipes, pumps, orifices, junctions and tanks on all examples (exceptions in F1-12). Newton uses the exact residual, so Jacobian errors only cost robustness, not accuracy.
- 1.5 Sparse Newton and LM agree (≤0.003 L/min, 0.0000 bar) wherever both converge (except API 682, see F1-01).
- 1.7 Warm start: for well-posed examples repeat runs are identical (Pressure_Regulation, Multi_PSV).
- 1.9 Reverse flow through an orifice between tanks solves correctly in sign and magnitude (detailed check in 1.25). Zero-flow singularities are avoided by clamping `dΔP/dq ≥ 100` on pipes.
- Valve Cv constant `K_CV_SI = 1.732e9`: hand derivation from Q[gpm] = Cv·√(ΔP[psi]/SG) gives 1.734e9 (0.1 % off), so `max_cv` is US Cv ✔.
- Throttling heat `ΔT = ΔP/(ρ·cp)` (valves, regulators, PSV) is correct for adiabatic liquid throttling ✔.
- Regulator/RCV setpoint is labelled bar(a) in the UI and compared to absolute port pressure ✔ (consistent).

### Findings

#### F1-01  Pressure-control outer loop is unstable; results depend on damping, iteration limit and click history (root cause of F0-01)
- **Severity: S1**
- Location: [solver.py:226-260](../../backend/simulation/solver.py#L226-L260), exit test [solver.py:339-357](../../backend/simulation/solver.py#L339-L357)
- Mechanism: `opening += damping · 15 %/bar · error`. The loop gain is `damping · 15 · |dP_sensed/d opening|`. For a valve, `ΔP ∝ 1/opening²`, so at small openings the sensitivity is large. Seal-flush BPR at 15 % open: about 0.58 bar/% → loop gain ≈ 2.2 > 2 → oscillation.
- Evidence (`Example_API_682_Seal_Flush`, PRV set 10 bar(a), BPR set 8 bar(a)):

  | damping | iteration limit | iterations used | PRV out [bar] / opening | BPR in [bar] / opening |
  |---|---|---|---|---|
  | 0.25 (default) | 100 | 100 | 8.83 / 70.0 % | 6.57 / 14.7 % |
  | 0.10 | 400 | 400 | 3.59 / 6.6 % | 8.54 / 17.1 % |
  | 0.05 | 1000 | 537 | 9.75 / 6.9 % | 7.93 / 16.7 % |
  | 0.02 | 3000 | 59 | 10.06 / 82.1 % | 7.86 / 17.3 % |

  Same diagram, first click vs second click (warm start): PRV out 8.831 → 8.791 bar.
- Additional: the "settled" exit test (`opening change < 0.05 %`) means the accepted setpoint error is `0.05/(15·damping)` bar: 0.013 bar at the default, but 0.17 bar at damping 0.02. Hitting the iteration limit still returns `success: True`. No `controls_converged` / `saturated` flag exists.
- The example itself is **over-constrained**: a positive-displacement pump fixes the flow, so the PRV cannot influence its own downstream pressure (the BPR sets it). The physically correct answer is PRV saturated wide open, BPR holding 8 bar(a). The solver should detect and report this rather than oscillate.
- Suggested fix: put each controller's setpoint into the Newton system as an extra equation with the opening as an unknown (bounded, with saturation by complementarity), or use a bracketed secant per controller. Report `controls_converged`, `saturated_controllers[]` in stats. Fix the example so it is well-posed.

#### F1-02  At the iteration limit the reported state is not a hydraulic solution (inconsistent pressures, negative absolute pressure)
- **Severity: S1**
- Location: [solver.py:359-361](../../backend/simulation/solver.py#L359-L361)
- Each outer iteration solves the hydraulics, then changes the openings. When the loop ends by limit, `_update_telemetry` recomputes outlet pressures with the **new** opening on the **old** flows.
- Evidence (API 682, default settings): BPR outlet −2.22 bar(a) while the return-line pipe ends at 1.14 bar(a). With damping 0.1: PRV outlet 3.59 bar(a), next node downstream 10.23 bar(a) (flow appears to run "uphill" by 6.6 bar).
- Suggested fix: never modify control positions after the last hydraulic solve that feeds telemetry (solve once more after the final update, or update before solving).

#### F1-03  "Forced Open" for PSV and rupture disc is offered in the UI but not implemented; it is solved as closed
- **Severity: S1**
- Location: [pressure_safety_valve.py:24](../../backend/simulation/equipment/pressure_safety_valve.py#L24), [rupture_disc.py:27](../../backend/simulation/equipment/rupture_disc.py#L27) (map anything except `forced_closed` to `auto`); [solver.py:1118-1131](../../backend/simulation/solver.py#L1118-L1131) (pass 1 forces all devices closed, only `auto` ones are reset afterwards); UI [SetupPanel.jsx:1104](../../frontend/src/components/panels/SetupPanel.jsx#L1104), [1170](../../frontend/src/components/panels/SetupPanel.jsx#L1170), [DataList.jsx:744](../../frontend/src/components/panels/DataList.jsx#L744)
- Evidence: `Example_Multi_PSV_Protection`, rupture disc set to `forced_open` → result `forced_state=forced_closed, status=intact, Q=0`. Identical results to `auto`.
- Even if `forced_open` were accepted, devices with a non-`auto` user state are never restored after pass 1, so they stay `forced_closed`.

#### F1-04  Pop-action PSV latches open at any pressure; blowdown is ignored; relieved-pressure KPI is non-physical
- **Severity: S1**
- Location: [pressure_safety_valve.py:60-67](../../backend/simulation/equipment/pressure_safety_valve.py#L60-L67) (`_was_open` latch), `blowdown_pct` parsed but never used
- Evidence: `Example_Multi_PSV_Protection`: primary PSV set 20 bar(a) reports `cracked`, 115.5 L/min, with **inlet pressure 1.80 bar(a)**. KPI `relieved_pressure_bara = 1.92`. A real pop-action valve reseats at set·(1−blowdown) ≈ 18.6 bar(a). In steady state the honest answer is "valve cycles / chatters (oversized relief)" or the valve modulating near set pressure, not wide open at 1.8 bar.
- Suggested fix: steady-state PSV model = closed below set, open with a lift curve between set and set+overpressure (like `modulating`), and flag `chatter_risk` when the open-valve equilibrium lies below the reseat pressure. Detailed review in 1.29.

#### F1-05  TCV path pressure drop in the solver ignores viscosity; telemetry uses it (inconsistent, flow split wrong)
- **Severity: S2**
- Location: [solver.py:724](../../backend/simulation/solver.py#L724) calls `calculate_path_dp(q, ρ, port)` without viscosity → default 0.001 Pa·s (water). Telemetry [three_way_tcv.py:100](../../backend/simulation/equipment/three_way_tcv.py#L100) passes the real viscosity.
- Evidence (`Example_API_614_LOS`, ISO VG oil):

  | Case | Port | ΔP used by solver | ΔP with real viscosity |
  |---|---|---|---|
  | Base | 0 (280 L/min) | 0.668 bar | 0.794 bar |
  | Cold start 10 °C | 1 (430 L/min) | 0.491 bar | 0.766 bar |
  | Cold start 10 °C | 0 (0.4 L/min) | 0.524 bar | 1.751 bar |
  | TCV failed open | 1 (2.4 L/min) | 1.013 bar | 1.497 bar |

- Fix: pass `tgt_node.inlets[port_idx].viscosity` (one-line).

#### F1-06  Absolute 10 Pa residual tolerance creates phantom flows in low-loss sections; user tolerance cannot tighten it
- **Severity: S2**
- Location: [solver.py:750](../../backend/simulation/solver.py#L750) `residual_tolerance = max(1e-4, 10·tol)` in scaled units (1e-4 × 1e5 Pa = 10 Pa). A user tolerance below 1e-5 has no effect.
- Evidence: two tanks at equal level joined by 10 m of pipe (exact answer Q = 0):

  | Pipe | Level difference | Solver Q | Exact Q |
  |---|---|---|---|
  | DN50 | 0 | 4.68 L/min | 0 |
  | DN200 | 0 | **150.0 L/min** | 0 |
  | DN200 | 10 mm | 851.6 L/min | 846.2 L/min |
  | DN50 | 10 mm | 20.27 L/min | 20.06 L/min |

- Affects flow distribution in headers, manifolds, balance lines and large-bore parallel branches.
- Fix: converge on a relative criterion, or on the Newton step size (|Δq| relative to the flow scale) in addition to the residual; honour the user tolerance.

#### F1-07  Physically impossible states (negative absolute pressure) are reported as converged
- **Severity: S2**
- Location: `is_physical` [solver.py:732-740](../../backend/simulation/solver.py#L732-L740) rejects only P < −1 bar(a) and only gates the Newton branch; the LM fallback result is never checked. There is no global diagnostic for P < P_vapor outside pump suctions.
- Evidence: tank → 30 m × 15 mm suction → PD pump 100 L/min: `success True`, suction **−23.1 bar(a)** (water), **−43.8 bar(a)** (ISO VG 46). Only `cavitation_warning` is set on the pump.
- Oils have `vapor_pressure: negligible`, so the pump check `P < 1.2·P_vap` only fires once P < 0.
- Fix: in the outcome stats add `physical_validity` with every port below P_vapor (or below ~0.1 bar(a) for oils), surfaced as an error-level banner in the UI. A PD pump starving should be reported as infeasible.

#### F1-08  "Peak pressure" KPI is an ad-hoc interpolation (a transient concept in a steady-state solver) and mixes absolute with differential pressure
- **Severity: S2**
- Location: [solver.py:1185-1245](../../backend/simulation/solver.py#L1185-L1245)
- `peak = P_min + S·(P_max − P_min)` with `S = set_pressure(absolute) / (P_in − P_out)(differential)`. There is no physical basis, and AGENTS.md says the solver is steady-state only. Example: Multi_PSV `peak_pressure_bara = 21.18`.
- Suggested fix: remove it, or replace it with clearly defined steady-state quantities (P at each relief device inlet at set and at relieving conditions).

#### F1-09  Relief-device set pressure: absolute vs differential used inconsistently; the bar(a) convention is unusual
- **Severity: S2** (to quantify in 1.29)
- Status/latching and the sequential-relief breach check use **absolute** inlet pressure ≥ set ([pressure_safety_valve.py:62](../../backend/simulation/equipment/pressure_safety_valve.py#L62), [solver.py:1149](../../backend/simulation/solver.py#L1149)). The closed-valve complementarity residual uses **differential** `P_in − P_out` vs set ([pressure_safety_valve.py:137-145](../../backend/simulation/equipment/pressure_safety_valve.py#L137-L145)); the Jacobian for rupture discs does the same with burst pressure ([solver.py:507](../../backend/simulation/solver.py#L507)). With an atmospheric outlet, the two disagree by ~1 bar.
- Industry practice (API 520 / ISO 4126) states set pressure in **gauge**. The UI asks for bar(a) ([SetupPanel.jsx:1053](../../frontend/src/components/panels/SetupPanel.jsx#L1053), [1113](../../frontend/src/components/panels/SetupPanel.jsx#L1113)), so users entering datasheet values get valves that open ~1 bar early.

#### F1-10  Islands without a pressure reference are silently dropped and reported as success
- **Severity: S2** (mainly UX)
- Location: `prune_topology` [solver.py:53-119](../../backend/simulation/solver.py#L53-L119)
- Evidence: closed loop pump + valve without a tank → `success True`, both nodes pruned, shown at atmospheric pressure with zero flow. A frequent user mistake should give a clear message: "Circuit X has no tank or pressure source; its pressure level is undefined."

#### F1-11  LM solver option / fallback unreliable
- **Severity: S3**
- `solver_method = 'lm'` fails on 3/10 examples (Multi_PSV, Pump_Comparison, walflow-diagram (8)) that Newton solves. The fallback restarts from the original guess and is not checked by `is_physical`.

#### F1-12  Analytical Jacobian inaccurate for TCV, valves and PSV (robustness only)
- **Severity: S3**
- Max relative deviation from finite differences at the converged state: TCV path `d/dq` up to 3.5× (cold oil, also F1-05); valves/regulators ~13 % (`dFr/dq` of the viscosity correction omitted); PSV complementarity rows: analytic 2 vs FD 0 (Jacobian derived for a different function than the residual).

#### F1-13  Telemetry and temperature transport assume port 0
- **Severity: S3** (latent)
- [solver.py:991](../../backend/simulation/solver.py#L991), [993](../../backend/simulation/solver.py#L993), [1026](../../backend/simulation/solver.py#L1026), [1030](../../backend/simulation/solver.py#L1030) use `outlets[0]` / `inlets[0]` instead of the edge's port index. Today this only affects TCV inlet-1 pipe telemetry and reverse flow. It becomes a real bug with any future multi-port equipment (e.g. a two-sided heat exchanger).

#### F1-14  Warm-start cache is global, shared across users, unsynchronised, and makes results history-dependent
- **Severity: S2**
- Location: class-level `_warm_start_cache` [solver.py:28](../../backend/simulation/solver.py#L28), written from `asyncio.to_thread` workers ([main.py:193](../../backend/main.py#L193)) without a lock. Concurrent iteration ([solver.py:410](../../backend/simulation/solver.py#L410)) and eviction ([solver.py:780](../../backend/simulation/solver.py#L780)) can raise `RuntimeError: dictionary changed size during iteration`. Users who open the same example share entries.
- For non-unique problems (F1-01, PSV latch F1-04) the answer depends on the previous run (8.831 vs 8.791 bar).
- `warm_start_status` reports the last of several internal solves (confirms F0-06).

#### F1-15  Outer loop returns success when temperature/property iteration hit the limit
- **Severity: S3**
- Location: [solver.py:356-366](../../backend/simulation/solver.py#L356-L366). Without controllers, the loop needs `properties_converged`; at the limit it still reports success with no flag. `walflow-diagram (8)` "20° Start" uses 92 of 100 iterations.

---

## 1D. Cross-cutting physics

**Date:** 2026-10-13 · Scripts: scratchpad `benchmarks.py` (independent reference models) plus the inline checks below.

### 1.44 Independent benchmarks: the core flow models are accurate

References implemented from first principles, not copied from WalFlow: Colebrook-White (iterated), Churchill (1977), ISO 5167-2:2022 Reader-Harris/Gallagher corner taps with §5.4 permanent loss, a parallel network solved with `fsolve`, and a pump/system intersection by `brentq`. Fluid properties are taken from WalFlow so that only the flow models are compared (properties are checked in 1B).

| Benchmark | Quantity | WalFlow | Reference | Error |
|---|---|---|---|---|
| B1a water DN100, 100 m, Δh 10 m (Re 344 000) | Q vs Colebrook | 1656.1 L/min | 1661.5 | −0.33 % |
| B1a | Q vs Churchill | 1656.1 | 1656.1 | 0.00 % |
| B1b water DN25, 50 m, Δh 0.05 m (Re 2836, transition) | Q vs Colebrook | 4.07 | 3.56 | **+14.3 %** |
| B1b | Q vs Churchill | 4.07 | 3.66 | **+11.4 %** |
| B1c VG46 40 °C DN25 (Re 422, laminar) | Q | 23.968 | 23.968 | 0.00 % |
| B1d water DN50, ε 0.5 mm (Re 70 000) | Q vs Colebrook | 173.5 | 174.2 | −0.41 % |
| B2 parallel DN80 / DN50 | Q branch A / B | 1851.4 / 514.0 | 1857.4 / 516.0 | −0.32 / −0.37 % |
| B3 pump + 24 m static lift | Q operating | 323.3 | 324.1 | −0.23 % |
| B3 | pump ΔP | 3.871 bar | 3.867 | +0.11 % |
| B4 orifice β 0.39 / 0.45 / 0.59 | Q | 482.5 / 58.05 / 1022.7 | 482.5 / 58.06 / 1022.9 | ≤ 0.03 % |

The Swamee-Jain approximation is within 0.4 % of Colebrook (its known accuracy). Laminar flow and the ISO 5167 orifice are exact. The only deviation is the laminar-turbulent transition (F1-21).

### 1.40 / 1.41 Units and pressure references

- Internally everything is SI with **absolute** pressures. Tanks use `P_atm + ρg(z+h)` with the global atmospheric pressure ✔.
- UI input labels explicitly mark (a) vs (d) and are consistent with the backend: pump rated ΔP (d), source (a), regulator setpoint (a), PSV / rupture disc (a, see F1-09), check valve cracking (d), HX / filter ΔP (d), calibrated restriction base pressures (a) ✔.
- Field naming in node data is inconsistent (F1-20); a field-by-field frontend ↔ backend matrix is item 2.1.

### 1.42 Energy balance

Closed balance over each example: enthalpy rise of the boundary flows + pressure-energy change vs pump shaft power (Q·ΔP/η) − cooler duty.

| Example | ΔH thermal | Δ(Q·P) | Shaft | Cooler | Imbalance |
|---|---|---|---|---|---|
| GreetingCanvas | 0.65 kW | 0.00 | 2.23 | 0 | **−1.58 kW (−71 %)** |
| Pump_Comparison | 0.52 | −0.05 | 2.15 | 0 | **−1.67 kW (−78 %)** |
| Thermal_Management | −84.73 | −0.04 | 3.02 | 85.33 | −2.46 kW (−2.9 %) |
| Chilled_Water_Loop | −141.00 | −0.86 | 6.85 | 144.65 | −4.05 kW (−2.8 %) |
| API_614_LOS | −221.26 | −0.23 | 11.87 | 227.42 | −5.94 kW (−2.6 %) |

Root cause: F1-16. Pump waste heat `ΔT = ΔP/(ρcp)·(1−η)/η` and pipe friction heat are correct (checked to 0.1 mK).

### 1.43 Thermal propagation

Gauss-Seidel sweep over edges then nodes, up to `property_iterations` (default 5), stops at 0.01 K. Temperatures follow flow direction and mixers mass-weight correctly. Note: the solver conserves **volumetric** flow at nodes while density varies with temperature (≈1 % mass error across a 15 K oil cooler). This is the usual incompressible assumption; document it.

### 1.45 Operating cases

Node overrides are a shallow merge on node `data` ✔; global overrides are applied by `setattr` only when the snake_case attribute exists. In the examples, cases override `temperature`, `clogging`, `opening`, `active`, `set_temperature_c` and `ambient_temperature` (the last is only used by the air-cooled heat exchanger). See F1-22.

### Findings

#### F1-16  Throttling heat is erased in control valves, regulators, check valves and PSVs
- **Severity: S2** (thermal results too cold; energy not conserved)
- Location: these classes set `outlet.temperature = inlet + ΔP/(ρcp)` and then call `self.calculate_temperature()` ([base_node.py:40-75](../../backend/simulation/equipment/base_node.py#L40-L75)), which overwrites every outward port with the inlet temperature. Affected: [linear_control_valve.py](../../backend/simulation/equipment/linear_control_valve.py), [linear_regulator.py](../../backend/simulation/equipment/linear_regulator.py), [remote_control_valve.py](../../backend/simulation/equipment/remote_control_valve.py), [check_valve.py](../../backend/simulation/equipment/check_valve.py), [check_valve_orifice.py](../../backend/simulation/equipment/check_valve_orifice.py), [pressure_safety_valve.py](../../backend/simulation/equipment/pressure_safety_valve.py), [rupture_disc.py](../../backend/simulation/equipment/rupture_disc.py) (same pattern).
- Evidence: single component between tanks, water, ΔP ≈ 5.79 bar: expected ΔT 138 mK. Orifice, filter and calibrated restriction give 138 mK ✔; control valve, regulator, RCV, check valve, check valve + orifice and PSV give **0.00 mK**. Energy balance table above: 71–78 % of pump power is missing as heat in uncooled circuits.
- `test_throttling_heat.py` only tests the orifice, and only asserts `dt > 0`.
- Fix: do not call `calculate_temperature()` after setting the outlet temperature (or make it skip ports already set); add a magnitude test for every restriction type.

#### F1-17  No elevation for equipment or pipes; no fitting, entrance or exit losses
- **Severity: S2** (model limitation that users will not expect)
- Only tanks have an elevation. Every other component sits at datum 0, so pressures shown at elevated equipment are datum pressures. Suction lift, NPSH at an elevated pump and siphons cannot be modelled. The frontend converts `inlet_elevation` / `outlet_elevation` ([UnitContext.jsx:197](../../frontend/src/context/UnitContext.jsx#L197)), but nothing sets or uses them.
- The pipe model is straight-pipe Darcy-Weisbach only: no ΣK for elbows, tees and valves, and no tank entrance loss or velocity head at tank outlets (≈1.5·ρv²/2; 0.07 bar at 3 m/s, which matters for NPSH).
- Fix: at minimum, document this in the in-app help; better, add pipe ΔZ and a fittings ΣK (or equivalent length) per pipe.

#### F1-18  Centrifugal pump: curve in pressure not head, efficiency fixed at 0.75, a stopped pump is a zero-resistance passage
- **Severity: S2**
- [centrifugal_pump.py:21-38](../../backend/simulation/equipment/centrifugal_pump.py#L21-L38): `ΔP = P_shutoff + C·Q²` independent of density. A real pump delivers head; ΔP should scale with ρ (fluid changes, hot/cold oil: VG46 ρ changes ~2 % per 30 K; water ↔ glycol ~5–8 %).
- [graph_parser.py:211](../../backend/simulation/graph_parser.py#L211) never passes `efficiency`, so pump heat and power always use η = 0.75.
- `active = False` returns ΔP = 0 ([centrifugal_pump.py:35](../../backend/simulation/equipment/centrifugal_pump.py#L35)), i.e. the stopped pump becomes a frictionless pipe. In `Example_Parallel_Pumps` with pump B off, 20.5 L/min flows backwards through it. That flow is limited only by the bypass orifice, and the Newton solve failed, so the LM fallback result with negative pump flow was accepted (F1-11).
- No viscosity correction (HI 9.6.7) for viscous oils. Full review in 1.23.

#### F1-19  Filter clean ΔP is implicitly referenced to water
- **Severity: S2**
- [filter.py](../../backend/simulation/equipment/filter.py) `get_resistance_k` uses ρ_ref = 1000; `calculate_delta_p` multiplies by the actual ρ and a viscosity factor. In oil at the reference flow the model does not return the user's ΔP:

  | Fluid | μ | Entered ΔP_clean | Model ΔP at Q_ref |
  |---|---|---|---|
  | water 20 °C | 1.0 mPa·s | 0.15 bar | 0.150 (100 %) |
  | VG46 40 °C | 38.9 mPa·s | 0.15 bar | 0.236 (**157 %**) |
  | VG46 40 °C | 38.9 mPa·s | 0.50 bar | 0.624 (125 %) |
  | VG46 10 °C | 215 mPa·s | 0.15 bar | 0.720 (480 %) |

- Oil filter datasheets give ΔP for the oil at a stated viscosity. Fix: add a reference viscosity (default: system fluid at design temperature) and scale relative to it.

#### F1-20  Inconsistent unit conventions in node data
- **Severity: S3** (error-prone; frontend contract checked in 2.1)
- Examples: `set_pressure` in Pa vs `set_pressure_bar` / `source_pressure_bara` in bar; `flow_rated` (L/min, volumetric pump) vs `flow_rated_lmin` (centrifugal); tank `temperature` in K vs `set_temperature_c` in °C; `orifice_diameter` in m.

#### F1-21  Laminar-turbulent transition uses a linear blend
- **Severity: S3** (document)
- Re 2000–4000: +11 to +14 % flow vs Colebrook/Churchill (B1b). Transition is inherently uncertain, but users should be told; consider Churchill (continuous) instead.

#### F1-22  Case-variable list contains fields the backend ignores
- **Severity: S3**
- [case_constants.js:13-26](../../frontend/src/constants/case_constants.js#L13-L26): `speed_rpm` and `flow_demand` have no backend counterpart (no VFD model). Global overrides are silently dropped unless the key matches a snake_case `GlobalSettings` attribute ([graph_parser.py:47-50](../../backend/simulation/graph_parser.py#L47-L50)).

#### F1-23  Hidden per-tank fluid
- **Severity: S3**
- The backend honours a tank-level `fluid_type` ([graph_parser.py:193](../../backend/simulation/graph_parser.py#L193)), but the UI cannot show or edit it, and pipes and valves recompute properties from the global fluid. `Example_API_682_Seal_Flush` has a hidden VG32 tank in a VG46 system.

#### F1-24  Flow source silently saturates at 200 bar
- **Severity: S3**
- [flow_source.py](../../backend/simulation/equipment/flow_source.py) `_HARD_CAP_PA = 20 MPa`: above that the delivered flow drops without a warning, and the derivative becomes 0 (singular Jacobian).

## 1B. Fluid properties and Re-dependent factors

**Date:** 2026-10-13 · Script: scratchpad `props_check.py`, run in a separate venv with CoolProp 8.0 (project venv untouched).

**References:** IAPWS-95 / IAPWS 2008 (water, CoolProp); CoolProp INCOMP `MITSW` (seawater, Sharqawy 2010), `MEG` / `MPG` (glycols, Melinder 2010); Raoult's law for glycol vapor pressure; ISO 3448 (VG ±10 % at 40 °C); ASTM D341 Walther line through ν40 = VG and a typical VI ≈ 100 ν100 (±5 %); Cragoe (NBS Misc. Pub. 97) for oil cp; EN 590, ASTM D3699, DEF STAN 91-091, EN 228, SAE J300, IEC 60296 for fuel and specialty-oil limits; IEC 60534-2-1:2011 §6 for valve Fr (globe, FL 0.9, Fd 0.46); Wuest laminar orifice law Cd = 0.2·√Re_d (as cited in [EUROSIM 2001](https://eurosim.info/fileadmin/user_upload_eurosim/EUROSIM_OA/Congress/2001/pdf/012.pdf)).

### How properties are modelled ([fluid_utils.py](../../backend/simulation/fluid_utils.py))

| Property | Model | Units |
|---|---|---|
| Density | linear: ρ_ref·(1 − α(t − t_ref)) | kg/m³ |
| Viscosity | water: 2.414e-5·10^(247.8/(T−140)); others: Vogel ν = exp(a + b/(t + 120)) in cSt, × ρ → Pa·s | Pa·s ✔ |
| cp | base + slope·t | J/(kg·K) |
| Vapor pressure | water Antoine (two ranges) × scale; gasoline = n-heptane Antoine; others 1 Pa | Pa |
| Thermal conductivity | not used anywhere | – |

Unit handling is correct: cSt × 1e-6 × ρ = Pa·s, telemetry carries Pa·s and the frontend (`GenericDetails.jsx:114`, `OrificeDetails.jsx:68`) treats it as Pa·s ✔. Vapor pressure is used only by the pump cavitation flag (centrifugal and volumetric).

### Results

**Water (vs IAPWS):** viscosity within 2 % (0–150 °C), vapor pressure within 0.9 %, cp within 1 % up to 100 °C ✔. Density is linear: +0.2 % at 20 °C, +1.7 % at 80 °C, +2.7 % at 100 °C, +6.2 % at 150 °C (F1-30).

**ISO VG oils (ISO 3448 and ASTM D341 Walther):** every grade's ν40 is inside the ISO band ✔, but VG32 sits on the lower limit (28.9 cSt; band 28.8–35.2). Error vs Walther:

| Grade | −10 °C | 0 °C | 20 °C | 40 °C | 60 °C | 100 °C |
|---|---|---|---|---|---|---|
| VG15 / 22 | −15 / −16 % | −10 / −11 % | −4 % | 0 % | +1 % | 0 / −2 % |
| VG32 | −11 % | −10 % | −8 % | −10 % | −13 % | **−22 %** |
| VG46 | −15 % | −10 % | −4 % | −2 % | −3 % | −9 % |
| VG68 / 100 / 150 / 220 | **−22 to −28 %** | −17 to −21 % | −7 to −8 % | 0 % | +3 to +4 % | 0 to +2 % |

Density and α (0.0007 /K) are typical for mineral oils ✔. cp is +4 to +5 % vs Cragoe (acceptable).

**Aqueous solutions (vs CoolProp INCOMP):** density within 1.5 % ✔.

| Fluid | ν error | cp error | Pv scale vs Raoult |
|---|---|---|---|
| Seawater | −25 % at 0 °C, −1 % at 20 °C, **+44 % at 60 °C, +63 % at 80 °C** | ≤ 1 % | 0.98 ✔ |
| EG 30 % | +11 to +16 % | 0 to −6 % | 0.90 vs 0.89 ✔ |
| EG 50 % | +1 to +16 % | +9 % (−30 °C) to −8 % (80 °C) | 0.70 vs 0.78 |
| PG 50 % | **−22 % at 0 °C, −33 % at −20 °C, −35 % at −30 °C** | +3 to −8 % | 0.60 vs 0.81 |

**Fuels and specialty oils vs specifications:** diesel, kerosene, Jet A-1, gasoline density, SAE 10W-30 / 15W-40, transformer oil and crude API gravities all fall inside their specification limits ✔. The exception is gasoline vapor pressure (F1-27). Fuel cp has zero slope (−9 to −10 % at 100 °C).

**Valve viscosity factor Fr vs IEC 60534-2-1:** for Cv 4–160 and ν 1–1000 cSt, the ΔP ratio (Fr_IEC/Fr_WF)² is 0.70–1.74, and within ±12 % for ν ≤ 30 cSt. This is acceptable for a simplified model. Notes:
- The valve Re uses an assumed throat d_v = 0.01·√Cv m.
- Fr → 0.5 as Re → 0, whereas IEC goes to 0, so the `max(0.4, …)` clamp is dead code.
- See F1-32.

**Orifice Cd (classic, shared):** see F1-25.

**Filter / HX viscosity factor:** 1 + 100/Re is continuous at Re 2000 and 4000 ✔. Its laminar asymptote gives ΔP ∝ μ·Q, which is the right Darcy behaviour for porous media. However, the crossover is set by a fixed 1 mm pore (filter) or 10 mm channel (HX) and an area derived from the clean ΔP, not by a property of the element (see F1-19).

**Continuity:** the water Antoine coefficients switch at 100 °C, giving a +0.55 % step (101 333 → 101 893 Pa).

### Findings

#### F1-25  Classic orifice Cd correlation is far too low at low Reynolds number; pressure drop over-predicted up to ~27×
- **Severity: S2** (wrong ΔP in viscous / small-bore service)
- Location: [fluid_utils.py:262-272](../../backend/simulation/fluid_utils.py#L262-L272) `Cd = 0.6/√(1 + 250/Re_d)`, floor 0.05. Used by `calibrated_restriction` (orifice model), `check_valve_orifice`, `rupture_disc` (orifice mode) and `orifice` with `standard = classic_cd`. Examples: Multi_PSV_Protection, Parallel_Pumps.
- Comparison with the Wuest laminar law (0.2·√Re_d), capped at 0.61:

  | Re_d | 10 | 30 | 100 | 300 | 1000 | 3000 |
  |---|---|---|---|---|---|---|
  | Cd WalFlow | 0.12 | 0.20 | 0.32 | 0.44 | 0.54 | 0.58 |
  | Cd reference | 0.61 | 0.61 | 0.61 | 0.61 | 0.61 | 0.61 |
  | ΔP WalFlow / ref | 27× | 9.7× | 3.6× | 1.9× | 1.3× | 1.1× |

  Measured sharp-orifice Cd even peaks above 0.61 (≈ 0.7) for Re_d ≈ 100–1000, so the real error is larger.
- Typical case: a 3 mm lube-oil restriction orifice in VG46 at 50 °C has Re_d ≈ 1000 (+30 % ΔP). The same orifice at cold start has Re_d ≈ 100 (≈ 3.6× ΔP).
- The calibrated restriction calibrates K at the base point with the same Cd, so the error partly cancels there, but it reappears when temperature or flow move away from the base point.
- Suggested fix: use a published low-Re correlation that blends the Wuest laminar law into the turbulent Cd (for example, Cd = Cd_t·tanh(0.2·√Re/Cd_t)), and limit the ISO 5167 mode to its validity range (handled in 1C).

#### F1-26  Mineral-oil viscosity too low when cold; VG32 coefficients inconsistent
- **Severity: S2** (non-conservative for cold start: pump suction, filter and line ΔP under-predicted)
- Location: [fluid_utils.py:66-213](../../backend/simulation/fluid_utils.py#L66-L213). All Vogel fits use a fixed c = 120 °C, which flattens the curve below 40 °C.
- vs ASTM D341 (the standard method for petroleum oils): −17 to −28 % at 0 to −10 °C for VG68–220, and −10 to −16 % for VG15–46.
- VG32 (`a=-3.7, b=1130`, rounded hand values) gives ν40 = 28.9 cSt (at the ISO lower limit) and ν100 = 4.2 cSt, the same as VG22, which is −22 % at 100 °C. VG46 (`a=-3.5, b=1170`) is −9 % at 100 °C. The other grades have 4-decimal fitted values.
- No grade gives a cold limit or pour point: VG220 at −30 °C gives 237 000 cSt (see F1-31).
- Suggested fix: compute ν from the Walther equation using ν40 and ν100 (or VI) per grade, optionally user-editable for a specific product datasheet.

#### F1-27  Gasoline vapor pressure modelled as n-heptane: 4–8× too low
- **Severity: S2** (cavitation check non-conservative for the most volatile fluid in the catalog)
- Location: [fluid_utils.py:327-334](../../backend/simulation/fluid_utils.py#L327-L334).
- WalFlow gives 11.2 kPa at 37.8 °C. EN 228 DVPE is 45–90 kPa, and true vapor pressure is higher still. n-Pentane would give 107 kPa.
- "Negligible" (1 Pa) is also non-conservative for light crude (RVP typically 20–70 kPa, which matters for suction). For kerosene, jet fuel and diesel the effect is small: n-decane is 1.5 kPa at 60 °C and 9.6 kPa at 100 °C.
- Suggested fix: a TVP(RVP, T) correlation (API MPMS 19.2 / Nelson) with a user RVP. As a minimum, set gasoline to a representative 60 kPa RVP blend, and give light crude a finite value.

#### F1-28  Cavitation check is a boiling check, not an NPSH check; valves and orifices are not checked at all
- **Severity: S2** (users will rely on the "cavitation" flag)
- Location: [centrifugal_pump.py:54-63](../../backend/simulation/equipment/centrifugal_pump.py#L54-L63), [volumetric_pump.py:115-123](../../backend/simulation/equipment/volumetric_pump.py#L115-L123).
- The flag is raised only when `P_inlet < 1.2·Pv`. For water at 20 °C that means below 0.028 bar(a), which is nearly a full vacuum. Real pumps need NPSHa > NPSHr (typically 1–5 m, i.e. 0.1–0.5 bar above Pv, plus margin per HI 9.6.1 / API 610), and there is no NPSHr input.
- Throttling devices (control valves, regulators, orifices) are not checked for flashing or choked flow (IEC 60534 FL, Pv). Together with F1-07, a valve outlet below vapor pressure is reported as a valid solution.
- Suggested fix:
  - Report NPSHa = (P_in − Pv)/(ρg) at every pump.
  - Add an optional NPSHr input and warn when NPSHa < NPSHr + margin.
  - Flag any node with P < Pv.
  - Add an IEC 60534 choked-flow check for valves.
- Follow-up: 1.21 (pump), 1.24 (valves).

#### F1-29  Aqueous solution viscosity and cp: large errors away from 20 °C
- **Severity: S3** (S2 for PG 50 % in cold service)
- Seawater ν is +44 % at 60 °C and +63 % at 80 °C, and −25 % at 0 °C: the single c = 120 Vogel fit is only good near 20 °C.
- PG 50 % ν is −22 to −35 % below 0 °C, which under-predicts cold-start ΔP in glycol loops.
- EG 50 % cp runs from +9 % (−30 °C) to −8 % (80 °C) because cp is held constant.
- The Pv scale for PG 50 % (0.60) is lower than Raoult (0.81). This is slightly non-conservative for cavitation.
- Suggested fix: tabulated data (ASHRAE / Melinder) with interpolation, or CoolProp INCOMP as a dependency.

#### F1-30  Water density linear in temperature; Antoine step at 100 °C
- **Severity: S3**
- Errors vs IAPWS: +1.7 % at 80 °C, +2.7 % at 100 °C, +6.2 % at 150 °C. The reference of 1000 kg/m³ at 20 °C is 0.2 % high. This feeds tank static head, mass flow and the ρcp of the heat balance.
- The vapor-pressure step at 100 °C is 0.55 %. cp is constant (−2.9 % at 150 °C).
- Suggested fix: a Kell (1975) polynomial for density, and a single Wagner–Pruss / IAPWS-IF97 saturation curve.

#### F1-31  No validity ranges; silent extrapolation and silent fallback for unknown fluids
- **Severity: S3**
- No fluid has a temperature range.
  - Water is treated as liquid at 150 °C at any pressure, with only the pump flag checking saturation.
  - Oils are computed below the pour point (VG220 at −30 °C = 237 000 cSt).
  - Oil density is linear up to any temperature (700 kg/m³ at 300 °C).
- An unknown `fluid_type` (for example a renamed id in an old file) silently returns ρ = 1000, μ = 1 mPa·s, cp = 2000 J/(kg·K), and water Pv. The cp default is inconsistent with the other water values.
- The UI never displays the density, viscosity or cp in use, so users cannot sanity-check the fluid (Phase 3, 3.12). The HelpInfoModal fluid list (`HelpInfoModal.jsx:329`) is outdated.
- Suggested fix: add `t_min` / `t_max` per fluid and raise a warning when exceeded; reject unknown ids with an error; show a property table for the selected fluid at operating temperature.

#### F1-32  Valve viscosity correction is a simplified substitute for IEC 60534-2-1
- **Severity: S3** (document)
- ΔP lies within 0.70–1.74× of IEC for ν up to 1000 cSt and within ±12 % for ν ≤ 30 cSt. The deviations come from:
  - the Reynolds number using the assumed throat d_v = 0.01·√Cv m instead of IEC Re_v with Fd and FL;
  - Fr tending to 0.5, not 0, in laminar flow;
  - a dead `max(0.4, …)` clamp.
- Acceptable for a screening tool. State this in the help, and consider the IEC form if viscous valve sizing is a use case.

## 1C. Equipment models

**Date:** 2026-10-13 · Scripts: scratchpad `pumps_check.py` (scenarios S1–S6), `equip_check.py`.

### 1.20 pipe.py ✔ (with F1-17, F1-21)
- Darcy-Weisbach with Swamee-Jain is verified against Colebrook in B1 (within 0.4 %). Laminar 64/Re and its derivative 32μL/(D²A) are exact ✔.
- Friction heating ΔT = |ΔP|/(ρcp) goes in the flow direction ✔. Pipes are edges, so base_node does not overwrite this heat (unlike F1-16).
- The turbulent and blended derivatives omit df/dRe and dw/dRe. This only affects the Jacobian (≈5–15 % low, within F1-12) and not the results.
- At Q = 0 the derivative is 0 instead of the laminar limit 32μL/(D²A). A dead leg therefore gives a zero Jacobian column, which helps explain the zero-flow tolerance issues in F1-06. S3, merged into F1-12.

### 1.21 tank.py ✔ (with notes)
- P = P_atm(global) + ρg(z + h) at the tank bottom ✔, using the tank's own fluid and temperature (F1-23).
- **All ports are at bottom pressure.** A return line entering above the liquid (the usual case for reservoirs) should discharge at ≈ P_atm. Instead it sees an extra ρg(z + h) of back-pressure, 0.2–0.5 bar for a 2–5 m tank. There is no nozzle-height input. → F1-33.
- The tank is an infinite heat sink at its set temperature: return temperatures are discarded. This is valid for steady state, but the help should say so (it is why closed loops "balance" in 1.42).
- g = 9.81 rather than 9.80665 (0.03 %, negligible).

### 1.22 pressure_source.py / flow_source.py ✔
- The pressure source clamps all ports to P_set (absolute) and the temperature ✔. It matches its `.md`.
- The flow source is a penalty spring of 100 bar per 1 % flow error, so the delivered flow is low by (ΔP / 100 bar) % (S6: 49.96 of 50 L/min at 8 bar). This is acceptable. The `.md` says "converge to the exact flow rate", which should be reworded. Saturation at 200 bar is already F1-24.

### 1.23 centrifugal_pump.py (complements F1-18, F1-28)
- ΔP = P₀ + C·Q² is symmetric in Q. With reverse flow through a **running** pump, ΔP falls below shut-off, whereas real pumps produce more than shut-off ΔP in that region (quadrant II).
  - S1 (two pumps in parallel with no check valves, A 6 bar and B 3 bar): B runs backwards at **−71 L/min** with ΔP = 3.57 bar (< 3.6 bar shut-off), and A over-delivers to 521 L/min. A real B would be dead-headed (Q ≈ 0). → F1-34.
- Waste heat ΔT = ΔP/(ρcp)·(1−η)/η ✔ (hydraulic power is later dissipated in pipes and valves, but see F1-16).
- KPI power = Q·ΔP/η ✔ (with η fixed at 0.75, F1-18).

### 1.24 volumetric_pump.py
- The model is a stiff spring (100 bar per 1 % below rated flow), a motor-power hyperbola ΔP ≤ P·η/Q, and a 200 bar cap. Reverse flow is blocked like a check valve and an inactive pump blocks flow ✔. Continuity at Q = 0 ✔. Waste heat matches the centrifugal pump ✔.
- No slip and no viscosity effect (an ideal pump); document this.
- Findings: F1-35 (flow above displacement), F1-36 (silent power limit, KPI).

#### F1-33  Tank return lines see bottom pressure; no nozzle elevation
- **Severity: S3**
- Location: [tank.py:39-46](../../backend/simulation/equipment/tank.py#L39-L46).
- Every port gets P_atm + ρg(z + h). A top-entry return line therefore has an extra back-pressure of ρg(z + h) (0.4 bar for a tank at z = 3 m with h = 2 m), and a suction nozzle above the bottom over-states NPSHa.
- Suggested fix: add an optional nozzle height per port. If the nozzle is above the liquid level, use P = P_atm (free discharge).

#### F1-34  Centrifugal pump curve is symmetric for reverse flow (running pump)
- **Severity: S3** (S2 for parallel pumps without check valves)
- Location: [centrifugal_pump.py:31-44](../../backend/simulation/equipment/centrifugal_pump.py#L31-L44).
- In S1 the weaker pump runs backwards at −71 L/min with ΔP below its shut-off pressure, and the stronger pump over-delivers. Real behaviour is dead-head near zero flow.
- Suggested fix: for Q < 0, use ΔP = P₀ + |C_rev|·Q² (rising), for example with C_rev = −C. Optionally warn when a running pump reverses.

#### F1-35  Volumetric pump passes unlimited flow when pushed (pressurised suction)
- **Severity: S2** (wrong numbers in a plausible configuration: a PD booster fed from a pressurised header)
- Location: [volumetric_pump.py:46](../../backend/simulation/equipment/volumetric_pump.py#L46). `max(0, stiffness·(Q_rated − Q))` makes ΔP = 0 for Q > Q_rated, so the pump becomes an open pipe. The code comment says the opposite ("pump resists being pushed").
- S2: a 100 L/min pump between a 10 bar(a) source and an atmospheric tank gives **1918 L/min** (19× displacement), ΔP = 0, and `success: True`.
- A real PD pump driven at fixed speed passes ≈ its displacement (with the motor acting as a brake).
- Suggested fix: remove the `max(0, …)` so the spring acts in both directions (with a negative ΔP above rated), and give it a matching derivative.

#### F1-36  Volumetric pump motor-power limit silently reduces flow; KPI power is nameplate even when stopped
- **Severity: S2**
- Location: [volumetric_pump.py:48-67](../../backend/simulation/equipment/volumetric_pump.py#L48-L67), [routers/simulation.py:54-55](../../backend/routers/simulation.py#L54-L55).
- S3: a 100 L/min, 5 kW, η 85 % pump against 40 bar(a) delivers 65.6 L/min at 38.9 bar. No warning appears: the telemetry only has `cavitation_warning` and the stats have no flag.
- A real PD pump keeps its flow and **overloads the motor**; the overload is the thing the engineer needs to see. Showing a reduced flow instead hides it.
- KPI `total_pump_power_kw` adds the nameplate `motor_power` for every volumetric pump, even when it is inactive (S4: Q = 0 still reports 5 kW) or lightly loaded.
- Suggested fix:
  - Keep the displacement flow, and report the shaft power Q·ΔP/η with a "motor overload" warning when it exceeds the rated power.
  - Compute KPI power from the actual operating point for both pump types, and skip inactive pumps.

### 1.25 orifice.py / calibrated_restriction.py
- **ISO 5167 mode** is correct for corner taps:
  - It uses RHG Formula (4); the L1/M2′ terms vanish for corner taps ✔.
  - The small-bore correction applies for D < 71.12 mm ✔.
  - The permanent loss uses Formula (7) with C_d, not C_m ✔.
  - Benchmark B4 agrees within 0.03 %.
- Below Re_D ≈ 0.4·Re_valid it blends to the classic Cd, so it inherits F1-25 at low Re. β is silently clamped to [0.1, 0.75] (F1-39).
- **Classic mode:** permanent loss = tap ΔP·(1 − β²), a common approximation (ISO's is ≈ 1 − β^1.9). The analytic derivative is exact ✔.
- **Calibrated restriction:**
  - The first calibration runs in `__init__`, before the parser sets `pipe_diameter` and `global_settings` (so "system" falls back to water there). `calculate()` recalibrates, and the outer loop picks that up.
  - Verified (C1): orifice, laminar and quadratic models with "system" = VG46 all reproduce exactly 10.00 L/min at the base point, for DN15 and DN50 pipes ✔.
  - Laminar ΔP = k·μ·Q and quadratic ΔP = k·ρ·Q² ✔. Its throttling heat is kept, because it does not call `calculate_temperature` ✔.

### 1.26 linear_control_valve.py / three_way_tcv.py
- Cv equation with K = 1.732e9 is verified (US Cv, SG = ρ/1000) ✔. Opening 0 % blocks flow with a 1e12 linear resistance ✔. Any other opening is clamped to at least 0.1 %.
- Only a linear trim is available; there is no equal-percentage characteristic, which is the most common globe trim. There is no FL / choked-flow or cavitation check (F1-28).
- TCV:
  - Complementary hot/cold openings; total Cv stays ≈ constant ✔.
  - Mass-weighted mixing ✔.
  - The solver residual omits viscosity (F1-05).
  - There is no throttling heat on either path (minor, related to F1-16).

### 1.27 linear_regulator.py / remote_control_valve.py
- Same Cv model as the control valve, with the opening clamped to [0.1 %, 100 %] and set by the solver's outer loop (F1-01). Backpressure mode senses upstream ✔, and the remote sensing configuration is read by the solver.
- The regulator never closes fully (F1-37).

### 1.28 check_valve.py / check_valve_orifice.py
- Check valve:
  - The MCP (Fischer-Burmeister) formulation gives Q ≥ 0, ΔP ≤ cracking + friction, and complementarity ✔. With ε = 1e-4 the leakage is negligible.
  - When open, ΔP = cracking + Cv loss. This is a standard simplification (the spring load is held constant).
  - The non-MCP fallback is a tanh blend with a closed Cv of 1e-4 ✔.
- Check valve with bypass orifice:
  - There is no MCP and no analytic derivative (central-difference fallback).
  - The open branch puts the cracking offset on the orifice as well, so dp = cracking + (Q/(k_v + k_o))², and k_o is evaluated at the total flow. This slightly over-predicts ΔP when open. Acceptable.
  - Reverse flow passes through the orifice ✔.
- Both erase their heat via `calculate_temperature` (F1-16).

### 1.29 pressure_safety_valve.py / rupture_disc.py
- Covered earlier: forced-open is not implemented (F1-03), pop action latches with no blowdown (F1-04), and set pressure is absolute (F1-09).
- Modulating lift is linear from 0 at the set pressure to full lift at +10 % overpressure ✔. This is reasonable for liquid-service valves.
- The rupture disc latching once burst is correct for a run ✔. The reduced-bore derivative ignores dCd/dQ (Jacobian only).
- The capacity indicator is wrong (F1-38).

### 1.30 filter.py
- Water-referenced (F1-19). Clogging interpolates K linearly between clean and terminal ✔. The derivative is exact ✔. Throttling heat is kept ✔.
- There is no bypass valve or ΔP-indicator setpoint, which lube-oil filters usually have. Model it with a parallel check valve and document that.

### 1.31 heat_exchanger.py
- The ε-NTU model with C_max = ∞ (utility at constant temperature) reproduces the rated duty exactly (C6: 300.0 kW) ✔.
  - UA scales as (Q/Q_rated)^0.8 (water-cooled) or ^0.6 (air-cooled).
  - Heating works when T_medium > T_in ✔.
  - The C_max = ∞ assumption over-predicts duty when the cooling-water flow is limited; document it.
- ΔP = k·Q²·(ρ/1000)·viscosity factor, using an assumed 10 mm channel. The rated ΔP is reproduced for water and VG46 at 50 °C (0.49 bar). It rises to 0.72 bar for VG46 at 20 °C and 0.91 bar for VG220 at 40 °C, which is plausible but uncalibrated (same issue as F1-19).
- Air-cooled UA is sized at 20 °C ambient and run at the global ambient ✔. Reverse flow is not handled (port-0 assumption, F1-13).
- Infeasible ratings are accepted silently (F1-40).

### 1.32 mixer.py / splitter.py ✔
- All ports have equal pressure and there is no junction loss (tee K of 0.2–1.8 is not modelled, consistent with F1-17). Mixer temperature is mass-weighted ✔.
- The splitter copies the inlet temperature, so reverse flow through a splitter gets the wrong temperature (F1-13).

### 1.33 reducer.py ✔
- Crane TP-410 A-26 formulas are verified:
  - contraction 0.8·sin(θ/2)(1−β²) for θ ≤ 45° and 0.5(1−β²)√sin(θ/2) above;
  - expansion 2.6·sin(θ/2)(1−β²)² for θ ≤ 45° and (1−β²)² above (Borda-Carnot at 180°).
- These are all small-bore referenced, which is Crane's K₁. The code comment calls them "K2", which is only cosmetic.
- The Bernoulli static-pressure term is correct, viscous heat comes from the irreversible part only ✔, and the derivative is analytic ✔ (733481b).

### 1.34 base_node.py
- The shared contract is consistent:
  - flags `is_pressure_boundary`, `blocks_flow_on_shutdown` and `use_mcp_formulation`;
  - `calculate_temperature` mixes inward ports by mass;
  - the central-difference fallback derivative uses dq = 1e-6 m³/s, which is coarse for low-flow devices (a lube orifice runs at ~1e-4).
- Main defect: `calculate_temperature` overwrites per-device outlet heat (F1-16).

### 1.46 Existing tests
- Six physics test files have **no assertions**: they print results and always pass. They are `test_physics_regulator.py`, `test_physics_regulator_scenarios.py`, `test_physics_filters.py`, `test_physics_mixing.py`, `test_physics_reverse_flow.py` and `test_physics_viscosity.py` (F1-41). This is why F0-01 was never caught.
- `test_physics_rupture_disc.py` has no numeric assertions. `test_physics_psv.py` checks status strings but not the capacity value (F1-38 passes).
- The orifice, reducer, sources and calibrated-restriction tests contain numeric checks, but several compute the expected value with the same formula as the code (F0-05).

#### F1-37  Pressure regulator cannot lock up: zero downstream demand gives downstream = upstream pressure
- **Severity: S2** (a common "consumers closed" case shows the wrong pressure as a success)
- Location: [linear_regulator.py:25](../../backend/simulation/equipment/linear_regulator.py#L25) and [remote_control_valve.py:30](../../backend/simulation/equipment/remote_control_valve.py#L30), where the opening is clamped to ≥ 0.1 %.
- C3: a 10 bar(a) source feeds a PRV set at 5 bar(a), followed by a closed control valve. The result is downstream = **9.99 bar(a)**, opening 0.22 %, 0.05 L/min leakage, `success: True`, and no saturation flag. With the downstream valve 1 % open, the result is 5.75 bar(a) (setpoint missed, F1-01).
- A real PRV locks up (closes tight) and holds downstream at ≈ set + lock-up allowance. This matters for downstream PSV checks: a PSV downstream of the PRV would "relieve" in the model.
- Suggested fix: allow a fully closed state through a complementarity formulation, the same way PSVs and check valves do (P_out ≤ P_set ⟂ Q ≥ 0). As a minimum, flag "regulator saturated / not at setpoint".

#### F1-38  PSV and rupture-disc "capacity utilisation" is referenced to 1 bar ΔP, so every real relief case shows "overcapacity"
- **Severity: S2** (misleading safety-related indicator)
- Location: [pressure_safety_valve.py:165-178](../../backend/simulation/equipment/pressure_safety_valve.py#L165-L178), [rupture_disc.py:133-152](../../backend/simulation/equipment/rupture_disc.py#L133-L152). The rated flow is taken as Cv·√(1 bar/ρ…), and the reduced-bore disc uses A·√(1 bar/ρ) as a "choked" flow. Liquids do not choke this way.
- C4: a PSV set at 20 bar(a) with Cv 10, at exactly 10 % overpressure, relieving to atmosphere, shows `status = overcapacity` and **451 %** (modulating) / 456 % (pop). By its own model it is at full lift and exactly at its rated capacity.
- Suggested fix:
  - Rated capacity = flow at full lift with ΔP = 1.1·P_set − P_back (or a user-entered certified capacity, API 520 liquid sizing).
  - "Overcapacity" should mean that the required relief flow exceeds that value. In practice that shows up as the inlet pressure exceeding the allowable accumulation.

#### F1-39  ISO 5167 orifice: β silently clamped to [0.1, 0.75]; no validity warning
- **Severity: S3**
- Location: [orifice.py:186](../../backend/simulation/equipment/orifice.py#L186). The coefficient and loss ratio use the clamped β, but the area uses the real d.
- Compared with RHG extrapolated to the true β, the permanent ΔP is 1.18× at β 0.78, **2.4× at β 0.88** and **9× at β 0.96**. For β < 0.1 the deviation is within 1 %.
- There is no warning when outside ISO 5167-2 limits (β 0.1–0.75, d ≥ 12.5 mm, D 50–1000 mm, Re_D ≥ 5000), and the UI default label suggests ISO accuracy.
- Suggested fix: use a generic thin-orifice loss (Idelchik) outside the ISO range, and add a validity flag to telemetry.

#### F1-40  Heat exchanger accepts infeasible ratings silently
- **Severity: S3**
- C6: a rating of 300 kW at 100 L/min of oil (50 °C in, 10 °C water) would need a 103 K temperature drop, but only 40 K is available. The effectiveness is clamped to 0.999 without a message, and the oil leaves at 10.0 °C (infinite area) with 117 kW.
- Suggested fix: validate on input (rated duty ≤ ṁ·cp·(T_in − T_medium)) and warn when effectiveness > 0.95.

#### F1-41  Six physics test files have no assertions (always pass)
- **Severity: S2** (false confidence; regression gaps on regulators, filters, mixing, reverse flow, viscosity)
- Files: listed in 1.46 above. Each is a single `def test_…` that only prints.
- Suggested fix: turn the printed values into assertions against independent references (benchmarks.py, props_check.py, the C1–C6 / S1–S6 scenarios). Add an "at setpoint" assertion for every regulator scenario.

### Not yet covered in 1A

- 1.8 Bottleneck: only computed from the last residual vector; meaningful only on failure. OK for now; UX review in 3.4.
- 1.11 Multiplicity beyond controllers/PSV latch (parallel check valves, parallel centrifugal pumps near shut-off) → revisit in 1.23 / 1.28.

#### F1-42  Mixing assumes constant cp: mixed temperature slightly off for large temperature differences
- **Severity: S3** (found in B1a while turning `test_physics_mixing.py` into assertions, 2026-10-13)
- Location: `base_node.py › HydraulicNode.calculate_temperature` weights port temperatures by mass flow only.
- Evidence: VG46, 810 L/min at 80 °C + 1097 L/min at 20 °C → 44.88 °C; the enthalpy balance with cp(T) gives 45.74 °C (0.86 K, 1.4 % of the span). Water and small ΔT are hardly affected.
- Suggested fix: weight by m·cp, or solve the enthalpy balance (cp is linear in T for the oil correlations). Guarded by the strict-xfail test `test_f1_42_…` in `test_physics_mixing.py`. Batch: B1d.
