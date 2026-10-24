"""A pressure regulator closes tight (lock-up) when nothing downstream draws flow."""
import pytest


import pytest

from physics_refs import solve
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.tank import Tank

ID = 0.0266
ATM = 101325.0


def _prv_with_downstream_valve(valve_opening, supply_bara=10.0, set_bara=5.0):
    nodes = {
        "src": PressureSource("Supply", source_pressure=supply_bara * 1e5),
        "prv": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_bara * 1e5, backpressure=False),
        "cv": LinearControlValve("Consumer", max_cv=5.0, opening_pct=valve_opening),
        "t": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "src", "target": "prv", "pipe": Pipe("p1", 2, ID)},
        {"source": "prv", "target": "cv", "pipe": Pipe("p2", 2, ID)},
        {"source": "cv", "target": "t", "pipe": Pipe("p3", 2, ID)},
    ]
    stats = solve(nodes, edges)
    assert stats["success"]
    return nodes, stats


class BlindValve(LinearControlValve):
    """A consumer that is shut absolutely tight (no leakage), so the PRV carries zero demand."""

    def calculate_delta_p(self, flow_rate, density, viscosity=0.001):
        return 1e15 * flow_rate


INF = float("inf")


@pytest.mark.parametrize("opening, flow_lmin, opening_pct, saturated_allowed", [
    # C3 of the audit gave downstream = 9.99 bar(a): the PRV at 0.22 % passed the closed valve's leak
    pytest.param(0.0, (-INF, 0.05), (-INF, 0.1), True, id="closed-consumer"),   # only the leakage of the closed valve
    pytest.param(1.0, (0.0, INF), (0.0, 100.0), False, id="small-demand"),
])
def test_prv_holds_its_setpoint_with_a_closed_or_small_consumer(opening, flow_lmin, opening_pct, saturated_allowed):
    nodes, stats = _prv_with_downstream_valve(opening)
    prv = nodes["prv"]
    assert prv.outlets[0].pressure / 1e5 == pytest.approx(5.0, abs=1e-3)   # the audit's 5.75 bar miss at 1 %
    assert flow_lmin[0] < prv.inlets[0].flow_rate * 60000 < flow_lmin[1]
    assert opening_pct[0] < prv.opening_pct < opening_pct[1]
    assert stats["controls_converged"]
    if not saturated_allowed:
        assert not stats["saturated_controllers"]


def test_tight_shut_consumer_locks_the_prv_up():
    nodes = {
        "src": PressureSource("Supply", source_pressure=10.0e5),
        "prv": LinearRegulator("PRV", max_cv=5.0, set_pressure=5.0e5, backpressure=False),
        "cv": BlindValve("Consumer", max_cv=5.0, opening_pct=0.0),
        "t": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "src", "target": "prv", "pipe": Pipe("p1", 2, ID)},
        {"source": "prv", "target": "cv", "pipe": Pipe("p2", 2, ID)},
        {"source": "cv", "target": "t", "pipe": Pipe("p3", 2, ID)},
    ]
    stats = solve(nodes, edges)
    prv = nodes["prv"]
    assert stats["success"] and stats["controls_converged"]
    assert prv.outlets[0].pressure / 1e5 == pytest.approx(5.0, abs=1e-3)
    assert prv.inlets[0].flow_rate * 60000 == pytest.approx(0.0, abs=1e-4)
    assert prv.opening_pct == 0.0
    assert [(s["name"], s["state"]) for s in stats["saturated_controllers"]] == [("PRV", "lock_up")]


def test_prv_in_a_dead_end_is_locked_up_not_wide_open():
    # Nothing downstream: the regulator has no flow path and used to show downstream = upstream pressure
    nodes = {
        "src": PressureSource("Supply", source_pressure=10.0e5),
        "prv": LinearRegulator("PRV", max_cv=5.0, set_pressure=5.0e5, backpressure=False),
        "dead": LinearControlValve("Dead end", max_cv=5.0, opening_pct=100.0),
    }
    edges = [
        {"source": "src", "target": "prv", "pipe": Pipe("p1", 2, ID)},
        {"source": "prv", "target": "dead", "pipe": Pipe("p2", 2, ID)},
    ]
    assert solve(nodes, edges)["success"]
    assert nodes["prv"].inlets[0].pressure / 1e5 == pytest.approx(10.0, abs=1e-3)
    assert nodes["prv"].outlets[0].pressure / 1e5 == pytest.approx(5.0, abs=1e-3)


def test_demand_flow_through_the_locked_regulator_matches_the_valve_equation():
    # Consumer at 1 % : the PRV must pass what the consumer draws at 5 bar(a)
    nodes, _ = _prv_with_downstream_valve(1.0)
    prv, cv = nodes["prv"], nodes["cv"]
    q = prv.inlets[0].flow_rate
    assert cv.inlets[0].flow_rate == pytest.approx(q, rel=1e-4)
    dp_cv = cv.inlets[0].pressure - cv.outlets[0].pressure
    assert dp_cv == pytest.approx(cv.calculate_delta_p(q, cv.inlets[0].density, cv.inlets[0].viscosity), rel=1e-3)


def test_supply_below_setpoint_leaves_the_prv_wide_open():
    nodes, stats = _prv_with_downstream_valve(100.0, supply_bara=4.0, set_bara=5.0)
    assert nodes["prv"].opening_pct == pytest.approx(100.0)
    assert [(s["name"], s["state"]) for s in stats["saturated_controllers"]] == [("PRV", "wide_open")]
    assert nodes["prv"].outlets[0].pressure / 1e5 < 4.0






@pytest.mark.parametrize("limit", range(1, 9))
def test_report_matches_the_reported_solution_at_any_iteration_limit(limit):
    """Stopping mid-way (e.g. right after lock-up was decided but before it was solved) may not
    report a lock-up that the reported pressures do not show."""
    nodes = {
        "src": PressureSource("Supply", source_pressure=10.0e5),
        "prv": LinearRegulator("PRV", max_cv=5.0, set_pressure=5.0e5, backpressure=False),
        "cv": BlindValve("Consumer", max_cv=5.0, opening_pct=0.0),
        "t": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "src", "target": "prv", "pipe": Pipe("p1", 2, ID)},
        {"source": "prv", "target": "cv", "pipe": Pipe("p2", 2, ID)},
        {"source": "cv", "target": "t", "pipe": Pipe("p3", 2, ID)},
    ]
    stats = solve(nodes, edges, control_iterations=limit)
    prv = nodes["prv"]
    states = {s["name"]: s["state"] for s in stats["saturated_controllers"]}
    err = (prv.outlets[0].pressure - prv.set_pressure) / 1e5
    if states.get("PRV") == "lock_up":
        assert err == pytest.approx(0.0, abs=1e-3) and prv.opening_pct == 0.0
    elif stats["controls_converged"]:
        assert abs(err) < 1e-3 or states.get("PRV") in ("wide_open",)
    else:
        assert prv.opening_pct > 0.0       # not converged: no lock-up claimed
