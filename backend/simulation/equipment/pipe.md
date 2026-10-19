# Pipe (edge)

## 1. Functional Overview

A pipe connects two components and computes the friction pressure drop with Darcy-Weisbach (Churchill 1977 friction factor, continuous from laminar to turbulent flow), plus the temperature rise from viscous dissipation. Each hydraulic edge of a `.wlf` file becomes one `Pipe`; edges of type `SIGNAL` are sensing links and create no pipe.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

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
