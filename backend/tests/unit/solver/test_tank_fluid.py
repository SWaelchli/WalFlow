"""F1-23: a tank always uses the system fluid; a stale per-tank fluid_type in old files is ignored."""
import pytest

pytestmark = pytest.mark.audit("F1-23")

from simulation.fluid_utils import FluidProperties as FP
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph


def _tank(fluid_type):
    data = {"label": "T", "level": 1.0, "elevation": 0.0, "temperature": 313.15}
    if fluid_type is not None:
        data["fluid_type"] = fluid_type
    graph = ReactFlowGraph(
        nodes=[{"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": data}],
        edges=[], global_settings={"fluid_type": "iso_vg_46"})
    network = GraphParser.parse_graph(graph)
    return network.nodes["t1"] if isinstance(network.nodes, dict) else next(n for n in network.nodes if n.id == "t1")


def test_f1_23_tank_uses_system_fluid_not_stale_field():
    tank = _tank("iso_vg_32")
    assert tank.fluid_type == "iso_vg_46"
    tank.calculate()
    assert abs(tank.outlets[0].density - FP.get_density("iso_vg_46", 313.15)) < 1e-9
    assert abs(tank.outlets[0].viscosity - FP.get_viscosity("iso_vg_46", 313.15)) < 1e-12


def test_f1_23_unknown_stale_tank_fluid_does_not_raise():
    assert _tank("no_such_fluid").fluid_type == "iso_vg_46"
