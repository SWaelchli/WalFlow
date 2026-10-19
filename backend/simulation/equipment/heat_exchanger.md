# Heat Exchanger (`heat_exchanger`)

## 1. Functional Overview

Cooler rated at a design duty point: Q = UA·(T_fluid,avg − T_medium) with UA scaled by (Q/Q_rated)^0.8. UA comes from the rated duty, from design temperatures or is entered directly. The pressure drop is quadratic through the rated drop at rated flow.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `heat_exchanger`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `rated_cooling_kw` | kW | 300 |
| `rated_flow_lmin` | L/min | 500 |
| `rated_dp_bar` | bar | 0.5 |
| `design_inlet_temp_c` | °C | 50 |
| `design_outlet_temp_c` | °C | 40 |
| `medium_temp_c` | °C | 10 |
| `cooler_type` | text (`water_cooled` / `air_cooled`) | water_cooled |
| `rating_method` | text (`rated_duty` / `design_temps` / `ua_direct`) | rated_duty |
| `ua_direct_w_k` | W/K | 1000 |
