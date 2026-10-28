# Equipment Archetypes & Templates

This reference guide provides ready-to-use Python backend templates for all major hydraulic equipment archetypes in WalFlow.

---

## Archetype 1: Passive In-line Resistor
*Examples:* Orifices, Strainers/Filters, Porous Elements, Calibrated Clearances.

A component whose law is the same in both flow directions has two neutral ports (`port-0`, `port-1`) and no inlet or outlet. It inherits from `InlineNode`. The parser makes it a `ComponentLink` edge between two hidden junctions at its ports, so both ports have solved pressures (see `backend/simulation/equipment/component_link.md`). The link then:
- evaluates `calculate_delta_p` at `|Q|` with the fluid of the upstream port;
- applies the sign of the flow;
- adds the throttling heat $dT = |\Delta P| / (\rho c_p)$ at the port the flow leaves by;
- fills `ports[k]`, with flow_rate positive into the component.

So the class holds only the law. Reference implementations: `orifice.py`, `filter.py`, `calibrated_restriction.py`.

```python
from simulation.equipment.base_node import InlineNode

class InLineResistor(InlineNode):
    """
    A passive resistor with two neutral ports: quadratic loss, the same in both flow directions.
    """
    def __init__(self, name: str, resistance_k: float = 1000.0):
        super().__init__(name, node_type="in_line_resistor")
        self.k = float(resistance_k)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        # Odd in Q: dP = k * rho * Q * |Q|
        return self.k * density * flow_rate * abs(flow_rate)

    # No calculate(), no ports to add, no calculate_dp_derivative (the component link differentiates numerically)
```

Use `upstream_port()` / `downstream_port()` where telemetry or a check needs the flow direction (e.g. the ISO 5167 validity of the orifice). If the physics depends on the direction (flow-to-open valve, counter-current exchanger), the component is not neutral. Use role ports and Archetype 3 or 6.

---

## Archetype 2: Active Flow Source / Pump
*Examples:* Centrifugal Pumps ($H(Q)$ curve), Volumetric Positive Displacement Pumps.

```python
from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class PositiveDisplacementPump(HydraulicNode):
    """
    Positive displacement pump delivering fixed volumetric flow.
    Blocks all flow when switched off.
    """
    def __init__(self, name: str, flow_rated_m3s: float = 0.001667, motor_power_w: float = 5000.0, efficiency: float = 0.85):
        super().__init__(name, node_type="volumetric_pump")
        self.flow_rated = float(flow_rated_m3s)
        self.motor_power = float(motor_power_w)
        self.efficiency = float(efficiency)
        
        # When turned off, PD pumps block all forward & reverse flow
        self.blocks_flow_on_shutdown = True
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        if not self.active:
            # Closed high resistance
            return 1e8 * flow_rate
        
        # Pressure boost generated: dP = P_in - P_out = -delta_P_pump
        # Linear/stiff slope around rated flow
        slope = 1e8
        return slope * (flow_rate - self.flow_rated)

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        # Pumps (and pipes) are the only nodes whose analytical derivative the solver uses
        return 1e8

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        
        # Thermal heating from motor mechanical inefficiency
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
        mass_flow = abs(inlet.flow_rate) * inlet.density
        
        if mass_flow > 1e-6 and self.active:
            q_heat_w = self.motor_power * (1.0 - self.efficiency)
            dt = q_heat_w / (mass_flow * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            outlet.temperature = inlet.temperature
            
        self.calculate_temperature()
        return dp
```

---

## Archetype 3: Dynamic Closed / MCP Valve
*Examples:* Check Valves, Safety Relief Valves (PSV), Rupture Discs.

```python
from simulation.equipment.base_node import HydraulicNode
from simulation.equipment.check_valve import open_seat_dp
import math

class DynamicCheckValve(HydraulicNode):
    """
    Check valve using Fischer-Burmeister MCP formulation.
    """
    def __init__(self, name: str, cv: float = 10.0, cracking_pressure_bar: float = 0.05):
        super().__init__(name, node_type="check_valve")
        self.use_mcp_formulation = True
        self.cv = max(0.001, float(cv))
        self.cracking_pressure_bar = max(0.0, float(cracking_pressure_bar))
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001,
                          p_in_pa: float = None, p_out_pa: float = None, update_state: bool = True) -> float:
        if p_in_pa is not None and p_out_pa is not None:
            p_scale = 100000.0
            q_scale = 0.001
            epsilon = 1e-4
            cracking_pa = self.cracking_pressure_bar * 100000.0
            dp_valve = p_in_pa - p_out_pa
            # Open-seat friction (Cv with the viscosity factor F_R), value only
            dp_friction = open_seat_dp(self.cv, flow_rate, density, viscosity)
            
            a = flow_rate / q_scale
            b = (cracking_pa + dp_friction - dp_valve) / p_scale
            phi = math.sqrt(a**2 + b**2 + epsilon**2) - (a + b)
            return dp_valve - p_scale * phi

        # Standalone evaluation fallback (smooth tanh)
        scale = 1e-5
        dp_friction = open_seat_dp(self.cv, flow_rate, density, viscosity)
        return (self.cracking_pressure_bar * 1e5) * math.tanh(flow_rate / scale) + dp_friction

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        self.calculate_temperature()
        return dp
```

---

## Archetype 4: Pressure Boundary (Tank / Reservoir)
*Examples:* Atmospheric Tank, Pressurized Vessel, Infinite Source/Sink.

```python
from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class BoundaryTank(HydraulicNode):
    """
    Fixed pressure and temperature boundary.
    Imposes hydrostatic pressure: P = P_atm + rho * g * level
    """
    def __init__(self, name: str, elevation: float = 0.0, fluid_level: float = 1.0, temperature: float = 293.15, fluid_type: str = "water"):
        super().__init__(name, node_type="tank")
        self.is_pressure_boundary = True
        self.elevation = float(elevation)
        self.fluid_level = float(fluid_level)
        self.temperature = float(temperature)
        self.fluid_type = str(fluid_type)
        
        self.add_inlet()
        self.add_outlet()

    def get_boundary_pressure(self) -> float:
        rho = FluidProperties.get_density(self.fluid_type, self.temperature)
        p_atm = 101325.0
        p_hydro = rho * 9.81 * self.fluid_level
        return p_atm + p_hydro

    def calculate(self):
        p_bnd = self.get_boundary_pressure()
        for port in self.inlets + self.outlets:
            port.pressure = p_bnd
            port.temperature = self.temperature
            port.density = FluidProperties.get_density(self.fluid_type, self.temperature)
            port.viscosity = FluidProperties.get_viscosity(self.fluid_type, self.temperature)
        return 0.0
```

---

## Archetype 5: Multi-port Flow Junction
*Examples:* Junction (3 to 8 neutral ports), Measure Point (a junction of 2 neutral ports, `measure_point.py`), 3-Way TCV.

The reference implementation is `backend/simulation/equipment/junction.py`: no `calculate_delta_p` (one total pressure at all ports), the default direction-aware `calculate_temperature`, and `calculate()` only copies the pressure and calls `update_outward_properties()`. Neutral ports are mapped to inlet / outlet slots by the parser from the drawn pipe direction (`GraphParser._assign_junction_ports`); a node whose ports all share one total pressure sets `single_side = True` for the static pressure report.

```python
from simulation.equipment.base_node import HydraulicNode

class Junction(HydraulicNode):
    single_side = True

    def __init__(self, name: str, num_ports: int = 3):
        super().__init__(name, node_type="junction")
        self.num_ports = num_ports
        self.port_slots = {}   # filled by the parser: port index -> ("inlet" | "outlet", slot index)

    def calculate(self):
        ports = self.inlets + self.outlets
        for port in ports[1:]:
            port.pressure = ports[0].pressure
        self.update_outward_properties()
        return 0.0
```

---

## Archetype 6: Thermal Unit / Heat Exchanger
*Examples:* Water-cooled Heat Exchangers, Radiators, Thermal Changers.

```python
from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class HeatExchangerUnit(HydraulicNode):
    """
    Hydraulic cooler/heater with thermal duty and pressure drop.
    """
    def __init__(self, name: str, rated_cooling_kw: float = 100.0, rated_dp_bar: float = 0.5, rated_flow_lmin: float = 200.0):
        super().__init__(name, node_type="heat_exchanger")
        self.cooling_power_w = rated_cooling_kw * 1000.0
        self.rated_dp_pa = rated_dp_bar * 100000.0
        self.rated_q_m3s = rated_flow_lmin / 60000.0
        
        # Hydraulic resistance constant K = dP_rated / (rho * Q_rated^2)
        rho_ref = 1000.0
        self.k = self.rated_dp_pa / (rho_ref * (max(1e-6, self.rated_q_m3s)**2))
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        return self.k * density * flow_rate * abs(flow_rate)

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
        mass_flow = abs(inlet.flow_rate) * inlet.density
        
        if mass_flow > 1e-6 and self.active:
            # delta T from heat removal
            dt = -self.cooling_power_w / (mass_flow * cp)
            outlet.temperature = max(273.15, inlet.temperature + dt)
        else:
            outlet.temperature = inlet.temperature
            
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        self.calculate_temperature()
        return dp
```
