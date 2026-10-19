# Linear Control Valve (`linear_control_valve`)

## 1. Functional Overview

Control valve with a linear trim: effective Cv = max Cv · opening / 100.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `linear_control_valve`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv (US gpm/psi^0.5) | 0.05 |
| `opening_pct` | % | 50 |
