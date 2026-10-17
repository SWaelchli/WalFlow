"""PD pump / flow source: user-set absolute discharge pressure limit (default 50 bar(a)) instead of the fixed 200 bar guard."""
from walflow_paths import EXAMPLES_DIR

import contextlib
import io
import json
import os

import pytest

from simulation.equipment.flow_source import FlowSource
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import GlobalSettings, ReactFlowGraph
from simulation.solver import NetworkSolver, run_sequential_relief_simulation
from routers.simulation import extract_telemetry
from networks import create_simple_network

Q_R = 100.0 / 60000.0


@pytest.mark.parametrize("method", ["sparse_newton", "lm"])
def test_dead_headed_pump_holds_its_limit(method):
    pump = VolumetricPump("PD", flow_rated=Q_R, motor_power=1e6, efficiency=0.9, max_discharge_pressure=30e5)
    net = create_simple_network(pump)
    net.nodes["v1"].max_cv = 1e-5           # would need far more than 30 bar to pass the displacement flow
    net.global_settings = GlobalSettings(solver_method=method)
    stats = NetworkSolver(net).solve()
    assert stats["success"]
    assert 30e5 <= pump.outlets[0].pressure <= 30e5 * 1.01      # limit + max. 1 % accumulation
    assert 0.0 <= pump.inlets[0].flow_rate < Q_R                # the rest recirculates internally
    pump.refresh_warnings()
    assert pump.pressure_cap_reached


def test_pump_below_its_limit_is_unaffected():
    pump = VolumetricPump("PD", flow_rated=Q_R, motor_power=1e6, efficiency=0.9, max_discharge_pressure=30e5)
    net = create_simple_network(pump)
    net.nodes["v1"].max_cv = 2.2             # ~10 bar at displacement flow
    assert NetworkSolver(net).solve()["success"]
    assert pump.inlets[0].flow_rate == pytest.approx(Q_R, rel=0.01)
    pump.refresh_warnings()
    assert not pump.pressure_cap_reached


def test_flow_source_outlet_is_limited():
    src = FlowSource("F", source_flow=1e-3, max_discharge_pressure=20e5)
    # No flow taken: the pressure rise over atmospheric stops at the limit (dp < 0 is a rise)
    assert src.calculate_delta_p(0.0, 1000.0) == pytest.approx(-(20e5 - 101325.0))


def test_parser_reads_limit_in_bara_with_50_bar_default():
    assert GraphParser._max_discharge_pa({}, "P") == 50e5
    assert GraphParser._max_discharge_pa({"max_discharge_pressure_bara": 120.0}, "P") == 120e5
    with pytest.raises(ModelInputError):
        GraphParser._max_discharge_pa({"max_discharge_pressure_bara": 0.5}, "P")


def test_multi_psv_example_unmitigated_stops_at_pump_limit():
    path = os.path.join(EXAMPLES_DIR, "Example_Multi_PSV_Protection.wlf")
    data = json.load(open(path, encoding="utf-8"))
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(ReactFlowGraph(**data))
        _, _, tel_unmitigated, _, _ = run_sequential_relief_simulation(network, NetworkSolver(network), extract_telemetry)
    pump_id = next(k for k, n in network.nodes.items() if n.node_type == "volumetric_pump")
    p_out = tel_unmitigated["nodes"][pump_id]["outlets"][0]["pressure"]
    assert 50e5 <= p_out <= 50e5 * 1.01       # was 201 bar(a) with the old 200 bar differential guard
    assert tel_unmitigated["nodes"][pump_id]["pressure_cap_reached"]
