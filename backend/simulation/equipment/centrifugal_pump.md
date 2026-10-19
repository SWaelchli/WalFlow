# Centrifugal Pump (`centrifugal_pump`)

## 1. Functional Overview

Adds head along a quadratic curve through the rated duty point, H(Q) = H0 + C·Q² with H0 = rated head·(1 + rise to shut-off). The pressure rise follows the fluid density; a stopped pump is a locked-rotor resistance. Cavitation is flagged when NPSHa < NPSHr + margin.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `centrifugal_pump`, `pump`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_rated_lmin` | L/min | 100 |
| `head_rated_m` | m | required |
| `rise_to_shutoff_pct` | % | 20 |
| `efficiency_pct` | % | 75 |
| `npshr_m` | m | 0 |
| `npsh_margin_m` | m | 0.5 |
