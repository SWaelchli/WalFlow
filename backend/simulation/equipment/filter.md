# Filter (`filter`)

## 1. Functional Overview

Filter or strainer whose pressure drop is entered at a reference flow for the clean and the terminal (dirty) state; the clogging level interpolates between them. The datasheet drop is reproduced in the reference fluid (system fluid unless a reference viscosity is entered).

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `filter`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `dp_clean_bar` | bar | 0.2 |
| `dp_terminal_bar` | bar | 1 |
| `flow_ref_lmin` | L/min | 100 |
| `clogging_pct` | % | 0 |
| `ref_viscosity_mpas` | mPa·s | system fluid |
