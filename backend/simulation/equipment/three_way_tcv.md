# 3-Way Temperature Control Valve (`three_way_tcv`)

## 1. Functional Overview

Mixing valve: the solver sets the mix ratio (opening of the hot port, the cold port gets the rest) so the mixed outlet reaches the set temperature.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `three_way_tcv`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv | 0.1 |
| `set_temperature_c` | °C | 40 |
| `hot_port_idx` | index (0 or 1) | 0 |
