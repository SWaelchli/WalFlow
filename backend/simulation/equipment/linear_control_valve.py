from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

# Smallest Cv-controlled opening; below it the valve is closed (D-11)
MIN_OPENING_PCT = 0.1
CLOSED_STIFFNESS = 1e12  # Pa s/m^3, linear resistance of a closed valve

class LinearControlValve(HydraulicNode):
    """
    A control valve with a linear trim characteristic.
    Effective Cv = Max Cv * (Opening / 100)
    """
    def __init__(self, name: str, max_cv: float, opening_pct: float = 100.0, fl: float = 0.9, fd: float = 0.46):
        super().__init__(name, node_type="linear_control_valve")
        self.max_cv = max_cv            # Maximum flow coefficient capacity
        self.opening_pct = opening_pct  # 0.0 (closed) to 100.0 (fully open)
        # IEC 60534-2-1 Table D.2 style factors; default globe single port, contoured plug, flow to open
        self.fl = fl
        self.fd = fd
        # Valve size for F_R, set by the graph parser from the connected pipe; default DN50
        self.pipe_diameter = 0.05248

        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001,
                          opening_pct: float | None = None) -> float:
        """
        Calculates pressure drop across the valve at its current position, or at opening_pct if given.
        Uses the liquid Cv formula with the IEC 60534-2-1 Annex A Reynolds number factor (F_R).
        """
        if opening_pct is None:
            opening_pct = self.opening_pct
        if opening_pct < MIN_OPENING_PCT:
            # Closed below the minimum opening: block flow with a very high linear resistance
            return CLOSED_STIFFNESS * flow_rate

        effective_opening = opening_pct / 100.0
        
        # Calculate the effective Cv (assuming a linear trim)
        cv_eff = self.max_cv * effective_opening
        
        # Reynolds number factor, IEC 60534-2-1 Annex A (D-29)
        fr = FluidProperties.get_iec_valve_fr(flow_rate, viscosity / density, cv_eff, self.max_cv,
                                              self.fl, self.fd, self.pipe_diameter)
        cv_eff_adj = max(1e-10, cv_eff * fr)  # F_R is floored; keeps laminar Δp linear in Q (D-29)
        
        # Conversion constant: (15850.32^2 * 6894.76 / 1000) approx 1.732e9
        K_CV_SI = 1.732e9
        
        dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_eff_adj**2)
        
        return dp

    def calculate(self):

        """
        Updates the outlet port's state based on the friction loss.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        
        # Throttling Heat: dT = abs(dP) / (rho * Cp)
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        from simulation.fluid_utils import FluidProperties
        
        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt

        # Dynamically update local properties based on temperature feedback
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
        inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
        
        # Outlet temperature already includes the throttling heat (F1-16); do not overwrite it
        
        return dp
