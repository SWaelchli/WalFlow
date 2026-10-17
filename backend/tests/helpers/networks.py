"""Network builders shared by several test modules."""
import pytest

from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.schemas import HydraulicNetwork


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
    Each loop has: Splitter -> 2 Pipes -> Mixer.
    """
    nodes = [
        {"id": "t_start", "type": "tank", "data": {"label": "Source", "level": 10.0}, "position": {"x":0,"y":0}},
        {"id": "p_main", "type": "centrifugal_pump", "data": {"label": "Main Pump", "head_rated_m": 51.0}, "position": {"x":100,"y":0}},
    ]
    edges = [
        {"id": "e_start", "source": "t_start", "target": "p_main", "data": {"length": 1, "diameter": 0.1}}
    ]

    prev_node = "p_main"
    for i in range(size):
        s_id = f"s_{i}"
        m_id = f"m_{i}"
        
        nodes.append({"id": s_id, "type": "splitter", "data": {"label": f"S{i}"}, "position": {"x": 200 + i*200, "y": 0}})
        nodes.append({"id": m_id, "type": "mixer", "data": {"label": f"M{i}"}, "position": {"x": 300 + i*200, "y": 0}})
        
        # Connect previous to splitter
        edges.append({"id": f"e_pre_{i}", "source": prev_node, "target": s_id, "data": {"length": 1, "diameter": 0.1}})
        
        # Parallel paths
        edges.append({"id": f"e_p1_{i}", "source": s_id, "target": m_id, "data": {"length": 10, "diameter": 0.05}})
        edges.append({"id": f"e_p2_{i}", "source": s_id, "target": m_id, "data": {"length": 10, "diameter": 0.08}})
        
        prev_node = m_id

    nodes.append({"id": "t_end", "type": "tank", "data": {"label": "Sink", "level": 1.0}, "position": {"x": 200 + size*200, "y": 0}})
    edges.append({"id": "e_end", "source": prev_node, "target": "t_end", "data": {"length": 1, "diameter": 0.1}})

    return {"nodes": nodes, "edges": edges}



ID_1IN = 0.0266


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

