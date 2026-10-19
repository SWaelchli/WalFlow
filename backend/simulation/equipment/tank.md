# Tank (`tank`)

## 1. Functional Overview

Fixed-level reservoir and pressure boundary. The outlet pressure is the atmospheric pressure plus the hydrostatic head of the liquid level and elevation; the tank always holds the system fluid (a per-tank `fluid_type` in old files is ignored).

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `tank`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `elevation_m` | m | 0 |
| `level_m` | m | 1 |
| `temperature_k` | K | 293.15 |
