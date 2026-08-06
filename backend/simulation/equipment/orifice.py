from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class Orifice(HydraulicNode):
    """
    A Orifice acts as a restriction in the hydraulic network. It calculates the pressure drop caused by the restriction in area.
    """
    def __init__(self, name: str, pipe_diameter: float = 0.05248, orifice_diameter: float = 0.01):
        # Call the parent class constructor to set up the ID and lists
        super().__init__(name, node_type="orifice")
        
        self.pipe_diameter = max(0.001, float(pipe_diameter or 0.05248))
        self.orifice_diameter = max(0.0001, float(orifice_diameter or 0.01))
        
        # A orifice requires exactly one inlet and one outlet
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Calculates pressure drop using Bernoulli equation.
        Automatically uses connected pipe diameter for beta ratio calculation.
        """
        pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = max(0.0001, self.orifice_diameter)

        # 1. Calculate beta ratio (b = d / D)
        beta_ratio = min(0.99, orif_d / pipe_d)

        # 2. Calculate velocity of the pipe upstream of the orifice (v1 = Q / A1)
        area_pipe = math.pi * (pipe_d / 2.0)**2
        velocity = flow_rate / max(1e-9, area_pipe)

        
        # 3. Calculate Dynamic Pressure term (0.5 * rho * v^2)
        dynamic_pressure = 0.5 * density * velocity * abs(velocity)  # abs to preserve direction of flow for pressure drop sign

        # 4. Calculate Orifice Reynolds number and dynamic Discharge Coefficient (C_d)
        area_orifice = math.pi * (self.orifice_diameter / 2)**2
        v_orifice = flow_rate / max(1e-9, area_orifice)
        re_orifice = (density * abs(v_orifice) * self.orifice_diameter) / max(1e-7, viscosity)
        
        discharge_coefficient = FluidProperties.get_orifice_cd(re_orifice)
        geometry_factor = (1 - beta_ratio**4) / (discharge_coefficient**2 * beta_ratio**4)
        
        # 5. Calculate recoverable pressure drop at taps (Delta P = Dynamic Pressure * Geometry Factor) 
        rec_delta_p = dynamic_pressure * geometry_factor

        # 6. Calculate Permanent Pressure Loss (unrecoverable loss)

        perm_delta_p = rec_delta_p * (1 - beta_ratio**2)

        return  perm_delta_p

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = max(0.0001, self.orifice_diameter)
        beta_ratio = min(0.99, orif_d / pipe_d)
        area_pipe = math.pi * (pipe_d / 2.0)**2
        
        area_orifice = math.pi * (self.orifice_diameter / 2.0)**2
        v_orifice = flow_rate / max(1e-9, area_orifice)
        re_orifice = (density * abs(v_orifice) * self.orifice_diameter) / max(1e-7, viscosity)
        
        cd_turbulent = 0.60
        re_safe = max(1e-6, re_orifice)
        cd_val = cd_turbulent / math.sqrt(1.0 + 250.0 / re_safe)
        
        c_const = 0.5 * density / (area_pipe ** 2) * (1.0 - beta_ratio**4) / (beta_ratio**4) * (1.0 - beta_ratio**2)
        
        if cd_val <= 0.05:
            cd = 0.05
            return c_const / (cd**2) * 2.0 * abs(flow_rate)
        else:
            c_re_coeff = (density * (1.0 / area_orifice) * self.orifice_diameter) / max(1e-7, viscosity)
            c_inv_q = 250.0 / c_re_coeff
            return c_const / 0.36 * (2.0 * abs(flow_rate) + c_inv_q)

    def calculate(self):

        """
        Updates the outlet port's state based on the inlet port's state and the calculated drop.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        # Calculate the pressure drop based on the current flow rate passing through
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        # Update the outlet conditions
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate  # Incompressible flow means Q_in = Q_out
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        # Throttling Heat: dT = abs(dP) / (rho * Cp)
        # Apply to the port where fluid is EXITING the node.
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')

        if inlet.flow_rate >= 0:
            # Forward flow: Inlet -> Outlet
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            # Reverse flow: Outlet -> Inlet
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt

        return dp