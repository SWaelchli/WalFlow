"""
Automated Validation Test Suite for WalFlow Physics Solver Accuracy
Milestone 2 (R1: Engineering QA)

Verifies simulation solver outputs against theoretical fluid mechanics hand calculations.
"""

import sys
import os
import math
import pytest

# Ensure backend directory is in python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.orifice import Orifice
from simulation.equipment.mixer import Mixer
from simulation.equipment.splitter import Splitter
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.fluid_utils import FluidProperties
from simulation.solver import NetworkSolver
from routers.simulation import calculate_case_kpis, extract_telemetry_dict


def test_darcy_weisbach_pipe_friction():
    """
    Test 1: Compare solver outputs against hand-calculated Darcy-Weisbach head loss for pipe friction.
    Input parameters: L=100m, D=0.1m, Q=0.02 m³/s, roughness=0.045mm using Swamee-Jain f.
    Verify relative error < 1%.
    """
    # 1. Physical Parameters
    length = 100.0        # m
    diameter = 0.1        # m
    flow_rate = 0.02      # m³/s (20 L/s)
    roughness = 0.000045  # m (0.045 mm)
    temp_k = 293.15       # 20°C
    fluid_type = "water"

    # Fluid properties at 20°C
    density = FluidProperties.get_density(fluid_type, temp_k)      # 1000.0 kg/m³
    viscosity = FluidProperties.get_viscosity(fluid_type, temp_k)  # ~0.0010018 Pa·s

    # 2. Hand Calculation (Theoretical Fluid Mechanics)
    area = math.pi * (diameter / 2.0)**2                            # m²
    velocity = flow_rate / area                                     # m/s
    reynolds = (density * abs(velocity) * diameter) / viscosity    # dimensionless

    # Swamee-Jain equation for friction factor f
    rel_roughness = roughness / (3.7 * diameter)
    re_term = 5.74 / (reynolds ** 0.9)
    f_sj = 0.25 / (math.log10(rel_roughness + re_term))**2

    # Darcy-Weisbach pressure drop (Pa)
    delta_p_theoretical = f_sj * (length / diameter) * (density * (velocity**2) / 2.0)
    head_loss_theoretical = delta_p_theoretical / (density * 9.81)

    # 3. Code Execution: Direct Pipe Class Calculation
    pipe_node = Pipe(name="Test Pipe", length=length, diameter=diameter)
    gs = GlobalSettings(fluid_type=fluid_type, global_roughness=roughness)
    pipe_node.global_settings = gs

    delta_p_direct = pipe_node.calculate_delta_p(flow_rate, density, viscosity)

    # 4. Code Execution: Full Hydraulic Network Solver Integration
    # Create fixed pressure boundary tanks to drive flow_rate through the pipe
    p_inlet = 300000.0  # 3 bar abs
    p_outlet = p_inlet - delta_p_theoretical

    tank_in = Tank("Tank In", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)
    tank_out = Tank("Tank Out", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)

    def calc_in():
        for p in tank_in.inlets + tank_in.outlets:
            p.temperature = temp_k
            p.pressure = p_inlet
        return p_inlet

    def calc_out():
        for p in tank_out.inlets + tank_out.outlets:
            p.temperature = temp_k
            p.pressure = p_outlet
        return p_outlet

    tank_in.calculate = calc_in
    tank_out.calculate = calc_out

    nodes = {"t_in": tank_in, "t_out": tank_out}
    edges = [{"id": "e1", "source": "t_in", "target": "t_out", "pipe": pipe_node}]

    network = HydraulicNetwork(nodes=nodes, edges=edges, global_settings=gs)
    for n in nodes.values():
        n.global_settings = gs
    pipe_node.global_settings = gs

    solver = NetworkSolver(network)
    solver.fixed_pressure_nodes = {0: p_inlet, 1: p_outlet}
    stats = solver.solve()

    q_solver = pipe_node.inlets[0].flow_rate
    delta_p_solver = p_inlet - p_outlet

    # 5. Verification & Relative Error Calculation
    rel_error_direct = abs(delta_p_direct - delta_p_theoretical) / delta_p_theoretical
    rel_error_solver_q = abs(q_solver - flow_rate) / flow_rate

    print("\n--- Test 1: Darcy-Weisbach Pipe Friction ---")
    print(f"  Fluid Velocity:              {velocity:.4f} m/s")
    print(f"  Reynolds Number:             {reynolds:.2f}")
    print(f"  Swamee-Jain f:               {f_sj:.6f}")
    print(f"  Theoretical Delta P:         {delta_p_theoretical:.2f} Pa ({delta_p_theoretical/1e5:.4f} bar)")
    print(f"  Theoretical Head Loss:       {head_loss_theoretical:.4f} m")
    print(f"  Pipe Node Delta P:           {delta_p_direct:.2f} Pa")
    print(f"  Network Solver Flow Rate:    {q_solver:.6f} m3/s (Target: {flow_rate:.6f})")
    print(f"  Direct Delta P Rel Error:    {rel_error_direct * 100:.4f}%")
    print(f"  Network Solver Q Rel Error:  {rel_error_solver_q * 100:.4f}%")

    assert rel_error_direct < 0.01, f"Direct Pipe relative error {rel_error_direct*100:.2f}% >= 1%"
    assert rel_error_solver_q < 0.01, f"Network solver relative error {rel_error_solver_q*100:.2f}% >= 1%"


def test_bernoulli_orifice_and_static_head():
    """
    Test 2: Compare solver outputs against hand-calculated Bernoulli thin-plate orifice pressure drop & static elevation head.
    Static Head Formula: P = P_atm + rho * g * (elevation + liquid_level)
    Orifice Formula: Dynamic Discharge Coeff Cd(Re) + Bernoulli Recovery
    Verify relative error < 1%.
    """
    # -------------------------------------------------------------------------
    # Part A: Static Elevation Head (Hydrostatic pressure at bottom of tank)
    # -------------------------------------------------------------------------
    elevation = 10.0   # m
    fluid_level = 5.0  # m
    temp_k = 293.15    # 20°C
    fluid_type = "water"
    p_atm = 101325.0   # Pa
    gravity = 9.81     # m/s²

    density = FluidProperties.get_density(fluid_type, temp_k)  # 1000.0 kg/m³
    viscosity = FluidProperties.get_viscosity(fluid_type, temp_k)

    # Hand Calculation: P = P_atm + rho * g * (elevation + fluid_level)
    total_head = elevation + fluid_level
    p_static_theoretical = p_atm + (density * gravity * total_head)

    # Solver evaluation via Tank node
    gs = GlobalSettings(fluid_type=fluid_type, atmospheric_pressure=p_atm)
    tank = Tank("Elevation Tank", elevation=elevation, fluid_level=fluid_level, temperature=temp_k, fluid_type=fluid_type)
    tank.global_settings = gs
    p_static_solver = tank.calculate()

    rel_error_static = abs(p_static_solver - p_static_theoretical) / p_static_theoretical

    print("\n--- Test 2 Part A: Tank Static Elevation Head ---")
    print(f"  Total Hydraulic Head:        {total_head:.2f} m")
    print(f"  Theoretical Static P:        {p_static_theoretical:.2f} Pa ({p_static_theoretical/1e5:.5f} bar)")
    print(f"  Tank Node Calculated P:      {p_static_solver:.2f} Pa ({p_static_solver/1e5:.5f} bar)")
    print(f"  Static Pressure Rel Error:   {rel_error_static * 100:.4f}%")

    assert rel_error_static < 0.01, f"Static head relative error {rel_error_static*100:.2f}% >= 1%"

    # -------------------------------------------------------------------------
    # Part B: Thin-Plate Orifice Pressure Drop
    # -------------------------------------------------------------------------
    pipe_d = 0.05248    # m (DN50 pipe)
    orif_d = 0.02       # m (20 mm orifice)
    q_flow = 0.003      # m³/s (3 L/s)

    # Hand Calculation:
    beta_ratio = orif_d / pipe_d
    area_pipe = math.pi * (pipe_d / 2.0)**2
    area_orif = math.pi * (orif_d / 2.0)**2

    v_pipe = q_flow / area_pipe
    v_orif = q_flow / area_orif

    re_orif = (density * abs(v_orif) * orif_d) / viscosity
    cd_dynamic = 0.60 / math.sqrt(1.0 + 250.0 / re_orif)
    cd_dynamic = max(0.05, cd_dynamic)

    geometry_factor = (1.0 - beta_ratio**4) / (cd_dynamic**2 * beta_ratio**4)
    dynamic_pressure = 0.5 * density * v_pipe * abs(v_pipe)

    delta_p_rec = dynamic_pressure * geometry_factor
    delta_p_orif_theoretical = delta_p_rec * (1.0 - beta_ratio**2)

    # Code Execution: Orifice Node
    orifice_node = Orifice("Test Orifice", pipe_diameter=pipe_d, orifice_diameter=orif_d)
    orifice_node.global_settings = gs

    delta_p_orif_solver = orifice_node.calculate_delta_p(q_flow, density, viscosity)
    rel_error_orif = abs(delta_p_orif_solver - delta_p_orif_theoretical) / delta_p_orif_theoretical

    print("\n--- Test 2 Part B: Thin-Plate Orifice Pressure Drop ---")
    print(f"  Beta Ratio (d/D):            {beta_ratio:.6f}")
    print(f"  Orifice Reynolds Number:     {re_orif:.2f}")
    print(f"  Dynamic Discharge Coeff Cd:  {cd_dynamic:.6f}")
    print(f"  Theoretical Permanent Loss:  {delta_p_orif_theoretical:.2f} Pa ({delta_p_orif_theoretical/1e5:.4f} bar)")
    print(f"  Orifice Node Calculated DP:  {delta_p_orif_solver:.2f} Pa ({delta_p_orif_solver/1e5:.4f} bar)")
    print(f"  Orifice Pressure Rel Error:  {rel_error_orif * 100:.4f}%")

    assert rel_error_orif < 0.01, f"Orifice relative error {rel_error_orif*100:.2f}% >= 1%"


def test_centrifugal_pump_operating_point():
    """
    Test 3: Compare solver outputs against hand-calculated centrifugal pump operating point.
    Intersection of quadratic pump curve (H_pump = H_shutoff + C * Q2) and pipe system head loss curve (H_sys = K_sys * Q2).
    Verify relative error < 1%.
    """
    # 1. Centrifugal Pump Specifications
    q_rated = 0.01       # m³/s (10 L/s)
    p_rated = 400000.0   # Pa (4 bar)
    rise_pct = 20.0      # % rise to shutoff
    temp_k = 293.15      # 20°C
    fluid_type = "water"

    p_shutoff = p_rated * (1.0 + rise_pct / 100.0)  # 480,000 Pa
    c_coeff = (p_rated - p_shutoff) / (q_rated**2)   # -800,000,000 Pa/(m³/s)²

    # 2. Pipe System Specifications
    l_pipe = 50.0        # m
    d_pipe = 0.05        # m
    roughness = 0.000045 # m

    density = FluidProperties.get_density(fluid_type, temp_k)      # 1000.0 kg/m³
    viscosity = FluidProperties.get_viscosity(fluid_type, temp_k)  # ~0.0010018 Pa·s

    # 3. Hand Calculation of Operating Point (Intersection Analysis)
    # Pump Curve:   Delta P_pump(Q) = P_shutoff + C_coeff * Q2
    # System Curve: Delta P_sys(Q)  = f(Q) * (L/D) * (rho * v(Q)2 / 2) = K_sys(Q) * Q2
    # At Operating Point: Delta P_pump(Q_op) = Delta P_sys(Q_op)

    # Iterative analytical solution for exact Swamee-Jain f(Q) operating point:
    q_op = 0.005 # Initial guess m³/s
    for _ in range(20):
        area = math.pi * (d_pipe / 2.0)**2
        v = q_op / area
        re = (density * abs(v) * d_pipe) / viscosity
        rel_rough = roughness / (3.7 * d_pipe)
        re_term = 5.74 / (re**0.9)
        f_sj = 0.25 / (math.log10(rel_rough + re_term))**2
        k_sys = f_sj * (l_pipe / d_pipe) * (density / (2.0 * area**2))

        # Solve P_shutoff + C_coeff * Q2 = k_sys * Q2  =>  Q2 = P_shutoff / (k_sys - C_coeff)
        q_next = math.sqrt(p_shutoff / (k_sys - c_coeff))
        if abs(q_next - q_op) < 1e-10:
            q_op = q_next
            break
        q_op = q_next

    dp_op_theoretical = p_shutoff + c_coeff * (q_op**2)

    # 4. Code Execution: Full Network Solver
    pump = CentrifugalPump("Main Pump", flow_rated=q_rated, pressure_rated=p_rated, rise_to_shutoff_pct=rise_pct)
    pipe = Pipe("Discharge Pipe", length=l_pipe, diameter=d_pipe)

    t_src = Tank("Source Tank", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)
    t_snk = Tank("Sink Tank", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)

    p_atm = 101325.0
    def calc_src():
        for p in t_src.inlets + t_src.outlets:
            p.temperature = temp_k
            p.pressure = p_atm
        return p_atm

    def calc_snk():
        for p in t_snk.inlets + t_snk.outlets:
            p.temperature = temp_k
            p.pressure = p_atm
        return p_atm

    t_src.calculate = calc_src
    t_snk.calculate = calc_snk

    nodes = {"t_src": t_src, "pump": pump, "t_snk": t_snk}
    edges = [
        {"id": "e1", "source": "t_src", "target": "pump", "pipe": Pipe("Suction", 1.0, d_pipe)},
        {"id": "e2", "source": "pump", "target": "t_snk", "pipe": pipe}
    ]

    gs = GlobalSettings(fluid_type=fluid_type, global_roughness=roughness, atmospheric_pressure=p_atm)
    network = HydraulicNetwork(nodes=nodes, edges=edges, global_settings=gs)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    solver.fixed_pressure_nodes = {0: p_atm, 2: p_atm}
    stats = solver.solve()

    q_solver = pump.outlets[0].flow_rate
    dp_solver = pump.outlets[0].pressure - pump.inlets[0].pressure

    rel_error_q = abs(q_solver - q_op) / q_op
    rel_error_dp = abs(dp_solver - dp_op_theoretical) / dp_op_theoretical

    print("\n--- Test 3: Centrifugal Pump Operating Point ---")
    print(f"  Shutoff Pressure:            {p_shutoff:.2f} Pa ({p_shutoff/1e5:.2f} bar)")
    print(f"  Hand-Calc Operating Flow Q:  {q_op:.6f} m3/s ({q_op*60000:.2f} L/min)")
    print(f"  Hand-Calc Operating Boost:   {dp_op_theoretical:.2f} Pa ({dp_op_theoretical/1e5:.4f} bar)")
    print(f"  Solver Operating Flow Q:     {q_solver:.6f} m3/s ({q_solver*60000:.2f} L/min)")
    print(f"  Solver Operating Boost:      {dp_solver:.2f} Pa ({dp_solver/1e5:.4f} bar)")
    print(f"  Operating Flow Rel Error:    {rel_error_q * 100:.4f}%")
    print(f"  Operating Boost Rel Error:   {rel_error_dp * 100:.4f}%")

    assert rel_error_q < 0.01, f"Operating flow relative error {rel_error_q*100:.2f}% >= 1%"
    assert rel_error_dp < 0.01, f"Operating pressure boost relative error {rel_error_dp*100:.2f}% >= 1%"


def test_multi_loop_flow_and_pressure_continuity():
    """
    Multi-loop flow test: Verify mass balance conservation (sum Q_in = sum Q_out at all junctions)
    and pressure loop continuity across multi-loop pipe networks.
    """
    # Build a classic dual-parallel loop network:
    # Source Tank T1 -> Splitter J1 -> Loop A (Pipe A1) & Loop B (Pipe B1) -> Mixer J2 -> Sink Tank T2
    p_inlet = 400000.0   # 4 bar abs
    p_outlet = 101325.0  # 1 atm

    t1 = Tank("Source T1", elevation=0.0, fluid_level=0.0)
    t2 = Tank("Sink T2", elevation=0.0, fluid_level=0.0)
    
    def calc_t1():
        for p in t1.inlets + t1.outlets:
            p.pressure = p_inlet
        return p_inlet

    def calc_t2():
        for p in t2.inlets + t2.outlets:
            p.pressure = p_outlet
        return p_outlet

    t1.calculate = calc_t1
    t2.calculate = calc_t2

    j1 = Splitter("Splitter J1")
    j2 = Mixer("Mixer J2")

    # Loop A: Low resistance branch (D=0.08m, L=50m)
    # Loop B: High resistance branch (D=0.05m, L=80m)
    pipe_main_in = Pipe("Main In", length=10.0, diameter=0.1)
    pipe_a1 = Pipe("Pipe A1", length=50.0, diameter=0.08)
    pipe_b1 = Pipe("Pipe B1", length=80.0, diameter=0.05)
    pipe_main_out = Pipe("Main Out", length=10.0, diameter=0.1)

    nodes = {"t1": t1, "j1": j1, "j2": j2, "t2": t2}
    edges = [
        {"id": "e_in",  "source": "t1", "target": "j1", "target_port": "inlet-0", "pipe": pipe_main_in},
        {"id": "e_a",   "source": "j1", "target": "j2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": pipe_a1},
        {"id": "e_b",   "source": "j1", "target": "j2", "source_port": "outlet-1", "target_port": "inlet-1", "pipe": pipe_b1},
        {"id": "e_out", "source": "j2", "target": "t2", "source_port": "outlet-0", "pipe": pipe_main_out}
    ]

    gs = GlobalSettings(fluid_type="water", global_roughness=0.000045)
    network = HydraulicNetwork(nodes=nodes, edges=edges, global_settings=gs)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    solver.fixed_pressure_nodes = {0: p_inlet, 3: p_outlet}
    stats = solver.solve()

    # 1. Extract Flow Rates
    q_main_in = edges[0]['pipe'].inlets[0].flow_rate
    q_loop_a  = edges[1]['pipe'].inlets[0].flow_rate
    q_loop_b  = edges[2]['pipe'].inlets[0].flow_rate
    q_main_out = edges[3]['pipe'].inlets[0].flow_rate

    # 2. Junction Mass Conservation Verification (sum Q_in = sum Q_out)
    mass_err_j1 = abs(q_main_in - (q_loop_a + q_loop_b))
    mass_err_j2 = abs((q_loop_a + q_loop_b) - q_main_out)

    # 3. Pressure Loop Continuity Verification (KVL across parallel branches)
    p_j1 = j1.inlets[0].pressure
    p_j2 = j2.outlets[0].pressure

    dp_loop_a = edges[1]['pipe'].inlets[0].pressure - edges[1]['pipe'].outlets[0].pressure
    dp_loop_b = edges[2]['pipe'].inlets[0].pressure - edges[2]['pipe'].outlets[0].pressure

    loop_continuity_err = abs(dp_loop_a - dp_loop_b)

    print("\n--- Test 4: Multi-Loop Flow & Pressure Continuity ---")
    print(f"  Main Inlet Flow Q_in:        {q_main_in*60000:.2f} L/min")
    print(f"  Loop A Flow Q_A (DN80):      {q_loop_a*60000:.2f} L/min")
    print(f"  Loop B Flow Q_B (DN50):      {q_loop_b*60000:.2f} L/min")
    print(f"  Main Outlet Flow Q_out:      {q_main_out*60000:.2f} L/min")
    print(f"  Splitter J1 Mass Error:      {mass_err_j1:.10e} m3/s")
    print(f"  Mixer J2 Mass Error:         {mass_err_j2:.10e} m3/s")
    print(f"  Loop A Pressure Drop Delta P_A:   {dp_loop_a:.2f} Pa ({dp_loop_a/1e5:.4f} bar)")
    print(f"  Loop B Pressure Drop Delta P_B:   {dp_loop_b:.2f} Pa ({dp_loop_b/1e5:.4f} bar)")
    print(f"  Loop Pressure Discrepancy:        {loop_continuity_err:.10e} Pa")

    assert mass_err_j1 < 1e-7, f"Mass balance error at J1 ({mass_err_j1}) exceeds tolerance"
    assert mass_err_j2 < 1e-7, f"Mass balance error at J2 ({mass_err_j2}) exceeds tolerance"
    assert loop_continuity_err < 1.0, f"Loop continuity error ({loop_continuity_err} Pa) exceeds 1 Pa"


def test_cavitation_warning_logic():
    """
    Cavitation warning test: Verify solver sets `has_cavitation_warning = True`
    when suction pressure falls below 1.2 * P_vapor(T).
    """
    temp_k = 353.15  # 80°C
    fluid_type = "water"

    # 1. Theoretical Vapor Pressure of Water at 80°C using Antoine Equation
    p_vapor = FluidProperties.get_vapor_pressure(fluid_type, temp_k)
    p_cavitation_threshold = 1.2 * p_vapor

    print("\n--- Test 5: Cavitation Warning Detection ---")
    print(f"  Water Vapor Pressure @ 80 C: {p_vapor:.2f} Pa ({p_vapor/1e5:.4f} bar)")
    print(f"  Cavitation Safety Threshold: {p_cavitation_threshold:.2f} Pa ({p_cavitation_threshold/1e5:.4f} bar)")

    # -------------------------------------------------------------------------
    # Case A: Normal Operation (Suction Pressure = 100,000 Pa > Threshold)
    # -------------------------------------------------------------------------
    pump_normal = CentrifugalPump("Normal Pump", flow_rated=0.01, pressure_rated=300000.0)
    t_src_normal = Tank("Source Normal", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)
    t_snk_normal = Tank("Sink Normal", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)

    p_inlet_normal = 100000.0  # 1.0 bar abs > 0.567 bar threshold

    def calc_src_normal():
        for p in t_src_normal.inlets + t_src_normal.outlets:
            p.temperature = temp_k
            p.pressure = p_inlet_normal
        return p_inlet_normal

    def calc_snk_normal():
        for p in t_snk_normal.inlets + t_snk_normal.outlets:
            p.temperature = temp_k
            p.pressure = p_inlet_normal
        return p_inlet_normal

    t_src_normal.calculate = calc_src_normal
    t_snk_normal.calculate = calc_snk_normal

    nodes_a = {"t_src": t_src_normal, "pump": pump_normal, "t_snk": t_snk_normal}
    edges_a = [
        {"id": "e1", "source": "t_src", "target": "pump", "pipe": Pipe("P1", 1.0, 0.05)},
        {"id": "e2", "source": "pump", "target": "t_snk", "pipe": Pipe("P2", 1.0, 0.05)}
    ]

    gs = GlobalSettings(fluid_type=fluid_type)
    net_a = HydraulicNetwork(nodes=nodes_a, edges=edges_a, global_settings=gs)
    for n in nodes_a.values(): n.global_settings = gs
    for e in edges_a: e['pipe'].global_settings = gs

    solver_a = NetworkSolver(net_a)
    solver_a.fixed_pressure_nodes = {0: p_inlet_normal, 2: p_inlet_normal}
    stats_a = solver_a.solve()

    tel_a = extract_telemetry_dict(net_a)
    kpis_a = calculate_case_kpis(net_a, tel_a, stats_a)

    print(f"  Case A Suction Pressure:     {pump_normal.inlets[0].pressure:.2f} Pa")
    print(f"  Case A Pump Cavitation Flag: {pump_normal.cavitation_warning}")
    print(f"  Case A System KPI Warning:  {kpis_a['has_cavitation_warning']}")

    assert pump_normal.cavitation_warning is False
    assert kpis_a["has_cavitation_warning"] is False

    # -------------------------------------------------------------------------
    # Case B: Cavitation Warning Triggered (Suction Pressure = 40,000 Pa < Threshold)
    # -------------------------------------------------------------------------
    pump_cav = CentrifugalPump("Cavitation Pump", flow_rated=0.01, pressure_rated=300000.0)
    t_src_cav = Tank("Source Cavitation", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)
    t_snk_cav = Tank("Sink Cavitation", elevation=0.0, fluid_level=0.0, temperature=temp_k, fluid_type=fluid_type)

    p_inlet_cav = 40000.0  # 0.4 bar abs < 0.567 bar threshold

    def calc_src_cav():
        for p in t_src_cav.inlets + t_src_cav.outlets:
            p.temperature = temp_k
            p.pressure = p_inlet_cav
        return p_inlet_cav

    def calc_snk_cav():
        for p in t_snk_cav.inlets + t_snk_cav.outlets:
            p.temperature = temp_k
            p.pressure = p_inlet_cav
        return p_inlet_cav

    t_src_cav.calculate = calc_src_cav
    t_snk_cav.calculate = calc_snk_cav

    nodes_b = {"t_src": t_src_cav, "pump": pump_cav, "t_snk": t_snk_cav}
    edges_b = [
        {"id": "e1", "source": "t_src", "target": "pump", "pipe": Pipe("P1", 1.0, 0.05)},
        {"id": "e2", "source": "pump", "target": "t_snk", "pipe": Pipe("P2", 1.0, 0.05)}
    ]

    net_b = HydraulicNetwork(nodes=nodes_b, edges=edges_b, global_settings=gs)
    for n in nodes_b.values(): n.global_settings = gs
    for e in edges_b: e['pipe'].global_settings = gs

    solver_b = NetworkSolver(net_b)
    solver_b.fixed_pressure_nodes = {0: p_inlet_cav, 2: p_inlet_cav}
    stats_b = solver_b.solve()

    tel_b = extract_telemetry_dict(net_b)
    kpis_b = calculate_case_kpis(net_b, tel_b, stats_b)

    print(f"  Case B Suction Pressure:     {pump_cav.inlets[0].pressure:.2f} Pa")
    print(f"  Case B Pump Cavitation Flag: {pump_cav.cavitation_warning}")
    print(f"  Case B System KPI Warning:  {kpis_b['has_cavitation_warning']}")

    assert pump_cav.cavitation_warning is True
    assert kpis_b["has_cavitation_warning"] is True


if __name__ == "__main__":
    pytest.main(["-v", __file__])
