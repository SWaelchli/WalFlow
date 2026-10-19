# PressureSource — Constant Pressure Boundary Condition

## 1. Functional Overview

`PressureSource` is a boundary-condition component that imposes a constant pressure at its inlet and outlet ports. It is identical in archetype to a `Tank` (Archetype 4 — Pressure Boundary). The pressure at the ports remains fixed at the configured value, and the flow rate through the node is determined entirely by the downstream and upstream resistance of the connected network.

---

## 2. Governing Model & Standards

The PressureSource enforces a fixed pressure on all ports:

$$P_{\text{port}} = P_{\text{set}} \quad \text{[Pa]}$$

No governing standard applies — this is a mathematical boundary condition representing an idealized infinite-capacity pressure reservoir.

### 2.1 Stagnation pressure, not line pressure

The source is a reservoir: infinite fluid **at rest** at $P_{\text{set}}$. $P_{\text{set}}$ is therefore a stagnation pressure, not the static pressure a gauge reads on a pipe with fluid flowing past it. A pipe the flow leaves the source through takes the entry velocity head (acceleration from rest plus a sharp-edged entrance, $K = 0.5$), see [pipe.md](pipe.md#entry-from-a-reservoir):

$$P_{\text{static, pipe start}} = P_{\text{set}} - (1 + 0.5)\,\frac{\rho v^2}{2}$$

| Pipe velocity (water) | Entry drop |
|---|---|
| 1 m/s | 0.0075 bar |
| 2 m/s | 0.03 bar |
| 3 m/s | 0.07 bar |

What to model with it:

- **Vessel, pressurised tank, utility header or main** feeding a smaller branch: enter the vessel or header pressure. The header velocity is small compared with the branch, so the header pressure is close to stagnation and the branch really does pay the entry. This is the intended use.
- **A cut point inside a line** ("the gauge at this flange reads 6 bar, model from here"): the fluid there already moves at pipe velocity. Entering the gauge reading under-predicts the downstream pressure by the entry drop above. Enter $P_{\text{gauge}} + 1.5\,\rho v^2/2$ instead, or start the model upstream at a vessel. The difference only matters where pressures are low, for example at a pump suction (NPSH).

Design decision: there is no static-pressure ("flowing line") mode and $K$ is not adjustable.
- A boundary that delivers kinetic energy for free at any flow lets an expander recover more pressure than the line loses. A short source → expander → tank line then has no steady state.
- Other entrance shapes (rounded $K \approx 0.04$, projecting $K \approx 1.0$) change the result by hundredths of a bar at normal velocities.

---

## 3. Mathematical Implementation

### 3.1 Port Equations

$$P_{\text{outlet}} = P_{\text{inlet}} = P_{\text{set}}$$

### 3.2 Thermal Balance

The injected fluid temperature is stamped directly:

$$T_{\text{outlet}} = T_{\text{inlet}} = T_{\text{set}}$$

---

## 4. Parameter & Unit Specification

| Parameter | UI Unit | SI Conversion | Backend Attribute | Default |
|---|---|---|---|---|
| Set Pressure | bara | `× 100 000` → Pa | `self.source_pressure` | 6.0 bara |
| Injected Temp | °C | `+ 273.15` → K | `self.temperature` | 20 °C (293.15 K) |

---

## 5. Solver Flags

- `is_pressure_boundary = True`
- `is_flow_boundary = False`
- `blocks_flow_on_shutdown = False`
- `use_mcp_formulation = False`

## Data Fields

Node type: `pressure_source`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `source_pressure_bara` | bar(a) | 6 |
| `temperature_k` | K | 293.15 |
