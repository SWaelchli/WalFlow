"""Network builders shared by several test modules."""
import pytest

from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.junction import Junction
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.remote_control_valve import RemoteControlValve
from simulation.equipment.tank import Tank
from simulation.schemas import HydraulicNetwork


def make_junction(name, n_inlets=2, n_outlets=1):
    """A Junction holding n_inlets pipes drawn into it (slots inlet-0..) and n_outlets drawn out of it (outlet-0..),
    the layout the parser builds for the same drawing. Ports are numbered inlets first."""
    junction = Junction(name, num_ports=n_inlets + n_outlets)
    for k in range(n_inlets):
        junction.assign_port(k, as_inlet=True)
    for k in range(n_outlets):
        junction.assign_port(n_inlets + k, as_inlet=False)
    return junction


def create_simple_network(pump_node, valve_opening=100.0):
    """Helper to build Tank -> Pump -> Valve -> Tank"""
    # Use 0m elevations to prevent gravity aid unless intended
    t1 = Tank("Source", elevation=0, fluid_level=0)
    t2 = Tank("Dest", elevation=0, fluid_level=0)
    v1 = LinearControlValve("Valve", max_cv=0.05, opening_pct=valve_opening)
    
    nodes = { "t1": t1, "p1": pump_node, "v1": v1, "t2": t2 }
    
    # Pipes
    p_a = Pipe("PipeA", 1, 0.05)
    p_b = Pipe("PipeB", 1, 0.05)
    p_c = Pipe("PipeC", 1, 0.05)
    
    edges = [
        {"id": "e1", "source": "t1", "target": "p1", "pipe": p_a},
        {"id": "e2", "source": "p1", "target": "v1", "pipe": p_b},
        {"id": "e3", "source": "v1", "target": "t2", "pipe": p_c},
    ]
    return HydraulicNetwork(nodes=nodes, edges=edges)



def generate_stress_network(size=10):
    """
    Generates a synthetic network with 'size' parallel loops.
    Each loop has: Junction -> 2 Pipes -> Junction.
    """
    nodes = [
        {"id": "t_start", "type": "tank", "data": {"label": "Source", "level_m": 10.0}, "position": {"x":0,"y":0}},
        {"id": "p_main", "type": "centrifugal_pump", "data": {"label": "Main Pump", "head_rated_m": 51.0}, "position": {"x":100,"y":0}},
    ]
    edges = [
        {"id": "e_start", "source": "t_start", "target": "p_main", "data": {"length_m": 1, "diameter_m": 0.1}}
    ]

    prev_node = "p_main"
    for i in range(size):
        s_id = f"s_{i}"
        m_id = f"m_{i}"
        
        nodes.append({"id": s_id, "type": "junction", "data": {"label": f"S{i}"}, "position": {"x": 200 + i*200, "y": 0}})
        nodes.append({"id": m_id, "type": "junction", "data": {"label": f"M{i}"}, "position": {"x": 300 + i*200, "y": 0}})
        
        out_handle = {"sourceHandle": "port-2"} if i else {}   # the previous joining junction's outlet side
        # Connect previous to the splitting junction (port-0 in, port-1 and port-2 out)
        edges.append({"id": f"e_pre_{i}", "source": prev_node, "target": s_id, "targetHandle": "port-0", **out_handle, "data": {"length_m": 1, "diameter_m": 0.1}})
        
        # Parallel paths
        edges.append({"id": f"e_p1_{i}", "source": s_id, "target": m_id, "sourceHandle": "port-1", "targetHandle": "port-0", "data": {"length_m": 10, "diameter_m": 0.05}})
        edges.append({"id": f"e_p2_{i}", "source": s_id, "target": m_id, "sourceHandle": "port-2", "targetHandle": "port-1", "data": {"length_m": 10, "diameter_m": 0.08}})
        
        prev_node = m_id

    nodes.append({"id": "t_end", "type": "tank", "data": {"label": "Sink", "level_m": 1.0}, "position": {"x": 200 + size*200, "y": 0}})
    edges.append({"id": "e_end", "source": prev_node, "target": "t_end", **({"sourceHandle": "port-2"} if size else {}), "data": {"length_m": 1, "diameter_m": 0.1}})

    return {"nodes": nodes, "edges": edges}



ID_1IN = 0.0266


def parallel_remote_valves(set_a_bar, set_b_bar, cv_a=5.0, cv_b=5.0, len_a=1.0, len_b=1.0, consumer=30.0,
                           backpressure=False):
    """10 bar supply -> two remote valves "a"/"b" in parallel -> consumer valve -> tank; both sense one header.
    PRV: the header is the joining junction after the valves. BPR: the header is the splitting junction before them.
    Returns (nodes, edges)."""
    nodes = {
        "src": PressureSource("Supply", source_pressure=10.0e5),
        "sp": make_junction("Split", 1, 2),
        "a": RemoteControlValve("A", max_cv=cv_a, set_pressure=set_a_bar * 1e5, backpressure=backpressure),
        "b": RemoteControlValve("B", max_cv=cv_b, set_pressure=set_b_bar * 1e5, backpressure=backpressure),
        "mx": make_junction("Join", 2, 1),
        "cv": LinearControlValve("Consumer", max_cv=2.0, opening_pct=consumer),
        "t": Tank("Sink", fluid_level=0.0),
    }
    header = {"node_id": "sp", "port_type": "inlet", "port_idx": 0} if backpressure else         {"node_id": "mx", "port_type": "outlet", "port_idx": 0}
    nodes["a"].remote_sensing_config = dict(header)
    nodes["b"].remote_sensing_config = dict(header)
    branches = [
        {"source": "sp", "source_port": "outlet-0", "target": "a", "pipe": Pipe("pa", len_a, ID_1IN)},
        {"source": "sp", "source_port": "outlet-1", "target": "b", "pipe": Pipe("pb", len_b, ID_1IN)},
        {"source": "a", "target": "mx", "target_port": "inlet-0", "pipe": Pipe("pa2", 1, ID_1IN)},
        {"source": "b", "target": "mx", "target_port": "inlet-1", "pipe": Pipe("pb2", 1, ID_1IN)},
    ]
    if backpressure:
        edges = [{"source": "src", "target": "cv", "pipe": Pipe("p0", 1, ID_1IN)},
                 {"source": "cv", "target": "sp", "pipe": Pipe("p1", 1, ID_1IN)},
                 *branches,
                 {"source": "mx", "target": "t", "pipe": Pipe("p2", 1, ID_1IN)}]
    else:
        edges = [{"source": "src", "target": "sp", "pipe": Pipe("p0", 1, ID_1IN)},
                 *branches,
                 {"source": "mx", "target": "cv", "pipe": Pipe("p1", 1, ID_1IN)},
                 {"source": "cv", "target": "t", "pipe": Pipe("p2", 1, ID_1IN)}]
    return nodes, edges


ATM = 101325.0


def assert_regulator_consistent(reg, set_pa, tol_bar=0.05):
    """Either at setpoint, or fully open/closed with the sensed pressure on the side that explains it."""
    sensed = reg.inlets[0].pressure if reg.backpressure else reg.outlets[0].pressure
    err_bar = (sensed - set_pa) / 1e5
    if abs(err_bar) <= tol_bar:
        return "regulated"
    if reg.opening_pct >= 99.0:
        # PRV wide open but downstream still below set / BPR wide open but upstream still above set
        assert (err_bar > 0) if reg.backpressure else (err_bar < 0), f"open but error {err_bar:.3f} bar"
        return "saturated open"
    if reg.opening_pct <= 0.2:
        assert (err_bar < 0) if reg.backpressure else (err_bar > 0), f"closed but error {err_bar:.3f} bar"
        return "saturated closed"
    pytest.fail(f"opening {reg.opening_pct:.1f} % and sensed {sensed/1e5:.3f} bar vs set {set_pa/1e5:.3f} bar")

