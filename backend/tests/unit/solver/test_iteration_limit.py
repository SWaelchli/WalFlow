"""When the control loop stops at its iteration limit, the reported state is still one
hydraulic solution: every pipe and valve obeys its own ΔP(Q), and no absolute pressure is negative."""
from walflow_paths import EXAMPLES_DIR
import pytest


import io
import json
import os
import contextlib

import pytest

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

EXAMPLE = os.path.join(EXAMPLES_DIR, "Example_API_682_Seal_Flush.wlf")


@pytest.mark.parametrize("control_iterations", [3, 100])
def test_reported_state_is_consistent(control_iterations):
    data = json.load(open(EXAMPLE, encoding="utf-8"))
    data["globalSettings"] = {**data.get("globalSettings", {}), "control_iterations": control_iterations}
    with contextlib.redirect_stdout(io.StringIO()):
        NetworkSolver.clear_warm_start_cache()
        net = GraphParser.parse_graph(ReactFlowGraph(**data))
        stats = NetworkSolver(net).solve()
    assert stats["success"]

    for edge in net.edges:
        pipe = edge["pipe"]
        q = pipe.inlets[0].flow_rate
        dp_reported = pipe.inlets[0].pressure - pipe.outlets[0].pressure
        dp_model = pipe.calculate_delta_p(q, pipe.inlets[0].density, pipe.inlets[0].viscosity)
        # 1 %: since the fluid properties are iterated to consistency even when the control
        # loop stops at its limit. The old defect gave 15-28 % here.
        assert dp_reported == pytest.approx(dp_model, rel=0.01, abs=50.0), f"pipe {pipe.name}"
        # Pipe ends carry the pressures of the components they connect
        src, tgt = net.nodes[edge["source"]], net.nodes[edge["target"]]
        assert pipe.inlets[0].pressure == pytest.approx(src.outlets[0].pressure, abs=50.0)
        assert pipe.outlets[0].pressure == pytest.approx(tgt.inlets[0].pressure, abs=50.0)

    for node in net.nodes.values():
        for port in node.inlets + node.outlets:
            assert port.pressure > 0.0, f"{node.name}: negative absolute pressure"

    for node in net.nodes.values():
        if node.node_type in ("linear_regulator", "linear_control_valve", "remote_control_valve"):
            p_in, p_out = node.inlets[0], node.outlets[0]
            assert p_in.pressure - p_out.pressure == pytest.approx(
                node.calculate_delta_p(p_in.flow_rate, p_in.density, p_in.viscosity), rel=0.01, abs=50.0)
