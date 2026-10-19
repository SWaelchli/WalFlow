# Volumetric Pump (`volumetric_pump`)

## 1. Functional Overview

Positive displacement pump: the flow is set by the displacement through a stiff spring ΔP = k·(Q_rated − Q). With `fixed_speed` the motor overload is flagged when the shaft power exceeds the motor rating; with `vfd_power_limit` the flow is reduced to stay within the rating. The outlet pressure is limited to the max. discharge pressure.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `volumetric_pump`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_rated_lmin` | L/min | 100 |
| `motor_power_kw` | kW | 5 |
| `efficiency_pct` | % | 85 |
| `drive_type` | text (`fixed_speed` / `vfd_power_limit`) | fixed_speed |
| `max_discharge_pressure_bara` | bar(a) | 50 |
| `npshr_m` | m | 0 |
| `npsh_margin_m` | m | 0.5 |
