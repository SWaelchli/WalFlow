from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class Pipe(HydraulicNode):
    """
    A Pipe connects two nodes and calculates the pressure drop caused by fluid friction.
    It also calculates temperature rise due to viscous dissipation.
    """
    def __init__(
        self,
        name: str,
        length: float,
        diameter: float,
        roughness: float = 0.000045,
        friction_factor: float = 0.02
    ):
        # Call the parent class constructor to set up the ID and lists        
        super().__init__(name, node_type="pipe")
        
        self.length = length                    # Pipe length (meters)
        self.diameter = diameter                # Internal diameter (meters)
        self.roughness = roughness              # Absolute surface roughness (meters)
        self.friction_factor = friction_factor  # Darcy friction factor (f)
        
        # A pipe requires exactly one inlet and one outlet
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float) -> float:
        """
        Calculates pressure drop using the Darcy-Weisbach equation.
        Friction factor is calculated with a smooth transition between laminar (Re < 2000)
        and turbulent (Re > 4000) regimes to ensure solver stability.
        """
        if self.diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
            
        area = math.pi * (self.diameter / 2.0)**2
        velocity = flow_rate / area
        abs_v = abs(velocity)
        
        if viscosity > 0 and abs_v > 0:
            re = (density * abs_v * self.diameter) / viscosity
            
            # Helper for Swamee-Jain turbulent friction factor using localized pipe roughness
            def get_f_turb(re_val):
                eps = self.roughness if (self.roughness is not None and self.roughness > 0) else 0.000045
                return 0.25 / (math.log10(eps / (3.7 * self.diameter) + 5.74 / re_val**0.9))**2

            if re < 2000.0:
                f = 64.0 / re
            elif re > 4000.0:
                f = get_f_turb(re)
            else:
                # Smooth blending between 2000 and 4000
                f_lam = 64.0 / re
                f_turb = get_f_turb(re)
                w = (re - 2000.0) / 2000.0
                f = (1.0 - w) * f_lam + w * f_turb
        else:
            f = 0.0
            
        delta_p = f * (self.length / self.diameter) * (density * velocity * abs_v / 2.0)
        return delta_p

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
            outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
            outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
            inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
            inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt
            inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
            inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
            outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
            outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        return dp

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float) -> float:
        if self.diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
            
        area = math.pi * (self.diameter / 2.0)**2
        velocity = flow_rate / area
        abs_v = abs(velocity)
        
        if viscosity > 0 and abs_v > 0:
            re = (density * abs_v * self.diameter) / viscosity
            
            def get_dp_deriv_turb(q_val, re_val):
                eps = self.roughness if (self.roughness is not None and self.roughness > 0) else 0.000045
                f = 0.25 / (math.log10(eps / (3.7 * self.diameter) + 5.74 / re_val**0.9))**2
                return f * (self.length / self.diameter) * density * abs(q_val) / (area ** 2)

            if re < 2000.0:
                return 32.0 * viscosity * self.length / ((self.diameter ** 2) * area)
            elif re > 4000.0:
                return get_dp_deriv_turb(flow_rate, re)
            else:
                # Blended derivative
                deriv_lam = 32.0 * viscosity * self.length / ((self.diameter ** 2) * area)
                deriv_turb = get_dp_deriv_turb(flow_rate, re)
                w = (re - 2000.0) / 2000.0
                return (1.0 - w) * deriv_lam + w * deriv_turb
        else:
            return 0.0


