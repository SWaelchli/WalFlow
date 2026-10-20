# 3-Way Temperature Control Valve (`three_way_tcv`)

## 1. Functional Overview

Mixing valve: the solver sets the mix ratio (opening of the hot port, the cold port gets the rest) so the mixed outlet reaches the set temperature.

> Short description. The full description per the equipment documentation standard is on the ROADMAP ("Detailed Equipment Documentation").

## Control Loop

The solver finds the mix ratio between hydraulic solves, one step per outer iteration (`NetworkSolver._tcv_step`):

- Unknown z = logit(mix ratio), error e = T_out − T_set. Step dz = −α·e / slope, limited to |dz| ≤ 3.
- Slope dT_out/dz: secant from the previous iteration, so density, throttling heat and inlet temperatures that move with the mix (e.g. a cooler outlet) are included. Before a secant exists, or when it is implausible (outside 0.05 to 20 times the estimate), the mass-weighted mixing balance gives (T_hot − T_cold)·w·(1 − w), w = hot mass fraction.
- α starts at 1, halves when the error changes sign and grows (overshoot), and recovers while the error falls with the same sign.
- Setpoint outside the inlet span: straight to the end stop (mix ratio 0.001 or 0.999). Hot port colder than the cold port: the valve acts by port role, so it runs to an end stop (which one depends on the start).
- A step that leaves a port without forward flow goes back halfway to the last regular point.
- Settled at |e| < 0.01 K, at an end stop, or when the mix ratio no longer moves.

Scenario tests: `tests/scenarios/test_tcv_loop_convergence.py`; manual benchmark: `tests/bench/bench_tcv_loop.py`.

## Data Fields

Node type: `three_way_tcv`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `max_cv` | Cv | 0.1 |
| `set_temperature_c` | °C | 40 |
| `hot_port_idx` | index (0 or 1) | 0 |
