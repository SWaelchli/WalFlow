"""3-way TCV loop (ROADMAP "Thermal Control Valve Loop Stops Within 0.1 K of Its Setpoint"): every TCV
scenario reaches its setpoint, or an end stop when the setpoint is out of reach, independent of where the
loop starts, without running into the iteration limit."""
import contextlib
import io

import pytest

from tcv_networks import tcv_scenarios
from simulation.equipment.three_way_tcv import ThreeWayTCV
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

SETPOINT_TOL_K = 0.01
SPREAD_TOL_K = 0.02             # two runs, each within SETPOINT_TOL_K
SPREAD_TOL_FLOW = 0.01          # minority-branch flow, relative
MAX_OUTER_ITERATIONS = 30

SCENARIOS = tcv_scenarios()


def _solve(graph, monkeypatch, start=0.5):
    monkeypatch.setattr(NetworkSolver, "TCV_START_MIX", start)
    NetworkSolver.clear_warm_start_cache()
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(graph)
        stats = NetworkSolver(network).solve()
    tcvs = sorted((n for n in network.nodes.values() if isinstance(n, ThreeWayTCV)), key=lambda n: n.id)
    return stats, tcvs


def _at_end_stop(tcv):
    err = tcv.outlets[0].temperature - tcv.set_temperature
    hot, cold = tcv.inlets[tcv.hot_port_idx].temperature, tcv.inlets[1 - tcv.hot_port_idx].temperature
    # Direct action by port role: too hot closes the hot port, too cold opens it fully
    if tcv.mix_ratio <= NetworkSolver.TCV_MIX_MIN * 1.001:
        return err > 0 or hot <= cold
    if tcv.mix_ratio >= NetworkSolver.TCV_MIX_MAX - 1e-6:
        return err < 0 or hot <= cold
    return False


@pytest.mark.parametrize("name, graph", SCENARIOS, ids=[n for n, _ in SCENARIOS])
def test_tcv_reaches_setpoint_or_end_stop(name, graph, monkeypatch):
    stats, tcvs = _solve(graph, monkeypatch)
    assert stats["success"] and stats["controls_converged"] and stats["properties_converged"], stats.get("error")
    assert stats["outer_iterations"] <= MAX_OUTER_ITERATIONS
    for tcv in tcvs:
        err = tcv.outlets[0].temperature - tcv.set_temperature
        assert abs(err) <= SETPOINT_TOL_K or _at_end_stop(tcv), \
            f"{tcv.id}: {err:+.3f} K off the setpoint at mix ratio {tcv.mix_ratio:.4f}"


def _inverted(tcv):
    return tcv.inlets[tcv.hot_port_idx].temperature < tcv.inlets[1 - tcv.hot_port_idx].temperature


@pytest.mark.parametrize("name, graph", SCENARIOS, ids=[n for n, _ in SCENARIOS])
def test_tcv_result_does_not_depend_on_the_start(name, graph, monkeypatch):
    _, low = _solve(graph, monkeypatch, start=0.1)
    low = [(t.outlets[0].temperature, min(p.flow_rate for p in t.inlets), _at_end_stop(t)) for t in low]
    _, high = _solve(graph, monkeypatch, start=0.9)
    for (t_a, q_a, stop_a), tcv in zip(low, high):
        if _inverted(tcv):
            # Acting by port role, an inverted valve is wrong-acting: both end stops are stable, which one it
            # reaches depends on the start. It must end at one of them.
            assert stop_a and _at_end_stop(tcv)
            continue
        assert abs(tcv.outlets[0].temperature - t_a) <= SPREAD_TOL_K
        # Minority-branch flow: 1 %, or the flow change that the temperature spread allows (near an inlet
        # temperature the minority branch is so small that SPREAD_TOL_K moves it by more than 1 %)
        q_b = min(p.flow_rate for p in tcv.inlets)
        span = abs(tcv.inlets[0].temperature - tcv.inlets[1].temperature)
        q_tol = max(SPREAD_TOL_FLOW * max(abs(q_a), abs(q_b)), SPREAD_TOL_K * tcv.outlets[0].flow_rate / max(span, 1e-6))
        assert abs(q_b - q_a) <= q_tol
