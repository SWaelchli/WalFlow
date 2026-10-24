# Standards & Literature Register

Every standard, book, paper and textbook principle cited in section 2 of the equipment documents in [backend/simulation/equipment/](../backend/simulation/equipment/), with the status of each claim made from it.

**Origin:** the section 2 references were written by an LLM from memory, not from the documents. Until a claim is checked against the source it is **unverified** and must not be quoted as compliance.

The workflow for checking a source is the `standard-verification` skill ([.claude/skills/standard-verification/SKILL.md](../.claude/skills/standard-verification/SKILL.md)).

## How to read this register

- **Part A, Sources:** one row per source with a stable Ref ID, full citation and the current edition. The edition was checked on the web on 2026-10-23 from publisher, standards-body and reseller listings (bibliographic check only: the text was not read).
- **Part B, Claims:** one row per statement an equipment document makes from a source. A claim is verified against **one named edition** and the clause that supports it. A source can back several claims, and one claim can be backed by several sources.
- **Part C, Verification log:** one dated entry per verification session.

**Claim status**

| Status | Meaning |
| :--- | :--- |
| ⚪ Unverified | LLM-cited; the source has not been read |
| ✅ Verified | The clause supports the claim, and the doc and the code agree with it |
| ⚠️ Deviation | The source was read and the model differs; a finding `D-xx` in [EQUIPMENT_FINDINGS.md](../EQUIPMENT_FINDINGS.md) |
| ❌ Not in source | The source does not contain the claim; the citation is replaced or removed |
| ➖ Principle | Textbook principle (e.g. Darcy-Weisbach). No edition-specific claim to verify; any coefficient taken from a source needs its own source row |
| 🚩 | Pre-check flag from the bibliographic check: edition superseded, citation moved, applicability doubtful or source not found. Resolve when the source is read |

**Copyright rules for this public repository:** cite the clause, equation, table or figure number and paraphrase. A quote is at most one sentence. Never reproduce tables, figures or coefficient sets from a source. Longer excerpts and working notes live in the private reference library (`walflow-references/notes/`).

## Part A: Sources

### A.1 Standards

| Ref ID | Citation | Current edition (web check 2026-10-23) | Note |
| :--- | :--- | :--- | :--- |
| `API-520-1` | API Standard 520, *Sizing, Selection, and Installation of Pressure-relieving Devices — Part I: Sizing and Selection* | 10th ed., October 2020, Errata 1 (2023) | |
| `API-520-2` | API Standard 520, *… — Part II: Installation* | 7th ed., October 2020 | |
| `API-521` | API Standard 521, *Pressure-relieving and Depressuring Systems* | 7th ed., June 2020 | A reseller lists a newer edition; unconfirmed |
| `API-526` | API Standard 526, *Flanged Steel Pressure-relief Valves* | 8th ed., August 2023 | 7th ed. (2017) superseded |
| `API-527` | API Standard 527, *Seat Tightness of Pressure Relief Valves* | 5th ed., July 2020, reaffirmed 2025 | |
| `API-594` | API Standard 594, *Check Valves: Flanged, Lug, Wafer, and Butt-welding* | 9th ed., February 2022 | One reseller lists a 2026 edition; unconfirmed |
| `API-6D` | API Specification 6D, *Specification for Valves* | 25th ed., November 2021 | Title until the 24th ed. (2014): *Specification for Pipeline and Piping Valves* |
| `API-661` | API Standard 661, *Petroleum, Petrochemical, and Natural Gas Industries — Air-cooled Heat Exchangers* | 7th ed., July 2013, reaffirmed 2024 | |
| `API-674` | API Standard 674, *Positive Displacement Pumps — Reciprocating* | 3rd ed., 2010, errata to November 2025 | |
| `API-676` | API Standard 676, *Positive Displacement Pumps — Rotary* | 4th ed., February 2022 | |
| `ISO-4126-1` | ISO 4126-1, *Safety devices for protection against excessive pressure — Part 1: Safety valves* | ISO 4126-1:2013 + Amd 1:2016 (confirmed 2025) | EN ISO 4126-1:2013 also has A2:2019 |
| `ISO-4126-2` | ISO 4126-2, *… — Part 2: Bursting disc safety devices* | ISO 4126-2:2018 | |
| `ISO-4126-6` | ISO 4126-6, *… — Part 6: Application, selection and installation of bursting disc safety devices* | ISO 4126-6:2014 (confirmed 2022) | |
| `ISO-23251` | ISO 23251, *Petroleum, petrochemical and natural gas industries — Pressure-relieving and depressuring systems* | ISO 23251:2019 (2nd ed.); EN ISO 23251:2020 | |
| `ASME-VIII-1` | ASME Boiler and Pressure Vessel Code, Section VIII, Division 1, *Rules for Construction of Pressure Vessels* | Biennial; edition to be fixed when read | 🚩 Cited for UG-127. From the 2021 edition the overpressure protection rules are in Section XIII (`ASME-XIII`) |
| `ASME-XIII` | ASME Boiler and Pressure Vessel Code, Section XIII, *Rules for Overpressure Protection* | 2025 edition (first issued 2021) | Not cited yet; likely replacement for `ASME-VIII-1` UG-127 |
| `ISO-5167-1` | ISO 5167-1, *Measurement of fluid flow by means of pressure differential devices inserted in circular cross-section conduits running full — Part 1: General principles and requirements* | ISO 5167-1:2022, supersedes 2003 | Read: EVS-EN ISO 5167-1:2022 (identical text) |
| `ISO-5167-2` | ISO 5167-2, *… — Part 2: Orifice plates* | ISO 5167-2:2022 (published 2022-06), supersedes 2003 | Read: EVS-EN ISO 5167-2:2022 (identical text) |
| `ASME-MFC-3M` | ASME MFC-3M, *Measurement of Fluid Flow in Pipes Using Orifice, Nozzle, and Venturi* | MFC-3M-2004 incl. MFC-3Ma-2007, reaffirmed 2025 | Cited as a future option only |
| `IEC-60534-2-1` | IEC 60534-2-1, *Industrial-process control valves — Part 2-1: Flow capacity — Sizing equations for fluid flow under installed conditions* | Ed. 2.0, 2011, corrigendum 2015 | Read: DIN EN 60534-2-1:2012-01 (German, = EN 60534-2-1:2011) + Berichtigung 1:2015-11 (= IEC Cor.:2015, Annex E Ex. 3-4 only) |
| `IEC-60534-2-4` | IEC 60534-2-4, *Industrial-process control valves — Part 2-4: Flow capacity — Inherent flow characteristics and rangeability* | Ed. 2.0, 2009 | |
| `ISA-75.01.01` | ANSI/ISA-75.01.01 (60534-2-1 MOD), *Industrial-Process Control Valves — Part 2-1: Flow capacity — Sizing equations for fluid flow under installed conditions* | 2012 | US adoption of `IEC-60534-2-1` |
| `ISA-75.11.01` | ANSI/ISA-75.11.01, *Inherent Flow Characteristic and Rangeability of Control Valves* | 2013 | |
| `ISA-5.1` | ANSI/ISA-5.1, *Instrumentation and Control Symbols and Identification* | 2024 | 2022 edition historical |
| `ISO-9906` | ISO 9906, *Rotodynamic pumps — Hydraulic performance acceptance tests — Grades 1, 2 and 3* | ISO 9906:2012 | |
| `HI-14.6` | ANSI/HI 14.6, *Rotodynamic Pumps for Hydraulic Performance Acceptance Tests* | 2022 | |
| `HI-9.6.1` | ANSI/HI 9.6.1, *Rotodynamic Pumps Guideline for NPSH Margin* | 2024 | 2024 changed the margin basis from NPSH3 to NPSHR. 🚩 Rotodynamic pumps only, but also cited for the volumetric pump |
| `HI-3.1-3.5` | ANSI/HI 3.1-3.5, *Rotary Pumps for Nomenclature, Definitions, Application, and Operation* | 2021 | |
| `ISO-3968` | ISO 3968, *Hydraulic fluid power — Filters — Evaluation of differential pressure versus flow* | ISO 3968:2017 (confirmed 2023) | |
| `ISO-16889` | ISO 16889, *Hydraulic fluid power — Filters — Multi-pass method for evaluating filtration performance of a filter element* | ISO 16889:2022 | |
| `EN-334` | EN 334, *Gas pressure regulators for inlet pressures up to 10 MPa (100 bar)* | EN 334:2019+A1:2024 | 🚩 Fuel-gas regulators; WalFlow models liquids |
| `TEMA` | Tubular Exchanger Manufacturers Association, *Standards of the Tubular Exchanger Manufacturers Association* | 11th ed., 2024 (online only); 10th ed., 2019 | |
| `ASME-B16.9` | ASME B16.9, *Factory-Made Wrought Buttwelding Fittings* | 2024 | Geometry catalogue only |
| `ASME-B36.10M` | ASME B36.10M, *Welded and Seamless Wrought Steel Pipe* | Newest confirmed: 2015; a later edition is likely | Geometry catalogue only |
| `ASME-B36.19M` | ASME B36.19M, *Stainless Steel Pipe* | 2018 (one listing) | Geometry catalogue only |
| `EN-10253-2` | EN 10253-2, *Butt-welding pipe fittings — Part 2: Non alloy and ferritic alloy steels with specific inspection requirements* | EN 10253-2:2021 (+A1:2025 in one listing) | Geometry catalogue only |
| `EN-10220` | EN 10220, *Seamless and welded steel tubes — Dimensions and masses per unit length* | 2002; current status unconfirmed | Geometry catalogue only |
| `EN-ISO-1127` | EN ISO 1127, *Stainless steel tubes — Dimensions, tolerances and conventional masses per unit length* | ISO 1127:1992 / EN ISO 1127:1996; current status unconfirmed | Geometry catalogue only |

### A.2 Literature

| Ref ID | Citation | Note |
| :--- | :--- | :--- |
| `CRANE-TP410` | Crane Co., *Flow of Fluids Through Valves, Fittings, and Pipe*, Technical Paper No. 410. Edition to be fixed when read; newest confirmed: 2018 U.S. edition | Later editions (2021, 80th anniversary) announced, unconfirmed. 🚩 Page numbers such as A-26 and A-29 change between editions |
| `IDELCHIK` | Idelchik, I.E., *Handbook of Hydraulic Resistance*, 4th ed., Begell House, 2007/2008, ISBN 978-1-56700-251-5 | 3rd ed.: Begell House / CRC, 1994. Diagram numbers differ between editions |
| `MILLER` | Miller, D.S., *Internal Flow Systems*, 2nd ed., BHRA (Information Services), Cranfield, 1990, ISBN 0-947711-77-5 | |
| `GULICH` | Gülich, J.F., *Centrifugal Pumps*, 4th ed., Springer, Cham, 2020, ISBN 978-3-030-14787-7, doi:10.1007/978-3-030-14788-4 | |
| `KAYS-LONDON` | Kays, W.M., London, A.L., *Compact Heat Exchangers*, 3rd ed., McGraw-Hill, New York, 1984 | |
| `INCROPERA` | Bergman, T.L., Lavine, A.S., Incropera, F.P., DeWitt, D.P., *Fundamentals of Heat and Mass Transfer*, 8th ed., Wiley, 2017, ISBN 978-1-118-98917-3 | The docs cite "Incropera & DeWitt" (authors of the editions before 2011) |
| `CHURCHILL-1977` | Churchill, S.W. (1977). Friction-factor equation spans all fluid-flow regimes. *Chemical Engineering*, 84(24), 91–92 | |
| `COLEBROOK-1939` | Colebrook, C.F. (1939). Turbulent flow in pipes, with particular reference to the transition region between the smooth and rough pipe laws. *Journal of the Institution of Civil Engineers*, 11(4), 133–156 | Start page consistent across sources; end page unconfirmed |
| `FISCHER-1992` | Fischer, A. (1992). A special Newton-type optimization method. *Optimization*, 24(3–4), 269–284 | |
| `DITTUS-BOELTER-1930` | Dittus, F.W., Boelter, L.M.K. (1930). Heat transfer in automobile radiators of the tubular type. *University of California Publications in Engineering*, 2(13), 443–461. Reprinted in *Int. Commun. Heat Mass Transfer*, 12(1), 3–22 (1985) | 🚩 The common form $\mathrm{Nu} = 0.023\,\mathrm{Re}^{0.8}\mathrm{Pr}^n$ is often attributed to McAdams rather than to this paper; check the attribution |
| `WUEST-1954` | Wuest, W. (1954): cited for the laminar discharge coefficient $C_d \approx 0.2\sqrt{\mathrm{Re}}$ | 🚩 Not found by the web check: title and journal unknown. Do not rely on it until it is identified |

### A.3 Principles

Textbook relations with no edition-specific content. They need no verification unless a coefficient or limit is taken from a source.

| Ref ID | Principle |
| :--- | :--- |
| `DARCY-WEISBACH` | Darcy-Weisbach pressure-loss equation |
| `HAGEN-POISEUILLE` | Hagen-Poiseuille laminar law |
| `DARCY-FORCHHEIMER` | Darcy-Forchheimer law for porous media |
| `AFFINITY-LAWS` | Pump affinity laws |
| `EPS-NTU` | Effectiveness-NTU method |
| `MASS-ENERGY` | Conservation of mass and enthalpy at a junction; hydrostatics $P = P_{\text{atm}} + \rho g h$ |
| `GLOBAL-GRADIENT` | Newton-Raphson network formulation with node pressures and edge flows solved together |

## Part B: Claims

Doc § is section 2 of the equipment document. "Verified against" names the exact edition read and "Clause" the location in it.

| Claim | Doc | Claim as the doc states it | Ref ID | Status | Verified against | Clause | Date | Note / finding |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| CR-01 | calibrated_restriction | Orifice flow equation for the equivalent orifice | `ISO-5167-1`, `ISO-5167-2` | ✅ | ISO 5167-1:2022, ISO 5167-2:2022 | 5167-1 §5.1 F(1); 5167-2 F(1) | 2026-10-23 | Form of the equation only ($\varepsilon = 1$); $C_d$ is WalFlow's own (CR-03), not Formula (4) |
| CR-02 | calibrated_restriction | Permanent pressure loss ratio, §5.4 Formula (7) with the model's $C_d$ | `ISO-5167-2` | ✅ | ISO 5167-2:2022 | §5.4 F(7) | 2026-10-23 | The code uses F(7) (was $1-\beta^2$, within ±2.5 % of F(7) for β 0.2-0.75) |
| CR-03 | calibrated_restriction | Laminar discharge coefficient $C_d \approx 0.2\sqrt{\mathrm{Re}}$ of small orifices | `WUEST-1954`, `IDELCHIK` | ⚪ 🚩 | | | | `WUEST-1954` not found |
| CR-04 | calibrated_restriction | Laminar law $\Delta P \propto \mu Q$ | `HAGEN-POISEUILLE` | ➖ | | | | |
| CR-05 | calibrated_restriction | Resistance coefficient $K$ for the quadratic law | `CRANE-TP410` | ⚪ | | | | |
| CP-01 | centrifugal_pump | Affinity laws $Q \propto n$, $H \propto n^2$ for the relief-analysis speed ramp | `AFFINITY-LAWS` | ➖ | | | | |
| CP-02 | centrifugal_pump | Definitions of rated flow, rated head, shutoff head and pump efficiency | `ISO-9906`, `HI-14.6` | ⚪ | | | | |
| CP-03 | centrifugal_pump | NPSHa compared with NPSHr plus a user margin | `HI-9.6.1` | ⚪ | | | | 2024 edition: margin on NPSHR, not NPSH3 |
| CP-04 | centrifugal_pump | Quadratic head curve and locked-rotor resistance as an engineering approximation | `GULICH` | ⚪ | | | | |
| CV-01 | check_valve | Liquid Cv equation for the open valve loss | `IEC-60534-2-1` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | K_Cv = 1.732e9 is Eq. (1) inverted with N1 = 8.65e-2 (−0.1 %, N1 rounding); Annex E Ex. 1 reproduced (459.5 vs 460 kPa). Choked flow (§6.2) and $F_P$ (§8) not modelled; IEC scope is control valves (§1): verifies the equation form only |
| CV-02 | check_valve | Cracking pressure and non-return function of check valves | `API-594`, `API-6D` | ⚪ | | | | |
| CV-03 | check_valve | Fischer-Burmeister function for complementarity problems | `FISCHER-1992` | ⚪ | | | | |
| CVO-01 | check_valve_orifice | Liquid Cv equation for the open seat | `IEC-60534-2-1` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | Same as CV-01; IEC scope is control valves (§1): verifies the equation form only |
| CVO-02 | check_valve_orifice | Orifice equation and permanent loss ratio (Formula (7)) for the bypass | `ISO-5167-1`, `ISO-5167-2` | ✅ | ISO 5167-1:2022, ISO 5167-2:2022 | F(1); §5.4 F(7) | 2026-10-23 | Equation ✅ as CR-01; loss ratio F(7) |
| CVO-03 | check_valve_orifice | Cracking pressure of check valves | `API-594` | ⚪ | | | | |
| FLT-01 | filter | Datasheet drop at a rated flow in a reference fluid | `ISO-3968` | ⚪ | | | | |
| FLT-02 | filter | Terminal differential pressure as the change-out point | `ISO-16889` | ⚪ | | | | |
| FLT-03 | filter | Quadratic (inertial) plus linear (viscous) porous-media law | `DARCY-FORCHHEIMER` | ➖ | | | | |
| HX-01 | heat_exchanger | Effectiveness-NTU method, limit $C_{\min}/C_{\max} \to 0$ | `KAYS-LONDON`, `INCROPERA`, `EPS-NTU` | ⚪ | | | | |
| HX-02 | heat_exchanger | Flow scaling of UA with $\mathrm{Re}^{0.8}$ for liquid-cooled exchangers | `DITTUS-BOELTER-1930` | ⚪ 🚩 | | | | Attribution, see A.2 |
| HX-03 | heat_exchanger | Background for rated duty, design temperatures and allowable pressure drop | `API-661`, `TEMA` | ⚪ | | | | |
| LCV-01 | linear_control_valve | Incompressible sizing equation (Cv definition) | `IEC-60534-2-1`, `ISA-75.01.01` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | K_Cv = 1.732e9 is Eq. (1) inverted with N1 = 8.65e-2 (−0.1 %, N1 rounding); Annex E Ex. 1 reproduced (459.5 vs 460 kPa). Choked flow (§6.2) and $F_P$ (§8) not modelled |
| LCV-02 | linear_control_valve | Valve Reynolds number and Reynolds number factor $F_R$ | `IEC-60534-2-1`, `ISA-75.01.01` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §9 Eq. (23), Annex A Eq. (A.1), (A.6)-(A.8b), Tab. 1 | 2026-10-23 | Annex A implemented as written (Cv constants of Tab. 1); valve taken as line-size (A.4), $d = D$ = connected pipe bore. Deliberate deviation, stated in the doc, only where (A.7) starts below (A.6) ($n$ ≲ 1.2 with $F_L$ 0.9): no downward jump at Re_V = 10, and $F_R$ grows at most as Re_V^0.75 so Δp never falls with rising Q; Δp up to +20 % ($F_L$ 0.9) / +43 % ($F_L$ 0.98) within scope, Re_V ≈ 10-40. Was ⚠️ (smooth $F_R$ ≥ 0.5) |
| LCV-04 | linear_control_valve | Default $F_L$ = 0.9, $F_d$ = 0.46 (globe single port, contoured plug, flow to open) | `IEC-60534-2-1` | ✅ | IEC 60534-2-1:2011 | Tab. D.2 | 2026-10-23 | Typical values; the standard defers to manufacturer data. Full-travel values used at every opening. D-29b: the 28 rows with a numeric $F_d$ (English IEC terms) seed the built-in valve style catalogue (`services/valve_style_defaults.py`), checked against the DIN EN copy; tapered needle and multistage rows left out. Publishing the coefficient table in the public repo was approved by the user (exception to the copyright rule of the verification skill) |
| LCV-03 | linear_control_valve | Linear inherent characteristic | `ISA-75.11.01`, `IEC-60534-2-4` | ⚪ | | | | |
| REG-01 | linear_regulator | Liquid Cv equation | `IEC-60534-2-1`, `ISA-75.01.01` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | Same as LCV-01 |
| REG-02 | linear_regulator | Linear inherent characteristic | `ISA-75.11.01` | ⚪ | | | | Same clause as LCV-03 |
| REG-03 | linear_regulator | Lock-up: closed tight at zero demand | `EN-334` | ⚪ 🚩 | | | | `EN-334` covers fuel-gas regulators |
| ORI-01 | orifice | Reader-Harris/Gallagher discharge coefficient | `ISO-5167-2` | ✅ | ISO 5167-2:2022 | §5.3.2.1 F(4) | 2026-10-23 | Corner tappings ($L_1 = L_2' = 0$), incl. the $D < 71.12$ mm term |
| ORI-02 | orifice | Permanent pressure loss, §5.4 Formula (7) | `ISO-5167-2` | ✅ | ISO 5167-2:2022 | §5.4.1 F(7) | 2026-10-23 | Evaluated with $C_d$, not $C_m$ |
| ORI-03 | orifice | Validity $\beta \in [0.1, 0.75]$, $d \ge 12.5$ mm, $50 \le D \le 1000$ mm | `ISO-5167-2` | ✅ | ISO 5167-2:2022 | §5.3.1 | 2026-10-23 | Geometry limits ✅. Reynolds limit $16\,000\beta^2$ for β > 0.56 (was a flat 16 000). Roughness limits (Tables 1, 2) not modelled |
| ORI-04 | orifice | General principles and requirements | `ISO-5167-1` | ✅ | ISO 5167-1:2022 | §5.1 F(1), §6.3 | 2026-10-23 | Tap Δp is F(1) inverted with $\varepsilon = 1$. Steady, single-phase flow (§6.3) consistent; cavitation (§6.3.2) not checked |
| PIPE-01 | pipe | Friction pressure drop | `DARCY-WEISBACH` | ➖ | | | | |
| PIPE-02 | pipe | One continuous friction-factor expression for laminar, transition and turbulent flow | `CHURCHILL-1977` | ⚪ | | | | |
| PIPE-03 | pipe | Turbulent limit reproduced by Churchill; independent reference in the tests | `COLEBROOK-1939` | ⚪ | | | | |
| PIPE-04 | pipe | Sharp-edged pipe entrance $K = 0.5$ (A-29) | `CRANE-TP410` | ⚪ 🚩 | | | | Page number depends on the edition |
| PSV-01 | pressure_safety_valve | Set pressure (gauge) | `API-520-1`, `ISO-4126-1` | ⚪ | | | | |
| PSV-02 | pressure_safety_valve | 10 % overpressure for liquid service | `API-520-1`, `ISO-4126-1` | ⚪ | | | | |
| PSV-03 | pressure_safety_valve | Blowdown and reseat pressure | `API-520-1`, `ISO-4126-1` | ⚪ | | | | |
| PSV-04 | pressure_safety_valve | Cold differential test pressure (CDTP) of conventional valves | `API-520-1` | ⚪ | | | | |
| PSV-05 | pressure_safety_valve | Built-up backpressure of conventional valves at most 10 % of set | `API-520-2`, `API-521` | ⚪ | | | | |
| PSV-06 | pressure_safety_valve | Balanced bellows valves usable up to about 50 % of set | `API-520-2`, `API-521` | ⚪ | | | | |
| PSV-07 | pressure_safety_valve | Orifice designations, which the Cv stands in for | `API-526` | ⚪ | | | | |
| PSV-08 | pressure_safety_valve | Seat tightness: the closed valve passes no flow | `API-527` | ⚪ | | | | API 527 sets allowable leakage rates; zero flow is an idealisation |
| PSV-09 | pressure_safety_valve | Liquid Cv equation for the open valve loss | `IEC-60534-2-1` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | Same as LCV-01; IEC scope is control valves (§1): verifies the equation form only; PSV capacity is rated by $K_d$ and area (API 520) |
| RED-01 | reducer | Gradual contraction and enlargement loss coefficients, referenced to the small bore (A-26) | `CRANE-TP410` | ⚪ 🚩 | | | | Page number depends on the edition |
| RED-02 | reducer | Background for conical contractions and diffusers | `IDELCHIK`, `MILLER` | ⚪ | | | | |
| RED-03 | reducer | Darcy friction factor for the transition wall friction | `CHURCHILL-1977` | ⚪ | | | | Same as PIPE-02 |
| RED-04 | reducer | Reducer and pipe dimensions (geometry only) | `ASME-B16.9`, `ASME-B36.10M`, `ASME-B36.19M` | ⚪ | | | | Catalogue data, not hydraulics |
| RED-05 | reducer | Reducer and pipe dimensions (geometry only) | `EN-10253-2`, `EN-10220`, `EN-ISO-1127` | ⚪ | | | | Catalogue data, not hydraulics |
| RLF-01 | relief_device | Gauge set pressure, 10 % overpressure at rated capacity for liquid, blowdown, reseat | `API-520-1`, `ISO-4126-1` | ⚪ | | | | Shares clauses with PSV-01..03 |
| RLF-02 | relief_device | Relieved pressure, accumulation and overpressure scenarios | `API-521`, `ISO-23251` | ⚪ | | | | |
| RLF-03 | relief_device | Bursting discs: burst pressure, open after burst | `ISO-4126-2`, `ASME-VIII-1` | ⚪ 🚩 | | | | Section VIII rules moved to `ASME-XIII` |
| RCV-01 | remote_control_valve | Liquid Cv equation | `IEC-60534-2-1`, `ISA-75.01.01` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | Same as LCV-01 |
| RCV-02 | remote_control_valve | PC → PCV loop notation | `ISA-5.1` | ⚪ | | | | Notation only; the controller is an idealisation |
| RCV-03 | remote_control_valve | Reynolds number factor $F_R$ and default $F_L$, $F_d$ | `IEC-60534-2-1` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §9 Eq. (23), Annex A, Tab. D.2 | 2026-10-23 | Same as LCV-02 and LCV-04 |
| RD-01 | rupture_disc | Burst pressure, application and sizing of bursting discs | `ISO-4126-2`, `ISO-4126-6` | ⚪ | | | | |
| RD-02 | rupture_disc | Rupture disc devices (UG-127) | `ASME-VIII-1` | ⚪ 🚩 | | | | Moved to `ASME-XIII` from 2021 |
| RD-03 | rupture_disc | 10 % overpressure for liquid relief capacity | `API-520-1` | ⚪ | | | | |
| RD-04 | rupture_disc | Flow resistance method ($K_R$) for discs | `API-520-1` | ⚪ | | | | |
| RD-05 | rupture_disc | Orifice flow equation for the reduced bore | `ISO-5167-2` | ✅ | ISO 5167-2:2022 | F(1) | 2026-10-23 | As CR-01; permanent loss ratio F(7) |
| RD-06 | rupture_disc | Liquid Cv equation for the full bore | `IEC-60534-2-1` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | Same as LCV-01; IEC scope is control valves (§1): verifies the equation form only |
| TCV-01 | three_way_tcv | Liquid Cv equation per path | `IEC-60534-2-1`, `ISA-75.01.01` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §6.1 Eq. (1), Tab. 1 | 2026-10-23 | Same as LCV-01 |
| TCV-02 | three_way_tcv | Linear complementary characteristic of a 3-way mixing valve | `ISA-75.11.01` | ⚪ | | | | |
| TCV-03 | three_way_tcv | Reynolds number factor $F_R$ per path and default $F_L$, $F_d$ | `IEC-60534-2-1` | ✅ | IEC 60534-2-1:2011 + Cor.:2015 | §9 Eq. (23), Annex A, Tab. D.2 | 2026-10-23 | Same as LCV-02 and LCV-04; Tab. D.2 has no 3-way row, globe single-port values used per path |
| PDP-01 | volumetric_pump | Flow set by displacement, relief protection on the discharge, rated power | `API-676`, `API-674` | ⚪ | | | | |
| PDP-02 | volumetric_pump | Definitions of displacement, slip and pump efficiency | `HI-3.1-3.5` | ⚪ | | | | |
| PDP-03 | volumetric_pump | NPSHa compared with NPSHr plus a user margin | `HI-9.6.1` | ⚪ 🚩 | | | | HI 9.6.1 covers rotodynamic pumps; rotary PD pumps use NPIP in HI 3.1-3.5 |

Documents with no source: `base_node`, `flow_source`, `pressure_source`, `measure_point`, `mixer`, `splitter`, `tank` (idealisations; principles `MASS-ENERGY`, `GLOBAL-GRADIENT`).

## Part C: Verification log

| Date | Source (edition read) | Claims | Result | By |
| :--- | :--- | :--- | :--- | :--- |
| 2026-10-23 | Bibliographic web check of all sources in Part A (no source text read) | all | Editions recorded in Part A; 🚩 flags on CR-02, CR-03, CVO-02, HX-02, REG-03, PIPE-04, RED-01, RLF-03, RD-02, PDP-03 | Claude, from publisher, standards-body and reseller listings |
| 2026-10-23 | ISO 5167-1:2022 and ISO 5167-2:2022, read as EVS-EN ISO 5167-1/-2:2022 | CR-01, CR-02, CVO-02, ORI-01..04, RD-05 | ✅ CR-01, ORI-01, ORI-02, ORI-04, RD-05; ⚠️ ORI-03; ❌ CR-02, CVO-02; doc error in orifice.md §3.1 (all fixed since) | Claude; second opinion `walflow-physics-reviewer` (agreed) |
| 2026-10-23 | IEC 60534-2-1:2011 + Cor.:2015, read as DIN EN 60534-2-1:2012-01 + Berichtigung 1:2015-11 | CV-01, CVO-01, LCV-01, LCV-02, REG-01, PSV-09, RCV-01, RD-06, TCV-01 | ✅ all Cv-equation claims; ⚠️ LCV-02 (fixed since) | Claude; second opinion `walflow-physics-reviewer` (agreed on Cv equation; raised LCV-02 from ✅ to ⚠️) |
| 2026-10-23 | IEC 60534-2-1:2011, read as DIN EN 60534-2-1:2012-01 (Annex A, Tab. 1, Tab. D.2) | LCV-02, LCV-04, RCV-03, TCV-03 | ✅ all, after Annex A $F_R$ was implemented in the three control valves | Claude; second opinion `walflow-physics-reviewer` (equations, constants and units agreed) |

## Private reference library

Source documents are copyrighted and are **not** stored in this repository. They live in the private repository `walflow-references`, cloned next to this one (`../walflow-references`):

```
walflow-references/
  standards/<Ref ID>_<edition>.pdf      e.g. standards/API-520-1_2020-10th.pdf
  literature/<Ref ID>_<edition>.pdf     e.g. literature/IDELCHIK_2008-4th.pdf
  notes/<Ref ID>_<edition>.md           clause excerpts and verification working notes
```

The file name carries the Ref ID from Part A and the edition, so a claim's "Verified against" entry names the file it was checked against.
