# Hydraulic Node Base (`HydraulicNode`)

## 1. Functional Overview

`HydraulicNode` is the parent class of every equipment model. It holds the inlet and outlet ports, the solver flags (`is_pressure_boundary`, `is_flow_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation`) and the `calculate()` contract. `GraphParser._build_node` turns each node of a `.wlf` file into one equipment instance; node types without their own fields (`splitter`, `mixer`, `measure_point`) only read the fields below.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## 2. Field Naming Rule

Every node and pipe stores its inputs in its `data` object. Every dimensional field carries its unit in the name:

| Suffix | Unit | Suffix | Unit |
|---|---|---|---|
| `_pa` | Pa | `_lmin` | L/min |
| `_bar` | bar (difference) | `_kw` | kW |
| `_barg` | bar gauge | `_w_k` | W/K |
| `_bara` | bar absolute | `_pct` | % |
| `_c` | °C | `_deg` | degree |
| `_k` | K | `_mpas` | mPa·s |
| `_m` | m | `_mm` | mm |

Fields without a unit (text, flags, `Cv` coefficients, DN numbers, indices) have no suffix. The value in the file is in the unit of the name; the parser converts to SI (Pa, K, m, m³/s, W) for the model.

Each equipment document has a **Data Fields** section listing what the parser reads for its node type. A test (`backend/tests/unit/solver/test_node_fields_documented.py`) checks that these sections and the parser list exactly the same fields, and that every dimensional field follows this rule.

## Data Fields

Node type: all (read for every component).

| Field | Unit in file | Default |
|---|---|---|
| `label` | text | `<type>_<id>` |
| `active` | bool | true |
| `relief_ramp_enabled` | bool | not set |
