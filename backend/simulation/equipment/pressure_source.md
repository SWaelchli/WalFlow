# PressureSource — Constant Pressure Boundary Condition

## 1. Functional Overview

`PressureSource` is a boundary-condition component that imposes a constant pressure at its inlet and outlet ports. It is identical in archetype to a `Tank` (Archetype 4 — Pressure Boundary). The pressure at the ports remains fixed at the configured value, and the flow rate through the node is determined entirely by the downstream and upstream resistance of the connected network.

---

## 2. Governing Model & Standards

The PressureSource enforces a fixed pressure on all ports:

$$P_{\text{port}} = P_{\text{set}} \quad \text{[Pa]}$$

No governing standard applies — this is a mathematical boundary condition representing an idealized infinite-capacity pressure reservoir.

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
