# Rupture Disc (`rupture_disc`)

## 1. Functional Overview

Burst diaphragm: intact at the start of each run, bursts and stays open when the inlet gauge pressure reaches the burst pressure. Full bore is Cv-governed, reduced bore is orifice-governed (pipe bore defaults to the connected pipe).

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Data Fields

Node type: `rupture_disc`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `burst_pressure_barg` | barg | required |
| `bore_type` | text (`full_bore` / `reduced_bore`) | full_bore |
| `cv` | Cv | 10 |
| `pipe_diameter_m` | m | 0.05248 |
| `orifice_diameter_m` | m | 0.01 |
| `forced_state` | text (`auto` / `forced_closed` / `forced_open`) | auto |
