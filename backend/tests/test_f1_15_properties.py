"""F1-15: the reported pressures belong to the reported temperatures, and the status says whether that was reached."""
import pytest

from physics_refs import solve_example


@pytest.mark.parametrize("case", ["Case 1", "Cold start (20", "TCV failed open"])
def test_property_loop_converges_and_pipes_are_consistent(case):
    net, stats = solve_example("Example_API_614_LOS", case)
    assert stats["success"] and stats["properties_converged"]
    for edge in net.edges:
        if net.nodes[edge["target"]].node_type == "three_way_tcv":
            continue        # the reported pipe end pressure of a TCV feed includes the TCV path loss
        pipe = edge["pipe"]
        q = pipe.inlets[0].flow_rate
        dp_reported = pipe.inlets[0].pressure - pipe.outlets[0].pressure
        dp_model = pipe.calculate_delta_p(q, pipe.inlets[0].density, pipe.inlets[0].viscosity)
        assert dp_reported == pytest.approx(dp_model, rel=0.01, abs=100.0), pipe.name


def test_stats_carry_the_status_flags():
    _, stats = solve_example("Example_Pressure_Regulation")
    for key in ("controls_converged", "saturated_controllers", "properties_converged", "physical_validity"):
        assert key in stats
    assert stats["controls_converged"] and stats["properties_converged"]
