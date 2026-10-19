# Calibrated Restriction (`calibrated_restriction`)

## 1. Functional Overview

Restriction calibrated from one known operating point (flow, inlet and outlet pressure, temperature) and scaled to other conditions with an orifice, laminar or quadratic model. The bore defaults to the connected pipe.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `calibrated_restriction`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_base_lmin` | L/min | 10 |
| `inlet_pressure_base_bara` | bar(a) | 3.5 |
| `outlet_pressure_base_bara` | bar(a) | 1 |
| `temp_base_c` | °C | 45 |
| `restriction_model` | text (`orifice` / `laminar` / `quadratic`) | orifice |
| `fluid_type` | catalogue id (`system` = global) | system |
