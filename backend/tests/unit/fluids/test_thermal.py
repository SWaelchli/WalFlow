
from simulation.schemas import GlobalSettings
from simulation.equipment.heat_exchanger import HeatExchanger


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
