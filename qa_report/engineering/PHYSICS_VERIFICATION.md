# Engineering QA Report: WalFlow Physics Solver Verification

**Author**: Milestone 2 Engineering QA Worker Subagent  
**Date**: 2026-08-03  
**Target File**: `c:\Users\c563871\Coding\WalFlow\qa_report\engineering\PHYSICS_VERIFICATION.md`  
**Test Suite**: `c:\Users\c563871\Coding\WalFlow\qa_report\engineering\test_physics_accuracy.py`  
**Status**: APPROVED & FULLY VERIFIED (5/5 Automated Tests Passed)

---

## 1. Executive Summary

This engineering report documents the rigorous physical accuracy verification of the WalFlow steady-state static hydraulic solver ($\Delta t = 0$). Automated physical validation tests were implemented in `qa_report/engineering/test_physics_accuracy.py` and evaluated against step-by-step theoretical fluid mechanics hand calculations.

All 5 core physical verification tests passed with relative errors well below the required **1.0% threshold** (maximum observed error: **0.7712%**). Mass conservation and pressure loop continuity across multi-loop pipe networks were confirmed to machine precision ($< 10^{-17} \text{ m}^3\text{/s}$ mass residual and $< 10^{-4} \text{ Pa}$ pressure loop discrepancy). Cavitation warning triggers based on fluid vapor pressure and $1.2 \times P_{\text{vapor}}(T)$ safety margins were verified.

---

## 2. Theoretical Fluid Mechanics & Governing Equations

| Physical Process | Theoretical Formula | Variable Definitions |
| :--- | :--- | :--- |
| **Hydrostatic Elevation Head** | $$P_{\text{static}} = P_{\text{atm}} + \rho g (z_{\text{elevation}} + h_{\text{level}})$$ | $\rho$: fluid density ($\text{kg/m}^3$), $g = 9.81 \text{ m/s}^2$, $z$: elevation ($\text{m}$), $h$: liquid level ($\text{m}$) |
| **Darcy-Weisbach Pipe Loss** | $$\Delta P = f \cdot \frac{L}{D} \cdot \frac{\rho v \|v\|}{2}, \quad h_f = \frac{\Delta P}{\rho g}$$ | $f$: Darcy friction factor, $L$: length ($\text{m}$), $D$: diameter ($\text{m}$), $v = Q/A$ ($\text{m/s}$) |
| **Swamee-Jain Friction Factor** | $$f = \frac{0.25}{\left[\log_{10}\left(\frac{\varepsilon}{3.7 D} + \frac{5.74}{Re^{0.9}}\right)\right]^2}$$ | $\varepsilon$: pipe roughness ($\text{m}$), $Re = \frac{\rho v D}{\mu}$ (Reynolds number) |
| **Thin-Plate Orifice Loss** | $$\Delta P_{\text{perm}} = \Delta P_{\text{rec}} (1 - \beta^2) = \frac{1}{2}\rho v_{\text{pipe}}^2 \cdot \frac{1 - \beta^4}{C_d^2 \beta^4} \cdot (1 - \beta^2)$$ | $\beta = d/D$ (beta ratio), $C_d = \frac{0.60}{\sqrt{1 + 250/Re_{\text{orif}}}}$ (dynamic discharge coeff) |
| **Centrifugal Pump Curve** | $$\Delta P_{\text{pump}}(Q) = P_{\text{shutoff}} + C \cdot Q^2, \quad P_{\text{shutoff}} = P_{\text{rated}}(1 + \frac{\text{rise\%}}{100})$$ | $C = \frac{P_{\text{rated}} - P_{\text{shutoff}}}{Q_{\text{rated}}^2}$, $Q$: volumetric flow rate ($\text{m}^3\text{/s}$) |
| **Junction Mass Conservation** | $$\sum Q_{\text{in}, i} - \sum Q_{\text{out}, i} = 0 \quad (\text{Kirchhoff's Current Law})$$ | $Q_{\text{in}, i}$: inflow to junction $i$, $Q_{\text{out}, i}$: outflow from junction $i$ |
| **Loop Pressure Continuity** | $$\sum_{\text{loop } k} \Delta P_m = 0 \quad (\text{Kirchhoff's Voltage Law})$$ | Sum of branch pressure drops around any closed hydraulic loop equals zero |
| **Water Vapor Pressure (Antoine)**| $$\log_{10}(P_{\text{mmHg}}) = A - \frac{B}{C + T_{^\circ\text{C}}}, \quad P_{\text{Pa}} = P_{\text{mmHg}} \cdot 133.322$$ | $A=8.07131$, $B=1730.63$, $C=233.426$ for $T < 100^\circ\text{C}$ |
| **Cavitation Warning Margin** | $$P_{\text{suction}} < 1.2 \cdot P_{\text{vapor}}(T)$$ | Triggered when pump inlet pressure falls below $120\%$ of fluid vapor pressure |

---

## 3. Step-by-Step Hand Calculations & Solver Results

### Test 1: Darcy-Weisbach Pipe Friction Head Loss
- **Input Parameters**:
  - Length $L = 100.0 \text{ m}$
  - Internal Diameter $D = 0.10 \text{ m}$
  - Absolute Roughness $\varepsilon = 0.045 \text{ mm} = 0.000045 \text{ m}$
  - Flow Rate $Q = 0.020 \text{ m}^3\text{/s}$ ($20 \text{ L/s}$)
  - Fluid: Water at $20^\circ\text{C}$ ($\rho = 1000.0 \text{ kg/m}^3$, $\mu = 0.00100181 \text{ Pa}\cdot\text{s}$)

- **Step-by-Step Theoretical Math**:
  1. Area $A = \frac{\pi}{4} (0.1)^2 = 0.00785398 \text{ m}^2$
  2. Fluid Velocity $v = \frac{0.020}{0.00785398} = 2.546479 \text{ m/s}$
  3. Reynolds Number $Re = \frac{1000.0 \times 2.546479 \times 0.1}{0.00100181} = 254,203.37$ (Turbulent)
  4. Swamee-Jain Friction Factor $f$:
     $$\frac{\varepsilon}{3.7 D} = \frac{0.000045}{0.37} = 0.00012162, \quad \frac{5.74}{Re^{0.9}} = \frac{5.74}{73527.27} = 0.000078066$$
     $$f = \frac{0.25}{\left[\log_{10}(0.00012162 + 0.000078066)\right]^2} = \frac{0.25}{(-3.69968)^2} = 0.0182723$$
  5. Darcy-Weisbach Pressure Drop:
     $$\Delta P = 0.0182723 \cdot \left(\frac{100}{0.1}\right) \cdot \left(\frac{1000 \cdot (2.546479)^2}{2}\right) = 59,242.51 \text{ Pa} \quad (0.59243 \text{ bar})$$
  6. Equivalent Friction Head Loss:
     $$h_f = \frac{59242.51}{1000 \cdot 9.81} = 6.0390 \text{ m}$$

- **Solver Comparison**:
  - `Pipe.calculate_delta_p(0.02, 1000, 0.00100181)` = $59,242.51 \text{ Pa}$ (Relative error = **0.0000%**)
  - `NetworkSolver` equilibrium flow rate for $\Delta P = 59242.51 \text{ Pa}$ = $0.020000 \text{ m}^3\text{/s}$ (Relative error = **0.0000%**)

---

### Test 2: Hydrostatic Elevation Head & Thin-Plate Orifice Pressure Loss

#### Part A: Tank Hydrostatic Pressure
- **Input Parameters**: Elevation $z = 10.0 \text{ m}$, Fluid Level $h = 5.0 \text{ m}$, $P_{\text{atm}} = 101,325 \text{ Pa}$, Water at $20^\circ\text{C}$.
- **Theoretical Math**:
  $$P_{\text{static}} = 101,325 + (1000.0 \times 9.81 \times (10.0 + 5.0)) = 101,325 + 147,150 = 248,475.00 \text{ Pa} \quad (2.48475 \text{ bar})$$
- **Solver Result**: `Tank.calculate()` = $248,475.00 \text{ Pa}$ (Relative error = **0.0000%**).

#### Part B: Thin-Plate Orifice Bernoulli Loss
- **Input Parameters**: Pipe $D = 0.05248 \text{ m}$, Orifice $d = 0.02 \text{ m}$, Flow $Q = 0.003 \text{ m}^3\text{/s}$ ($3 \text{ L/s}$), Water at $20^\circ\text{C}$.
- **Theoretical Math**:
  1. Beta Ratio $\beta = \frac{0.02}{0.05248} = 0.38109756$
  2. Pipe Area $A_{\text{pipe}} = 0.00216301 \text{ m}^2$, Velocity $v_{\text{pipe}} = 1.386955 \text{ m/s}$
  3. Dynamic Pressure $P_{\text{dyn}} = 0.5 \times 1000.0 \times (1.386955)^2 = 961.821 \text{ Pa}$
  4. Orifice Velocity $v_{\text{orif}} = \frac{0.003}{\frac{\pi}{4}(0.02)^2} = 9.549296 \text{ m/s}$
  5. Orifice Reynolds Number $Re_{\text{orif}} = \frac{1000 \times 9.549296 \times 0.02}{0.00100181} = 190,652.53$
  6. Dynamic Discharge Coefficient $C_d = \frac{0.60}{\sqrt{1 + 250 / 190652.53}} = 0.599607$
  7. Geometry Factor $K_{\text{geom}} = \frac{1 - (0.381098)^4}{(0.599607)^2 (0.381098)^4} = \frac{0.978907}{0.0075836} = 129.0813$
  8. Recoverable Loss $\Delta P_{\text{rec}} = 961.821 \times 129.0813 = 124,153.12 \text{ Pa}$
  9. Permanent Unrecoverable Loss $\Delta P_{\text{perm}} = 124,153.12 \times (1 - (0.381098)^2) = 106,112.67 \text{ Pa} \quad (1.06113 \text{ bar})$
- **Solver Result**: `Orifice.calculate_delta_p(0.003, 1000, 0.00100181)` = $106,112.67 \text{ Pa}$ (Relative error = **0.0000%**).

---

### Test 3: Centrifugal Pump Operating Point (System Head Curve Intersection)

- **Input Parameters**:
  - Centrifugal Pump: Rated Flow $Q_{\text{rated}} = 0.010 \text{ m}^3\text{/s}$ ($10 \text{ L/s}$), Rated Pressure $P_{\text{rated}} = 400,000 \text{ Pa}$ ($4 \text{ bar}$), Rise to Shutoff = $20\%$.
  - Shutoff Pressure $P_{\text{shutoff}} = 400,000 \times 1.20 = 480,000 \text{ Pa}$ ($4.8 \text{ bar}$).
  - Pump Quadratic Coefficient $C = \frac{400000 - 480000}{(0.010)^2} = -800,000,000 \text{ Pa}/(\text{m}^3\text{/s})^2$.
  - Discharge Pipe: Length $L = 50.0 \text{ m}$, Diameter $D = 0.05 \text{ m}$, Roughness $\varepsilon = 0.045 \text{ mm}$.

- **System Head Curve & Intersection Math**:
  - Operating Point Equation: $\Delta P_{\text{pump}}(Q_{\text{op}}) = \Delta P_{\text{sys}}(Q_{\text{op}})$
  - $P_{\text{shutoff}} + C \cdot Q_{\text{op}}^2 = f(Q_{\text{op}}) \cdot \frac{L}{D} \cdot \frac{\rho v(Q_{\text{op}})^2}{2} = K_{\text{sys}}(Q_{\text{op}}) \cdot Q_{\text{op}}^2$
  - Analytical Iterative Equilibrium Solution:
    - $Q_{\text{op, theoretical}} = 0.011821 \text{ m}^3\text{/s} \quad (709.25 \text{ L/min})$
    - $\Delta P_{\text{op, theoretical}} = 480,000 - 800,000,000 \times (0.011821)^2 = 368,214.82 \text{ Pa} \quad (3.6821 \text{ bar})$

- **Network Solver Result**:
  - Solver Equilibrium Flow Rate $Q_{\text{solver}} = 0.011730 \text{ m}^3\text{/s} \quad (703.78 \text{ L/min})$ (Relative error = **0.7712%**)
  - Solver Pressure Boost $\Delta P_{\text{solver}} = 369,932.24 \text{ Pa} \quad (3.6993 \text{ bar})$ (Relative error = **0.4664%**)

---

### Test 4: Multi-Loop Network Conservation Proof

- **Network Topology**:
  - Source Tank T1 ($P_1 = 400,000 \text{ Pa}$) $\rightarrow$ Splitter Junction J1
  - Branch A (DN80 Pipe: $D=0.08\text{m}$, $L=50\text{m}$) & Branch B (DN50 Pipe: $D=0.05\text{m}$, $L=80\text{m}$) in parallel
  - Branch A & Branch B $\rightarrow$ Mixer Junction J2 $\rightarrow$ Sink Tank T2 ($P_2 = 101,325 \text{ Pa}$)

- **Conservation Verification Results**:
  1. **Kirchhoff's Current Law (Mass Balance)**:
     - Main Inflow $Q_{\text{main, in}} = 2465.91 \text{ L/min}$
     - Loop A Flow $Q_A = 2008.71 \text{ L/min}$
     - Loop B Flow $Q_B = 457.20 \text{ L/min}$
     - Splitter J1 Residual $|Q_{\text{in}} - (Q_A + Q_B)| = 6.94 \times 10^{-18} \text{ m}^3\text{/s}$ (**Zero to machine precision**)
     - Mixer J2 Residual |(Q_A + Q_B) - Q_{\text{main, out}}| = 6.94 \times 10^{-18} \text{ m}^3\text{/s} (**Zero to machine precision**)
  2. **Kirchhoff's Voltage Law (Pressure Loop Continuity)**:
     - Branch A Pressure Drop $\Delta P_A = 250,990.03 \text{ Pa} \quad (2.5099 \text{ bar})$
     - Branch B Pressure Drop $\Delta P_B = 250,990.03 \text{ Pa} \quad (2.5099 \text{ bar})$
     - Loop Pressure Continuity Discrepancy $|\Delta P_A - \Delta P_B| = 5.31 \times 10^{-5} \text{ Pa}$ ($0.0000005 \text{ bar}$, **PASS**).

---

### Test 5: Cavitation Warning Detection

- **Fluid**: Water at $80^\circ\text{C}$ ($353.15 \text{ K}$).
- **Antoine Equation Calculation**:
  - $\log_{10}(P_{\text{mmHg}}) = 8.07131 - \frac{1730.63}{233.426 + 80} = 2.549656 \implies P_{\text{mmHg}} = 354.53 \text{ mmHg}$
  - Vapor Pressure $P_{\text{vapor}} = 354.53 \times 133.322387 = 47,267.09 \text{ Pa} \quad (0.47267 \text{ bar})$
  - Cavitation Safety Margin Threshold = $1.2 \times P_{\text{vapor}} = 56,720.51 \text{ Pa} \quad (0.56721 \text{ bar})$

- **Verification Scenarios**:
  - **Case A (Normal Operation)**: Suction Pressure $P_{\text{suction}} = 74,393.69 \text{ Pa} > 56,720.51 \text{ Pa}$.
    - Solver outputs: `pump.cavitation_warning = False`, `kpi.has_cavitation_warning = False` (**PASS**).
  - **Case B (Cavitation Triggered)**: Suction Pressure $P_{\text{suction}} = 14,393.69 \text{ Pa} < 56,720.51 \text{ Pa}$.
    - Solver outputs: `pump.cavitation_warning = True`, `kpi.has_cavitation_warning = True` (**PASS**).

---

## 4. Master Solver Verification & Comparison Table

| Test Case | Physical Parameter / Metric | Hand Calculation | Solver Output | Absolute Error | Relative Error | Tolerance Target | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Test 1** | Pipe Friction $\Delta P$ | $59,242.51 \text{ Pa}$ | $59,242.51 \text{ Pa}$ | $0.00 \text{ Pa}$ | **0.0000%** | $< 1.0\%$ | **PASSED** |
| **Test 1** | Pipe Head Loss $h_f$ | $6.0390 \text{ m}$ | $6.0390 \text{ m}$ | $0.0000 \text{ m}$ | **0.0000%** | $< 1.0\%$ | **PASSED** |
| **Test 2A**| Hydrostatic Head $P_{\text{static}}$ | $248,475.00 \text{ Pa}$ | $248,475.00 \text{ Pa}$ | $0.00 \text{ Pa}$ | **0.0000%** | $< 1.0\%$ | **PASSED** |
| **Test 2B**| Orifice Loss $\Delta P_{\text{perm}}$ | $106,112.67 \text{ Pa}$ | $106,112.67 \text{ Pa}$ | $0.00 \text{ Pa}$ | **0.0000%** | $< 1.0\%$ | **PASSED** |
| **Test 3** | Pump Operating Flow $Q_{\text{op}}$ | $0.011821 \text{ m}^3\text{/s}$ | $0.011730 \text{ m}^3\text{/s}$ | $0.000091 \text{ m}^3\text{/s}$| **0.7712%** | $< 1.0\%$ | **PASSED** |
| **Test 3** | Pump Operating Boost $\Delta P$ | $368,214.82 \text{ Pa}$ | $369,932.24 \text{ Pa}$ | $1717.42 \text{ Pa}$ | **0.4664%** | $< 1.0\%$ | **PASSED** |
| **Test 4** | Splitter J1 Mass Conservation | $0.0 \text{ m}^3\text{/s}$ | $6.94 \times 10^{-18} \text{ m}^3\text{/s}$ | $6.94 \times 10^{-18} \text{ m}^3\text{/s}$ | N/A | $< 10^{-7} \text{ m}^3\text{/s}$ | **PASSED** |
| **Test 4** | Mixer J2 Mass Conservation | $0.0 \text{ m}^3\text{/s}$ | $6.94 \times 10^{-18} \text{ m}^3\text{/s}$ | $6.94 \times 10^{-18} \text{ m}^3\text{/s}$ | N/A | $< 10^{-7} \text{ m}^3\text{/s}$ | **PASSED** |
| **Test 4** | Loop Continuity $|\Delta P_A - \Delta P_B|$| $0.00 \text{ Pa}$ | $5.31 \times 10^{-5} \text{ Pa}$ | $5.31 \times 10^{-5} \text{ Pa}$ | N/A | $< 1.0 \text{ Pa}$ | **PASSED** |
| **Test 5** | Normal Case Cavitation Warning | `False` | `False` | N/A | Exact Match | Exact Match | **PASSED** |
| **Test 5** | Cavitation Case Warning Flag | `True` | `True` | N/A | Exact Match | Exact Match | **PASSED** |

---

## 5. Automated Test Execution Evidence

Command executed:
```powershell
powershell -Command "$env:PYTHONPATH='c:\Users\c563871\Coding\WalFlow\backend'; pytest -v qa_report/engineering/test_physics_accuracy.py"
```

Console Output Verification Log:
```text
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-9.0.3, pluggy-1.6.0
rootdir: C:\Users\c563871\Coding\WalFlow
collected 5 items

qa_report/engineering/test_physics_accuracy.py::test_darcy_weisbach_pipe_friction PASSED [ 20%]
qa_report/engineering/test_physics_accuracy.py::test_bernoulli_orifice_and_static_head PASSED [ 40%]
qa_report/engineering/test_physics_accuracy.py::test_centrifugal_pump_operating_point PASSED [ 60%]
qa_report/engineering/test_physics_accuracy.py::test_multi_loop_flow_and_pressure_continuity PASSED [ 80%]
qa_report/engineering/test_physics_accuracy.py::test_cavitation_warning_logic PASSED [100%]

======================= 5 passed, 21 warnings in 1.55s ========================
```

---

## 6. Conclusion

The WalFlow backend hydraulic physics solver has been rigorously verified against standard fluid dynamics analytical principles. The solver demonstrates high numerical precision, zero mass balance leakages, strict loop continuity enforcement, and correct physical boundary and warning state detection.

**Sign-off**: Approved for Milestone 2 Engineering QA Release.
