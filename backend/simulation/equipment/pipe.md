# Pipe (edge)

## 1. Functional Overview

A pipe connects two components and computes the friction pressure drop with Darcy-Weisbach (Churchill 1977 friction factor, continuous from laminar to turbulent flow), plus the temperature rise from viscous dissipation. Each hydraulic edge of a `.wlf` file becomes one `Pipe`; edges of type `SIGNAL` are sensing links and create no pipe.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

### Entry from a reservoir

Tanks and pressure sources hold fluid at rest. Where the flow leaves one into the pipe, the static pressure drops by the velocity head of the acceleration from rest plus the entrance loss (Crane TP 410, sharp-edged entrance $K = 0.5$):

$$\Delta P_{\text{entry}} = (1 + K)\,\frac{\rho\,v\,|v|}{2}$$

The term is active only at a reservoir end that the flow leaves (inlet end for $Q > 0$, outlet end for $Q < 0$); value and slope are zero at $Q = 0$. Where the flow enters a reservoir, the kinetic energy is lost in the vessel (exit loss $K = 1$) and the static pressure at the pipe end equals the reservoir pressure, so no term is added. Only the $K$ part heats the fluid; the acceleration is reversible. The reported pipe pressure drop includes the entry term.

Without it, an expander close to a reservoir would recover static pressure that was never deducted, and a short line source → expander → tank had no steady-state solution.

## Data Fields

Pipe (edge) data. Field names follow the naming rule in [base_node.md](base_node.md).

| Field | Unit in file | Default |
|---|---|---|
| `label` | text | `Pipe <id>` |
| `type` | text (`PIPE` / `SIGNAL`) | PIPE |
| `length_m` | m | 25 |
| `diameter_m` | m | 0.1 |
| `roughness_mm` | mm | 0.045 |

The pipe class reference and sizing (`pipe_class_id`, `pipe_class_code`, `schedule_standard_code`, `standardDn`, `standardSch`, `outer_diameter_mm`, `wall_thickness_mm`) are stored for the inspector only; the solver uses `diameter_m` and `roughness_mm`.
