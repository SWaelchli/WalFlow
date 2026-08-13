# FluidSource — Universal Fluid Boundary Condition

## 1. Functional Overview

`FluidSource` is a compact, mode-switchable hydraulic boundary component that serves as either a fixed-pressure supply header or a fixed-flow-rate feed line. A single `source_type` property selects between two distinct solver archetypes, enabling engineers to seamlessly switch between pressure-driven and flow-driven supply scenarios without re-piping the diagram.

**Typical use cases:**
- Plant utility water main (Constant Pressure, e.g. 6 bara header)
- Municipal water connection (Constant Pressure, city supply)
- Dosing pump / metering pump (Constant Flow, e.g. 10 L/min chemical injection)
- Regulated feed line with a calibrated flow controller (Constant Flow)

---

## 2. Governing Model & Standards

### 2.1 Constant Pressure Mode — Dirichlet Boundary Condition

The FluidSource in pressure mode imposes a fixed hydraulic head at its connection ports:

$$P_{\text{port}} = P_{\text{set}} \quad \text{[Pa]}$$

This is identical in archetype to a `Tank` (Archetype 4 — Pressure Boundary). The solver treats this node as a known pressure node and eliminates it from the system of unknowns. The resulting flow rate and direction are entirely determined by the connected network.

**No governing standard applies** — this is a mathematical boundary condition representing an idealized infinite-capacity pressure reservoir.

### 2.2 Constant Flow Mode — Stiffness-Spring Formulation

Rather than using a hard topological flow constraint (which would require solver restructuring), the Constant Flow mode uses the same high-stiffness spring approach used by `VolumetricPump`:

$$\Delta P = \text{stiffness} \times (Q_{\text{target}} - Q_{\text{actual}})$$

Where:

$$\text{stiffness} = \frac{10\,\text{MPa}}{0.01 \times Q_{\text{target}}}$$

This gives a pressure deviation of **10 MPa per 1% flow error** relative to the target — sufficient to drive the solver to within < 0.01% of the set flow in all practical networks.

**Sign convention:**
- $Q_{\text{target}} > 0$: net flow from inlet → outlet (supply)
- $Q_{\text{target}} < 0$: net flow from outlet → inlet (return / sink)
- $\Delta P > 0$: the FluidSource adds pressure to the network (supply energy)

**Hard cap:** $|\Delta P| \leq 200\,\text{bar}$ — prevents runaway during early solver iterations.

---

## 3. Mathematical Implementation

### 3.1 Pressure Mode

$$P_{\text{outlet}} = P_{\text{inlet}} = P_{\text{set}}$$

All ports are stamped directly. Solver flow rate is read back in `calculate()`.

### 3.2 Flow Mode — `calculate_delta_p`

$$\Delta P(Q) = \text{stiffness} \times (Q_{\text{target}} - Q)$$

where $\text{stiffness} = \frac{10^7\,\text{Pa}}{0.01 \, Q_{\text{target}}}$ for $Q_{\text{target}} > 0$.

Clamped: $\Delta P \in [-200\,\text{bar},\; +200\,\text{bar}]$.

### 3.3 Analytical Jacobian — `calculate_dp_derivative`

$$\frac{\partial \Delta P}{\partial Q} = -\text{stiffness}$$

This is a constant (linear spring), so the derivative is exact and continuous everywhere — guaranteeing Newton-Raphson quadratic convergence.

### 3.4 Thermal Balance

The FluidSource stamps the injected fluid temperature $T_{\text{set}}$ on both ports regardless of mode. This represents a utility header maintaining a fixed supply temperature (e.g. a plant header maintained at 20°C). No viscous dissipation heat rise is applied — the source is assumed to have infinite thermal capacity.

$$T_{\text{outlet}} = T_{\text{inlet}} = T_{\text{set}}$$

---

## 4. Parameter & Unit Specification

| Frontend Parameter | UI Unit | SI Conversion | Backend Attribute | Default |
|---|---|---|---|---|
| `source_type` | — | — (string passthrough) | `self.source_type` | `"pressure"` |
| `source_pressure_bara` | bara | `× 100 000` → Pa | `self.source_pressure` | 6.0 bara |
| `source_flow_lmin` | L/min | `/ 60 000` → m³/s | `self.source_flow` | 50.0 L/min |
| `temperature` | K | passthrough | `self.temperature` | 293.15 K (20°C) |

---

## 5. Solver Flags

| Flag | Pressure Mode | Flow Mode |
|---|---|---|
| `is_pressure_boundary` | `True` | `False` |
| `is_flow_boundary` | `False` | `False` (spring approach) |
| `blocks_flow_on_shutdown` | `False` | `False` |
| `use_mcp_formulation` | `False` | `False` |

---

## 6. Assumptions & Boundaries

1. **Steady-state only** — no transient accumulation, no tank fill/drain dynamics.
2. **Infinite capacity** — the source maintains its set pressure or flow regardless of connected load; no depletion or backpressure saturation modeled.
3. **Fixed temperature** — the injected temperature is a constant boundary condition. No mixing computation is performed at the source.
4. **Fluid type** — inherited from global simulation settings; the FluidSource does not carry its own fluid type.
5. **Flow mode convergence** — the stiffness parameter is calibrated for $Q_{\text{target}} \in [0.01, 10]\,\text{L/min}$ through $[100, 10000]\,\text{L/min}$. Very small targets ($< 0.01\,\text{L/min}$) fall back to the global stiffness constant of $10^{10}\,\text{Pa/(m³/s)}$.

---

## 7. Validation Benchmarks

| Test | Expected Result |
|---|---|
| Pressure mode: `source_pressure = 6 bara`, open pipe to atmosphere (1.013 bara) | Port pressure = 600 000 Pa; solver determines flow from pipe resistance |
| Flow mode: `source_flow = 50 L/min` in a simple resistance circuit | Actual solved flow ≈ 50 L/min ± 0.01% |
| Derivative check (flow mode): analytical vs. numerical central difference at $Q = 0.01\,\text{m³/s}$, $\delta = 10^{-7}$ | $|d_{\text{analytical}} - d_{\text{numerical}}| < 10^{-3}$ |
