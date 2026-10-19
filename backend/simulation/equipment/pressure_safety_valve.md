# Pressure Safety Valve (`pressure_safety_valve`)

## 1. Functional Overview

Relief valve with pop action, modulating or rupture-disc behaviour and relief capacity tracking. Closed below the set pressure (gauge); a pop-action valve reseats at set·(1 − blowdown). `forced_state` overrides the valve for contingency cases.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `pressure_safety_valve`, `psv`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `set_pressure_barg` | barg | required |
| `cv` | Cv | 10 |
| `action_mode` | text (`pop_action` / `modulating` / `rupture_disc`) | pop_action |
| `blowdown_pct` | % | 7 |
| `forced_state` | text (`auto` / `forced_closed` / `forced_open`) | auto |
