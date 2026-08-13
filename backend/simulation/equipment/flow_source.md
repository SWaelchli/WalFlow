# FlowSource — Constant Flow Boundary Condition

## 1. Functional Overview

`FlowSource` is a boundary-condition component that forces a constant flow rate leaving its outlet port. It only has an outlet port (0 inlets + 1 outlet) and acts as a flow boundary for the connected network.

---

## 2. Governing Model & Standards

Rather than using a hard topological flow constraint, the Constant Flow source uses a high-stiffness spring approach:

$$\Delta P = \text{stiffness} \times (Q_{\text{actual}} - Q_{\text{target}})$$

Where:

$$\text{stiffness} = \frac{10\,\text{MPa}}{0.01 \times Q_{\text{target}}}$$

This gives a pressure deviation of **10 MPa per 1% flow error** relative to the target, driving the solver to converge to the exact flow rate.

- $\Delta P < 0$ when $Q_{\text{actual}} < Q_{\text{target}}$: the source adds pressure to push flow.
- A hard cap of $|\Delta P| \leq 200\,\text{bar}$ is applied to ensure solver stability.

---

## 3. Mathematical Implementation

### 3.1 Pressure Propagations

$$P_{\text{outlet}} = P_{\text{node}} - \Delta P$$

Since the `FlowSource` has no inlet, $P_{\text{node}}$ represents the internal reference pressure of the source, which the solver pins to the ambient atmospheric pressure ($101,325\,\text{Pa}$).

### 3.2 Analytical Jacobian

$$\frac{\partial \Delta P}{\partial Q} = \text{stiffness}$$

If the pressure boost is clamped by the 200 bar hard cap, the derivative drops to `0.0` to reflect saturation.

### 3.3 Thermal Balance

The injected fluid temperature is stamped directly on the outlet:

$$T_{\text{outlet}} = T_{\text{set}}$$

---

## 4. Parameter & Unit Specification

| Parameter | UI Unit | SI Conversion | Backend Attribute | Default |
|---|---|---|---|---|
| Set Flow | L/min | `/ 60 000` → m³/s | `self.source_flow` | 50.0 L/min |
| Injected Temp | °C | `+ 273.15` → K | `self.temperature` | 20 °C (293.15 K) |

---

## 5. Solver Flags

- `is_pressure_boundary = False`
- `is_flow_boundary = False` (spring approach)
- `blocks_flow_on_shutdown = False`
- `use_mcp_formulation = False`
