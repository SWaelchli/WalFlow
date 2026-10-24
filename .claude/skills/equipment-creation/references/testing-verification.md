# Testing & Verification Guide

The test strategy, layout and rules are in the `walflow-qa` skill (`.claude/skills/walflow-qa/SKILL.md`). For new equipment:

1. **Contracts (automatic).** Add the node `data` strategy to `RESISTANCE_DATA` (two-port resistance) or `PUMP_DATA`
   in `backend/tests/helpers/strategies.py`. `test_equipment_contracts.py` then checks the component over generated
   parameters, fluids and flows. `test_every_canvas_type_builds_a_specific_model` fails until the parser builds the type.
2. **Reference rows.** `backend/tests/unit/equipment/test_<name>.py`: the component's own numbers against an
   independent reference (closed form, standard, datasheet), as one parametrized table:

```python
import pytest
from strategies import build

CASES = [
    # node data, flow L/min, fluid, expected dP bar (source of the value)
    pytest.param({"param1_bar": 1.0}, 60.0, "water", 0.50, id="datasheet-point"),
    pytest.param({"param1_bar": 1.0}, 120.0, "water", 2.00, id="square-law"),
]


@pytest.mark.parametrize("data, flow_lmin, fluid, dp_bar", CASES)
def test_custom_equipment_pressure_drop(data, flow_lmin, fluid, dp_bar):
    from simulation.fluid_utils import FluidProperties
    node = build("custom_equipment", data, fluid)
    rho, mu = FluidProperties.get_density(fluid, 293.15), FluidProperties.get_viscosity(fluid, 293.15)
    assert node.calculate_delta_p(flow_lmin / 60000.0, rho, mu) / 1e5 == pytest.approx(dp_bar, rel=1e-3)
```

3. **Scenario (only if needed).** If the component interacts with controllers, relief or topology handling, add a
   network case in `backend/tests/scenarios/` using the builders in `tests/helpers/networks.py`.

Analytic derivatives: the solver uses `calculate_dp_derivative` only for pipes and pumps and differentiates every
other component numerically, so a new resistance does not need a derivative test.
