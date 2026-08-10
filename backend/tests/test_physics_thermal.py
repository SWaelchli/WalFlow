from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_thermal_balance():
    print("\n--- Phase 9: Thermal Balance Test ---")
    gs = GlobalSettings()
    
    # Setup: Tank(40C) -> Pump -> HeatExchanger(Cooling) -> Tank
    temp_initial_c = 40.0
    temp_initial_k = temp_initial_c + 273.15
    
    tank_source = Tank("Hot Oil Tank", fluid_level=2.0, temperature=temp_initial_k, fluid_type="iso_vg_46")
    pump = CentrifugalPump("Main Pump", flow_rated=100.0/60000.0, pressure_rated=10.0*100000.0, rise_to_shutoff_pct=20.0)
    # Cooling duty: -1,000,000 Watts (1 MW)
    hx = HeatExchanger("Oil Cooler", heat_duty=-1000000.0, rated_dp_bar=0.01)
    tank_sink = Tank("Return Tank", fluid_level=1.0, temperature=temp_initial_k, fluid_type="iso_vg_46")
    
    nodes = {
        "t1": tank_source,
        "p1": pump,
        "hx1": hx,
        "t2": tank_sink
    }
    for node in nodes.values():
        node.global_settings = gs
    
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "p1", "target": "hx1", "pipe": Pipe("p2", 1, 0.05)},
        {"source": "hx1", "target": "t2", "pipe": Pipe("p3", 1, 0.05)}
    ]
    for edge in edges:
        edge['pipe'].global_settings = gs
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(network)
    
    stats = solver.solve()
    q = pump.inlets[0].flow_rate
    
    # Check source tank temp
    tank_t = tank_source.outlets[0].temperature - 273.15
    print(f"Tank Source Temp: {tank_t:.2f} C")
    
    t_in = hx.inlets[0].temperature - 273.15
    t_out = hx.outlets[0].temperature - 273.15
    mass_flow = q * hx.inlets[0].density
    
    print(f"Flow Rate: {q*60000:.2f} L/min ({mass_flow:.2f} kg/s)")
    print(f"HX Inlet Temp: {t_in:.2f} C")
    print(f"HX Outlet Temp: {t_out:.2f} C")
    print(f"Temperature Drop: {t_in - t_out:.2f} C")
    
    if t_out < t_in:
        print("SUCCESS: Temperature decreased across the cooler.")
    else:
        print("FAILURE: Temperature did not decrease.")

def test_water_and_air_coolers():
    print("\n--- Test: Water Cooled and Air Cooled Heat Exchangers ---")
    
    # 1. Water-cooled: cooling process fluid (65C inlet, 40C water medium)
    hx_water = HeatExchanger(
        "Water Cooler", 
        rated_cooling_kw=260.0, 
        rated_flow_lmin=387.0, 
        design_inlet_temp_c=65.0, 
        medium_temp_c=40.0, 
        cooler_type="water_cooled"
    )
    hx_water.global_settings = GlobalSettings(fluid_type="iso_vg_46")
    hx_water.inlets[0].flow_rate = 344.0 / 60000.0
    hx_water.inlets[0].density = 878.0
    hx_water.inlets[0].temperature = 65.0 + 273.15
    hx_water.calculate_temperature()
    
    t_out_water_cooling = hx_water.outlets[0].temperature - 273.15
    print(f"Water Cooler (Cooling) Outlet: {t_out_water_cooling:.3f} C (Expected ~44.7C)")
    assert 40.0 < t_out_water_cooling < 65.0
    
    # 2. Water-cooled: heating process fluid (10C inlet, 40C water medium)
    hx_water_heating = HeatExchanger(
        "Water Heater", 
        rated_cooling_kw=260.0, 
        rated_flow_lmin=387.0, 
        design_inlet_temp_c=65.0, 
        medium_temp_c=40.0, 
        cooler_type="water_cooled"
    )
    hx_water_heating.global_settings = GlobalSettings(fluid_type="iso_vg_46")
    hx_water_heating.inlets[0].flow_rate = 344.0 / 60000.0
    hx_water_heating.inlets[0].density = 878.0
    hx_water_heating.inlets[0].temperature = 10.0 + 273.15
    hx_water_heating.calculate_temperature()
    
    t_out_water_heating = hx_water_heating.outlets[0].temperature - 273.15
    print(f"Water Cooler (Heating) Outlet: {t_out_water_heating:.3f} C (Expected ~36.9C)")
    assert 10.0 < t_out_water_heating < 40.0

    # 3. Air-cooled: cooling process fluid (65C inlet, 15C ambient medium)
    hx_air = HeatExchanger(
        "Air Cooler", 
        rated_cooling_kw=260.0, 
        rated_flow_lmin=387.0, 
        design_inlet_temp_c=65.0, 
        cooler_type="air_cooled"
    )
    # Air-cooled should track globalsettings ambient temperature (15C = 288.15K)
    hx_air.global_settings = GlobalSettings(fluid_type="iso_vg_46", ambient_temperature=15.0+273.15)
    hx_air.inlets[0].flow_rate = 344.0 / 60000.0
    hx_air.inlets[0].density = 878.0
    hx_air.inlets[0].temperature = 65.0 + 273.15
    hx_air.calculate_temperature()
    
    t_out_air_cooling = hx_air.outlets[0].temperature - 273.15
    print(f"Air Cooler (Cooling) Outlet: {t_out_air_cooling:.3f} C")
    assert 15.0 < t_out_air_cooling < 65.0

    # 4. Air-cooled: heating process fluid (10C inlet, 25C ambient medium)
    hx_air_heating = HeatExchanger(
        "Air Heater", 
        rated_cooling_kw=260.0, 
        rated_flow_lmin=387.0, 
        design_inlet_temp_c=65.0, 
        cooler_type="air_cooled"
    )
    # Ambient = 25C = 298.15K
    hx_air_heating.global_settings = GlobalSettings(fluid_type="iso_vg_46", ambient_temperature=25.0+273.15)
    hx_air_heating.inlets[0].flow_rate = 344.0 / 60000.0
    hx_air_heating.inlets[0].density = 878.0
    hx_air_heating.inlets[0].temperature = 10.0 + 273.15
    hx_air_heating.calculate_temperature()
    
    t_out_air_heating = hx_air_heating.outlets[0].temperature - 273.15
    print(f"Air Cooler (Heating) Outlet: {t_out_air_heating:.3f} C")
    assert 10.0 < t_out_air_heating < 25.0

def test_cooler_sizing_modes():
    print("\n--- Test: Heat Exchanger Sizing and UA Rating Modes ---")
    
    # 1. Specify Design Temperatures Mode
    # Design: Inlet 65C, target outlet 40C, rated flow 387 L/min, medium water at 10C.
    # At exact design flow rate, the outlet temperature should hit exactly the target (40C)!
    hx_temps = HeatExchanger(
        "Design Temps Cooler",
        rated_flow_lmin=387.0,
        design_inlet_temp_c=65.0,
        design_outlet_temp_c=40.0,
        medium_temp_c=10.0,
        rating_method="design_temps"
    )
    hx_temps.global_settings = GlobalSettings(fluid_type="iso_vg_46")
    hx_temps.inlets[0].flow_rate = 387.0 / 60000.0
    from simulation.fluid_utils import FluidProperties
    hx_temps.inlets[0].density = FluidProperties.get_density("iso_vg_46", 65.0 + 273.15)
    hx_temps.inlets[0].temperature = 65.0 + 273.15
    hx_temps.calculate_temperature()
    
    t_out_actual = hx_temps.outlets[0].temperature - 273.15
    print(f"Design Temps Sizing Mode: Outlet = {t_out_actual:.2f} C (Target: 40.00C)")
    assert abs(t_out_actual - 40.0) < 1e-5
    
    # 2. Specify UA Mode
    # Directly set UA = 2000.0 W/K
    hx_ua = HeatExchanger(
        "UA Direct Cooler",
        rated_flow_lmin=387.0,
        rating_method="ua_direct",
        ua_direct_w_k=2000.0,
        medium_temp_c=10.0
    )
    hx_ua.global_settings = GlobalSettings(fluid_type="iso_vg_46")
    hx_ua.inlets[0].flow_rate = 387.0 / 60000.0
    hx_ua.inlets[0].density = FluidProperties.get_density("iso_vg_46", 65.0 + 273.15)
    hx_ua.inlets[0].temperature = 65.0 + 273.15
    hx_ua.calculate_temperature()
    
    t_out_ua = hx_ua.outlets[0].temperature - 273.15
    print(f"UA Direct Rating Mode: Outlet = {t_out_ua:.2f} C")
    assert 10.0 < t_out_ua < 65.0

if __name__ == "__main__":
    test_thermal_balance()
    test_water_and_air_coolers()
    test_cooler_sizing_modes()
