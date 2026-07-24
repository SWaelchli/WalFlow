from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class CheckValve(HydraulicNode):
    """
    A check valve (non-return valve) that permits fluid flow in only one direction.
    Requires a minimum cracking pressure to open in the forward direction.
    """
    def __init__(self, name: str, cv: float = 10.0, cracking_pressure_bar: float = 0.05):
        super().__init__(name, node_type="check_valve")
        self.cv = max(0.001, cv)
        self.cracking_pressure_bar = max(0.0, cracking_pressure_bar)
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Calculates pressure drop across the check valve.
        Forward flow (Q >= 0): dP = Cracking_Pressure + (1.732e9 * density * Q^2) / Cv^2
        Reverse flow (Q < 0): Severe resistance (Cv_closed = 1e-4) to block backflow.
        """
        K_CV_SI = 1.732e9
        cracking_pa = self.cracking_pressure_bar * 100000.0

        if flow_rate >= 0:
            effective_cv = max(0.001, self.cv)
            dp_friction = (K_CV_SI * density * flow_rate * flow_rate) / (effective_cv ** 2)
            return cracking_pa + dp_friction
        else:
            # Backflow restriction (closed check valve)
            effective_cv = 1e-4
            dp_friction = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (effective_cv ** 2)
            return -cracking_pa + dp_friction

    def calculate(self):
        """
        Updates outlet conditions and status telemetry based on flow state.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt

        self.calculate_temperature()
        return dp
