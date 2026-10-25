"""The reported pressures belong to the reported temperatures, and the status says whether that was reached."""
import math

import numpy as np
import pytest
import scipy.sparse.linalg as spla

from physics_refs import solve_example
from simulation.equipment.mixer import Mixer
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.tank import Tank
from simulation.fluid_utils import FluidProperties
from simulation.schemas import GlobalSettings, HydraulicNetwork
from simulation.solver import NetworkSolver


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


PROPERTY_ITERATIONS = 4


def _solved_mixer():
    """Hot and cold stream into a mixer: the mixer outlet edge is the one free edge of the mixing solve."""
    K = 273.15
    nodes = {"hot": PressureSource("Hot", 15e5, 60 + K), "cold": PressureSource("Cold", 12e5, 10 + K),
             "mix": Mixer("Mixer", 2), "sink": Tank("Sink", fluid_level=1.0, temperature=10 + K)}
    edges = [{"id": "e1", "source": "hot", "target": "mix", "target_port": "inlet-0", "pipe": Pipe("hot", 1, 0.05)},
             {"id": "e2", "source": "cold", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("cold", 1, 0.05)},
             {"id": "e3", "source": "mix", "target": "sink", "pipe": Pipe("out", 1, 0.05)}]
    gs = GlobalSettings(fluid_type="water", property_iterations=PROPERTY_ITERATIONS)
    for item in [*nodes.values(), *(e["pipe"] for e in edges)]:
        item.global_settings = gs
    solver = NetworkSolver(HydraulicNetwork(nodes=nodes, edges=edges))
    assert solver.solve()["success"]
    q_edges = [e["pipe"].inlets[0].flow_rate for e in solver.edges_list]
    return solver, nodes["mix"].outlets[0], q_edges


def _narrow_range_around(monkeypatch, temperature_k):
    monkeypatch.setattr(FluidProperties, "temperature_range_c",
                        lambda fluid: (temperature_k - 273.15 - 1.0, temperature_k - 273.15 + 1.0))


class _Factor:
    def __init__(self, solution):
        self.solution = solution

    def solve(self, rhs):
        return np.full_like(rhs, self.solution)


def _singular(_matrix):
    raise RuntimeError("singular")


@pytest.mark.parametrize("make_rejection, expected", [
    pytest.param(lambda mp, t: _narrow_range_around(mp, t), math.inf, id="solution_further_outside_the_fluid_range"),
    pytest.param(lambda mp, t: mp.setattr(spla, "splu", lambda m: _Factor(np.nan)), math.inf, id="non_finite_solution"),
    pytest.param(lambda mp, t: mp.setattr(spla, "splu", _singular), 0.0, id="singular_loop_leaves_the_passes_as_answer"),
])
def test_mixing_solve_reports_no_agreement_when_it_is_abandoned(monkeypatch, make_rejection, expected):
    # An abandoned solve must not look like agreement (0), or a settled pass would end the property passes early
    solver, port, q_edges = _solved_mixer()
    # A pipe that gains 10 K between its ends is read as the node's own cooling, so the solve moves the leaving
    # temperature away from where the port sits
    for edge in solver.edges_list:
        if edge["target"] == "mix":
            edge["pipe"].inlets[0].temperature += 10.0
    start = port.temperature
    make_rejection(monkeypatch, start)
    assert solver._solve_mixing(q_edges) == expected
    assert port.temperature == start


def test_property_passes_go_on_after_a_settled_pass_when_the_mixing_solve_is_rejected(monkeypatch):
    solver, _, q_edges = _solved_mixer()
    monkeypatch.setattr(solver, "_solve_mixing", lambda q, min_change=0.0: math.inf)
    solver._propagate_properties(q_edges)
    assert solver.last_prop_iters == PROPERTY_ITERATIONS
    monkeypatch.setattr(solver, "_solve_mixing", lambda q, min_change=0.0: 0.0)
    solver._propagate_properties(q_edges)
    assert solver.last_prop_iters < PROPERTY_ITERATIONS
