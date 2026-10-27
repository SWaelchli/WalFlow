"""When the control loop stops at its iteration limit, the reported state is still one
hydraulic solution: every pipe and valve obeys its own ΔP(Q), and no absolute pressure is negative."""
from physics_refs import pipe_end_total
from simulation.equipment.base_node import total_of
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
        if not hasattr(pipe, "calculate_delta_p"):
            continue        # a component link has no pipe law
        q = pipe.inlets[0].flow_rate
        dp_reported = pipe.inlets[0].pressure - pipe.outlets[0].pressure
        dp_model = pipe.calculate_delta_p(q, *pipe.upstream_port().fluid())
        # 1 %: since the fluid properties are iterated to consistency even when the control
        # loop stops at its limit. The old defect gave 15-28 % here.
        assert dp_reported == pytest.approx(dp_model, rel=0.01, abs=50.0), f"pipe {pipe.name}"
        # Pipe ends sit at the total pressure of the components they connect, less their own velocity head
        src, tgt = net.nodes[edge["source"]], net.nodes[edge["target"]]
        assert pipe_end_total(pipe, pipe.inlets[0], src) == pytest.approx(total_of(src.outlets[0]), abs=50.0)
        assert pipe_end_total(pipe, pipe.outlets[0], tgt) == pytest.approx(total_of(tgt.inlets[0]), abs=50.0)

    for node in net.nodes.values():
        for port in node.inlets + node.outlets:
            assert port.pressure > 0.0, f"{node.name}: negative absolute pressure"

    for node in net.nodes.values():
        if node.node_type in ("linear_regulator", "linear_control_valve", "remote_control_valve"):
            p_in, p_out = node.inlets[0], node.outlets[0]
            assert total_of(p_in) - total_of(p_out) == pytest.approx(
                node.calculate_delta_p(p_in.flow_rate, p_in.density, p_in.viscosity), rel=0.01, abs=50.0)
