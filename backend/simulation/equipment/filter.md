# Filter (`filter`)

## 1. Overview & Purpose

A filter or strainer whose pressure drop is taken from its datasheet: the drop at a rated flow for the **clean** element and for the **terminal** (fully loaded, change-out) element. A clogging level between 0 and 100 % interpolates between the two. The drop scales with flow, density and, at low mesh Reynolds numbers, viscosity, so a cold oil start shows a higher filter drop.

- **Ports:** two neutral ports, `port-0` and `port-1`, with no inlet or outlet. The component is a [component link](component_link.md) between two hidden nodes at its ports, each with a solved pressure: the flow sign picks the upstream port. Telemetry `ports[k]` has `flow_rate` positive into the component.

Use it for suction strainers, duplex lube oil filters, return line filters and basket strainers.

## 2. Governing Standards & Reference Literature

Each claim is tracked in [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md) with the edition and clause it was verified against. ⚪ unverified (LLM-cited, not yet checked against the source), ✅ verified, ⚠️ deviation, ➖ textbook principle, 🚩 open pre-check flag.

| Claim | Type | Source (edition) | Used for | Status |
| :--- | :--- | :--- | :--- | :--- |
| FLT-01 | Literature | ISO 3968:2017 | Datasheet drop at a rated flow in a reference fluid | ⚪ Unverified |
| FLT-02 | Standard | ISO 16889:2022 | Terminal differential pressure as the change-out point | ⚪ Unverified |
| FLT-03 | Principle | Darcy-Forchheimer law | Quadratic (inertial) plus linear (viscous) term, which the viscosity factor reproduces at low Re | ➖ Principle |

## 3. Physical & Mathematical Implementation

### 3.1 Reference state

The datasheet drops refer to the system fluid at a reference temperature:

| System fluid | $T_{\text{ref}}$ | $\mu_{\text{ref}}$ |
| :--- | :--- | :--- |
| Water & aqueous | 20 °C | system fluid at 20 °C, or the entered reference viscosity |
| Oils, fuels, others | 40 °C | system fluid at 40 °C, or the entered reference viscosity |

$\rho_{\text{ref}}$ is always the system fluid at $T_{\text{ref}}$. A reference viscosity of 0 (or empty) means "auto".

### 3.2 Mesh Reynolds number

$$A_{\text{el}} = \max\!\left(10^{-4},\ \frac{Q_{\text{ref}}}{\max\!\big(0.1,\ \sqrt{2 \max(100,\ \Delta P_{\text{clean}}) / 1000}\big)}\right)\ \text{m}^2, \qquad \mathrm{Re} = \frac{\rho\, (|Q| / A_{\text{el}})\, d_p}{\mu}, \quad d_p = 1\ \text{mm}$$

$A_{\text{el}}$ is a representative element area derived from the clean drop, $d_p$ a representative pore size.

### 3.3 Viscosity factor (`FluidProperties.get_filter_viscosity_factor`)

$$f(\mathrm{Re}) = \begin{cases} 1 + 100/\mathrm{Re} & \mathrm{Re} < 2000 \\ 1 + (1 - w)\cdot 100/\mathrm{Re}, \quad w = \dfrac{\mathrm{Re} - 2000}{2000} & 2000 \le \mathrm{Re} \le 4000 \\ 1 & \mathrm{Re} > 4000 \end{cases}$$

With $\mathrm{Re} \propto |Q|$, the laminar branch gives $\Delta P = K\rho\,(Q|Q| + c\,Q)$, a Forchheimer form: viscous at low flow, quadratic at high flow. The blend is continuous ($C^0$); its slope changes at Re 2000 and 4000, where the factor is already within 5 % of 1.

### 3.4 Resistance and pressure drop (`get_resistance_k`, `calculate_delta_p`)

$$K_{\text{clean}} = \frac{\Delta P_{\text{clean}}}{\rho_{\text{ref}}\, Q_{\text{ref}}^2\, f(\mathrm{Re}_{\text{ref}})}, \qquad K_{\text{term}} = \frac{\Delta P_{\text{term}}}{\rho_{\text{ref}}\, Q_{\text{ref}}^2\, f(\mathrm{Re}_{\text{ref}})}$$

$$K = K_{\text{clean}} + \frac{\text{clogging}}{100}\,(K_{\text{term}} - K_{\text{clean}}), \qquad \Delta P = K\, \rho\, Q|Q|\, f(\mathrm{Re})$$

At the rated flow in the reference fluid, the drop is exactly the datasheet value, interpolated linearly with clogging.

### 3.5 Worked example

Clean 0.2 bar, terminal 1.0 bar at 100 L/min:

| Fluid | Temperature | Mesh Re | Clogging | $\Delta P$ at 100 L/min |
| :--- | :--- | :--- | :--- | :--- |
| Water | 20 °C (reference) | 6 300 | 0 % | 0.200 bar |
| Water | 80 °C | 17 500 | 0 % | 0.195 bar (density only) |
| ISO VG 46 | 40 °C (reference) | 137 | 0 % | 0.200 bar |
| ISO VG 46 | 20 °C | 47 | 0 % | 0.366 bar |
| ISO VG 46 | 80 °C | 570 | 0 % | 0.132 bar |
| ISO VG 46 | 40 °C | 137 | 50 % | 0.600 bar |

### 3.6 Derivative

The class has no analytical derivative; the component link differentiates $\Delta P$ numerically (central difference, [component_link.md](component_link.md)). $\Delta P$ is odd in $Q$, so the port order does not matter.

## 4. Thermal & Energy Balance

The whole pressure drop is throttling loss:

$$\Delta T = \frac{|\Delta P|}{\rho\, c_p(T)}$$

applied at the port the flow leaves by, with the upstream port's density and viscosity; the component link evaluates it in its property pass ([component_link.md](component_link.md)).

## 5. Parameter & Unit Specification Table

| Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Clean ΔP | bar (psi) | `self.dp_clean` | Pa | 0.2 bar | $> 0$ | Drop of the clean element at the rated flow |
| Terminal ΔP | bar (psi) | `self.dp_terminal` | Pa | 1.0 bar | $\ge$ clean | Drop of the loaded element at the rated flow |
| Rated Flow | L/min (GPM) | `self.flow_ref` | m³/s | 100 L/min | $> 0$ | Flow of the datasheet drops |
| Clogging Level | % | `self.clogging_pct` | % | 0 | 0-100 | Element loading |
| Reference viscosity | mPa·s | `self.ref_viscosity_mpas` | mPa·s | auto (system fluid at $T_{\text{ref}}$) | $\ge 0$, 0 = auto | Viscosity of the datasheet fluid |

## 6. Operating Modes & Model Boundaries

- **Steady state:** a fixed clogging level; no loading over time ($\Delta t = 0$).
- **Solver flags:** all `False` (`is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`).
- **Inactive:** `active` has no effect.
- **Reverse flow:** symmetric (a real element may collapse; not modelled).
- **Operating cases:** clogging and the datasheet values can be overridden per case (e.g. clean and dirty cases).
- **Not modelled:**
  - bypass valve of the filter housing (add a [check valve](check_valve.md) in parallel);
  - the housing loss separately from the element;
  - particle capture, $\beta$-ratio and loading over time;
  - element collapse pressure.

## 7. Verification & Benchmarks

| Test | Benchmark |
| :--- | :--- |
| `backend/tests/unit/equipment/test_filter_reference_fluid.py::test_f1_19_water_20c_reproduces_datasheet` | Water at 20 °C, rated flow: 0.15 bar exactly ($10^{-9}$) |
| `test_filter_reference_fluid.py::test_f1_19_oil_40c_reproduces_datasheet` | ISO VG 46 at 40 °C, rated flow: 0.15 bar and 0.5 bar exactly ($10^{-9}$) |
| `test_filter_reference_fluid.py::test_f1_19_cold_oil_has_higher_dp_but_not_by_480_percent` | ISO VG 46 at 10 °C: 1.5 to 6 times the datasheet drop |
| `test_filter_reference_fluid.py::test_f1_19_explicit_reference_viscosity` | Reference viscosity 100 mPa·s: at that viscosity and the reference density, 0.15 bar exactly |
| `backend/tests/unit/equipment/test_filter.py::test_clean_filter_reproduces_rating_point_with_water` | Flow boundary 100 L/min → filter (1.0 bar clean) → tank, water at 20 °C: 1.0 bar within 5 % |
| `test_filter.py::test_cold_oil_gives_higher_filter_dp` | ISO VG 46: drop at 20 °C above the drop at 60 °C |
| `backend/tests/unit/fluids/test_throttling_heat.py::test_f1_16_throttling_heat_magnitude` | Outlet temperature rise $= \Delta P/(\rho c_p)$ within 2 % |

## Data Fields

Node type: `filter`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `dp_clean_bar` | bar | 0.2 |
| `dp_terminal_bar` | bar | 1 |
| `flow_ref_lmin` | L/min | 100 |
| `clogging_pct` | % | 0 |
| `ref_viscosity_mpas` | mPa·s | system fluid |
