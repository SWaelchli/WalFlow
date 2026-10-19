# Remote Control Valve (`remote_control_valve`)

## 1. Functional Overview

Control valve that holds a set pressure at a remote point. The solver adjusts the opening until the pressure at the sensed port (connected by a signal line) reaches the set pressure; `backpressure` reverses the control action (the valve opens as the sensed pressure rises).

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `remote_control_valve`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv | 0.05 |
| `set_pressure_pa` | Pa | 500000 |
| `backpressure` | bool | false |
