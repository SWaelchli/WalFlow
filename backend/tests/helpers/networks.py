"""Network builders shared by several test modules."""
from physics_refs import build_network
import functools

import pytest

from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.junction import Junction
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_boundary import PressureBoundary
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
    return build_network(nodes=nodes, edges=edges)



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
        "src": PressureBoundary("Supply", set_pressure=10.0e5),
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



def graph_node(node_id, node_type, data=None):
    return {"id": node_id, "type": node_type, "position": {"x": 0, "y": 0}, "data": {"label": node_id, **(data or {})}}


def graph_pipe(edge_id, source, target, source_port=None, target_port=None, length=1.0, diameter=0.0266):
    return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port, "targetHandle": target_port,
            "data": {"length_m": length, "diameter_m": diameter}}


def graph_signal(edge_id, source, source_port, target, target_port="signal-in"):
    return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
            "targetHandle": target_port, "data": {"type": "SIGNAL"}}


def component_line(node_type, data=None, fluid="water", source_level=20.0, sink_level=1.0, temperature_k=293.15):
    """Saved-file graph: tank "t1" -> pipe -> component "c" -> pipe -> tank "t2", the component entered by port-0 and
    left by port-1 (neutral types) or inlet-0 / outlet-0 (role types)."""
    neutral = node_type in ("orifice", "calibrated_restriction", "filter", "measure_point")
    c_in, c_out = ("port-0", "port-1") if neutral else ("inlet-0", "outlet-0")
    return {
        "nodes": [graph_node("t1", "tank", {"level_m": source_level, "temperature_k": temperature_k}),
                  graph_node("c", node_type, data),
                  graph_node("t2", "tank", {"level_m": sink_level, "temperature_k": temperature_k})],
        "edges": [graph_pipe("e1", "t1", "c", "outlet-0", c_in), graph_pipe("e2", "c", "t2", c_out, "inlet-0")],
        "globalSettings": {"fluid_type": fluid},
    }


RESERVOIR_TYPES = ("tank", "pressure_boundary", "flow_boundary")


def use_neutral_ports(graph_dict):
    """Redraw a saved-file graph (dict) as the canvas saves it: a pipe end on a tank, pressure boundary or flow
    boundary sits on a numbered port-k handle, one pipe per port, and the node's num_ports grows to fit. Ends that
    already name a port-k keep it; "inlet-0" / "outlet-0" / no handle on these nodes get the lowest free port. The
    drawn direction of every pipe is kept. Returns the same dict."""
    reservoirs = {n["id"]: n for n in graph_dict["nodes"] if n["type"] in RESERVOIR_TYPES}
    used = {node_id: set() for node_id in reservoirs}
    ends = []
    for edge in graph_dict["edges"]:
        if (edge.get("data") or {}).get("type") == "SIGNAL":
            continue
        for end in ("source", "target"):
            handle = edge.get(f"{end}Handle")
            if edge[end] in reservoirs:
                if handle and handle.startswith("port-"):
                    used[edge[end]].add(int(handle.split("-")[1]))
                else:
                    ends.append((edge, end))
    for edge, end in ends:
        node_id = edge[end]
        k = min(set(range(9)) - used[node_id])
        used[node_id].add(k)
        edge[f"{end}Handle"] = f"port-{k}"
    for node_id, node in reservoirs.items():
        node["data"]["num_ports"] = max(node["data"].get("num_ports", 1), max(used[node_id], default=-1) + 1)
    return graph_dict


def on_neutral_ports(build):
    """Decorator for a function returning a saved-file graph (or a list of them): redrawn by use_neutral_ports."""
    @functools.wraps(build)
    def wrapper(*args, **kwargs):
        built = build(*args, **kwargs)
        for graph in built if isinstance(built, (list, tuple)) else [built]:
            use_neutral_ports(graph)
        return built
    return wrapper


def neutral_graph(**graph_fields):
    """ReactFlowGraph of a saved-file graph written with plain dicts, redrawn onto neutral ports (use_neutral_ports)."""
    from simulation.schemas import ReactFlowGraph
    for key in ("nodes", "edges"):
        graph_fields[key] = [x.model_dump() if hasattr(x, "model_dump") else x for x in graph_fields[key]]
    use_neutral_ports(graph_fields)
    return ReactFlowGraph(**graph_fields)


def solve_graph(graph_dict):
    """Parse and solve a saved-file graph: (network, stats). Fails the test when the solve does not succeed."""
    from simulation.graph_parser import GraphParser
    from simulation.schemas import ReactFlowGraph
    from simulation.solver import NetworkSolver
    use_neutral_ports(graph_dict)
    network = GraphParser.parse_graph(ReactFlowGraph(**graph_dict))
    stats = NetworkSolver(network).solve()
    assert stats["success"], stats
    return network, stats
