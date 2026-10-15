# Node data fields and units

What the backend (`graph_parser.py › create_node`) reads from a node's `data` object in a `.wlf` file. The names are historical and **mixed**: some carry a unit suffix, some are bare. Do not rename them (a rename is a format break, see ROADMAP "Unit-Consistent Node Data Field Names"). A test (`test_f1_20_node_fields.py`) checks that this table and the parser list exactly the same fields.

**Convention for new fields:** always put the unit in the name (`_pa`, `_bar`, `_barg`, `_bara`, `_lmin`, `_c`, `_k`, `_m`, `_mm`, `_kw`, `_pct`).

Units in the file are what the user's data holds; the parser converts to SI (Pa, K, m, m³/s, W) for the model.

| Type | Field | Unit in file | Default |
|---|---|---|---|
| all | `label` | text | `<type>_<id>` |
| all | `active` | bool | true |
| all | `relief_ramp_enabled` | bool | - |
| calibrated_restriction | `fluid_type` | catalogue id (`system` = global) | system |
| tank | `elevation` | m | 0 |
| tank | `level` | m | 1 |
| tank | `temperature` | **K** | 293.15 |
| centrifugal_pump | `flow_rated_lmin` | L/min | 100 |
| centrifugal_pump | `head_rated_m` | m (required) | - |
| centrifugal_pump | `rise_to_shutoff_pct` | % | 20 |
| centrifugal_pump | `efficiency` | % | 75 |
| centrifugal_pump | `npshr_m` | m | 0 |
| centrifugal_pump | `npsh_margin_m` | m | 0.5 |
| volumetric_pump | `flow_rated` | **L/min** | 100 |
| volumetric_pump | `motor_power` | **kW** | 5 |
| volumetric_pump | `efficiency` | % | 85 |
| volumetric_pump | `drive_type` | `fixed_speed` / `vfd` | fixed_speed |
| volumetric_pump | `max_discharge_pressure_bara` | bar(a) | 50 |
| linear_control_valve | `max_cv` | Cv (US gpm/psi^0.5) | 0.05 |
| linear_control_valve | `opening` | % | 50 |
| remote_control_valve, linear_regulator | `max_cv` | Cv | 0.05 |
| remote_control_valve, linear_regulator | `set_pressure` | **Pa** | 500000 |
| remote_control_valve, linear_regulator | `backpressure` | bool | false |
| orifice | `pipe_diameter` | **m** | 0.1 |
| orifice | `orifice_diameter` | **m** | 0.07 |
| orifice | `standard` | text | iso_5167 |
| calibrated_restriction | `flow_base_lmin` | L/min | 10 |
| calibrated_restriction | `inlet_pressure_base_bar` | bar(a) | 3.5 |
| calibrated_restriction | `outlet_pressure_base_bar` | bar(a) | 1 |
| calibrated_restriction | `temp_base_c` | °C | 45 |
| calibrated_restriction | `restriction_model` | text | orifice |
| reducer, expander | `diameter_in`, `diameter_out`, `length`, `roughness` | **m** | DN80 x DN50 STD |
| reducer, expander | `cone_angle_deg` | deg | - |
| reducer, expander | `reducer_type`, `standard`, `dn_large`, `dn_small`, `sch_large`, `sch_small` | text | - |
| heat_exchanger | `rated_cooling_kw` | kW | 300 |
| heat_exchanger | `rated_flow_lmin` | L/min | 500 |
| heat_exchanger | `rated_dp_bar` | bar | 0.5 |
| heat_exchanger | `design_inlet_temp_c`, `design_outlet_temp_c`, `medium_temp_c` | °C | 50 / 40 / 10 |
| heat_exchanger | `cooler_type`, `rating_method` | text | water_cooled / rated_duty |
| heat_exchanger | `ua_direct_w_k` | W/K | 1000 |
| filter | `dp_clean`, `dp_terminal` | **bar** | 0.2 / 1 |
| filter | `flow_ref` | **L/min** | 100 |
| filter | `clogging` | % | 0 |
| filter | `ref_viscosity` | mPa·s | system fluid |
| three_way_tcv | `max_cv` | Cv | 0.1 |
| three_way_tcv | `set_temperature_c` | °C | 40 |
| three_way_tcv | `hot_port_idx` | 0 or 1 | 0 |
| check_valve, check_valve_orifice | `cv` | Cv | 10 |
| check_valve, check_valve_orifice | `cracking_pressure_bar` | bar | 0.05 |
| check_valve_orifice | `pipe_diameter`, `orifice_diameter` | **m** | 0.1 / 0.01 |
| pressure_safety_valve | `set_pressure_barg` | barg (required) | - |
| pressure_safety_valve | `cv` | Cv | 10 |
| pressure_safety_valve | `action_mode` | text | pop_action |
| pressure_safety_valve | `blowdown_pct` | % | 7 |
| pressure_safety_valve, rupture_disc | `forced_state` | text | auto |
| rupture_disc | `burst_pressure_barg` | barg (required) | - |
| rupture_disc | `bore_type` | text | full_bore |
| rupture_disc | `cv` | Cv | 10 |
| rupture_disc | `pipe_diameter`, `orifice_diameter` | **m** | 0.05248 / 0.01 |
| pressure_source | `source_pressure_bara` | bar(a) | 6 |
| pressure_source | `temperature` | **K** | 293.15 |
| flow_source | `source_flow_lmin` | L/min | 50 |
| flow_source | `temperature` | **K** | 293.15 |
| flow_source | `max_discharge_pressure_bara` | bar(a) | 50 |

Edge (pipe) data: `length` (m), `diameter` (m), `roughness_mm` (mm; or `roughness` in m), `label`, `type` (`SIGNAL` for signal links). The global `global_roughness` setting was removed in B5.

Bold units are the ones that differ from the usual field style of the same quantity elsewhere (K vs °C, Pa vs bar, m vs mm).
