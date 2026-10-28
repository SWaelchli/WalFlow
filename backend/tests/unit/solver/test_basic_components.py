
# Add backend to path

from physics_refs import build_network, water_head
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.linear_control_valve import LinearControlValve  
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_tank_static_pressure():
    """
    Test 1: Verify static head calculation for a non-flowing system.
    P_static = rho * g * h + P_atm
    """
    print("\n--- Test 1: Tank Static Pressure ---")
    h, elev = 2.0, 5.0
    # Global settings will manage fluid properties
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    t1 = Tank("Source Tank", fluid_level=h, elevation=elev, temperature=293.15, fluid_type="iso_vg_46")
    v1 = LinearControlValve("Closed LinearControlValve", max_cv=0.0000001, opening_pct=0.1) 
    t2 = Tank("Sink Tank", fluid_level=0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")

    nodes = {"t1": t1, "v1": v1, "t2": t2}
    edges = [
        {"source": "t1", "target": "v1", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "v1", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    
    network = build_network(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    stats = solver.solve()

    p_expected = (870.0 * 9.81 * (h + elev)) + 101325.0
    p_actual = nodes["t1"].outlets[0].pressure

    print(f"  Expected P (SI): {p_expected:.1f} Pa")
    print(f"  Actual P (SI):   {p_actual:.1f} Pa")
    
    assert abs(p_expected - p_actual) < 500.0
    print("  RESULT: SUCCESS")


def test_heat_exchanger():
    """
    Test 3: Verify Heat Exchanger cooling logic.
    """
    print("\n--- Test 3: Heat Exchanger Cooling ---")
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    duty_kw = -10.0 # 10 kW cooling
    t1 = Tank("Source", fluid_level=5.0, elevation=0, temperature=333.15, fluid_type="iso_vg_46")
    # Low flow to see temperature change clearly
    v1 = LinearControlValve("Restriction", max_cv=0.001, opening_pct=100.0)
    p1 = CentrifugalPump("Pump", flow_rated=100.0/60000.0, head_rated=water_head(2.0*100000.0), rise_to_shutoff_pct=20.0)
    hx = HeatExchanger("Cooler", heat_duty=duty_kw * 1000.0)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")

    nodes = {"t1": t1, "v1": v1, "p1": p1, "hx": hx, "t2": t2}
    edges = [
        {"source": "t1", "target": "v1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "v1", "target": "p1", "pipe": Pipe("p2", 1, 0.05)},
        {"source": "p1", "target": "hx", "pipe": Pipe("p3", 1, 0.05)},
        {"source": "hx", "target": "t2", "pipe": Pipe("p4", 1, 0.05)}
    ]

    network = build_network(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    stats = solver.solve()
    q = hx.inlets[0].flow_rate

    t_in = hx.inlets[0].temperature
    t_out = hx.outlets[0].temperature
    
    print(f"  Flow: {q*60000:.2f} L/min")
    print(f"  Temp In:  {t_in - 273.15:.1f} C")
    print(f"  Temp Out: {t_out - 273.15:.1f} C")

    assert t_out < t_in
    print("  RESULT: SUCCESS")


if __name__ == "__main__":
    test_tank_static_pressure()
    test_pump_curve()
    test_heat_exchanger()
