# Check Valve with Bypass Orifice (`check_valve_orifice`)

## 1. Functional Overview

Check valve with an integrated bypass orifice: restricted flow through the orifice in reverse or below cracking pressure, parallel flow through trim and orifice when open. The pipe bore defaults to the connected pipe.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `check_valve_orifice`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `cv` | Cv | 10 |
| `cracking_pressure_bar` | bar | 0.05 |
| `pipe_diameter_m` | m | 0.1 |
| `orifice_diameter_m` | m | 0.01 |
