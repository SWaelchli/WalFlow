# Linear Regulator (`linear_regulator`)

## 1. Functional Overview

Self-acting pressure regulator: the solver adjusts the opening in an outer loop until the outlet pressure reaches the set pressure; `backpressure` holds the inlet pressure instead.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `linear_regulator`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv | 0.05 |
| `set_pressure_pa` | Pa | 500000 |
| `backpressure` | bool | false |
