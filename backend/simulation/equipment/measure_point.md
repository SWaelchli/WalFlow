# Measurement Tap (`measure_point`)

The **Measurement Tap** is a sensing location placed in the middle of a pipe run. It lets an instrument bubble or a remote control valve read the line at a point that is not a component port, for example halfway along a long return line, without changing the hydraulics.

---

## 1. Functional Overview
* **Component Type:** Ideal in-line junction with no resistance (`measure_point`)
* **Ports:** 1 Inlet (`inlet-0`) and 1 Outlet (`outlet-0`)
* **Sensing Pin:** Always present, `signal-inlet-0`, reads the inlet port state. In the drawing the pin is shown centred between inlet and outlet. Because the tap has no pressure drop, inlet and outlet are the same state.
* **Insertion:** Right-click a pipe → *Insert measurement tap*. The pipe is split at the clicked point into two halves of half the original length each (default 25 m if no length was set). The upstream half keeps the pipe's id and label, and the downstream half gets the next free pipe label.

---

## 2. Mathematical Modeling & Physics

### A. Pressure Balance
The tap is an ideal point in the line:

$$P_{\text{out}} = P_{\text{in}}, \qquad \Delta P = 0$$

### B. Mass Balance
One inlet and one outlet, so the flow passes through unchanged:

$$Q_{\text{out}} = Q_{\text{in}}$$

### C. Fluid State
Density, viscosity and temperature are copied from inlet to outlet unchanged ($\Delta T = 0$). No energy is added or dissipated.

### D. Equivalence With the Unsplit Pipe
Splitting a pipe of length $L$ into $L/2 + \text{tap} + L/2$ gives the same flow and the same end pressures as the original pipe, because the Darcy–Weisbach friction loss is linear in length:

$$\Delta P_{\text{pipe}}(L) = \Delta P_{\text{pipe}}(L/2) + 0 + \Delta P_{\text{pipe}}(L/2)$$

The tap pressure is then the line pressure at the split point.

---

## 3. Solver Treatment
The class has no `calculate_delta_p`, so the solver treats it like a splitter or mixer: a network junction with one pressure unknown and a mass-balance equation. It adds no resistance term and no Jacobian contribution beyond the junction itself.

---

## 4. Sensing & Instrumentation
* **Remote control valves:** A signal line from the tap pin to a valve's `signal-in` makes the valve hold its set pressure at the tap (`remote_sensing_config = {node_id, port_type: "inlet", port_idx: 0}`).
* **Instrument bubbles (`instrument`):** These are display-only and are not sent to the solver. The graph parser skips them, and the signal lines into them are dropped. The frontend computes their readings (P, ΔP, Q, T, velocity, kinematic viscosity) from the tap's inlet telemetry. Velocity uses the inside diameter of the pipe on the tap's inlet.

---

## 5. Parameter Reference

| Parameter | Type | Unit | Default | Description |
|---|---|---|---|---|
| `label` | `str` | — | `"Measurement Tap n"` | Tag shown on the drawing and in instrument locations |

The tap has no hydraulic parameters.
