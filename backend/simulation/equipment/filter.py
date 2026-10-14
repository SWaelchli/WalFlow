from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class Filter(HydraulicNode):
    """
    A Filter/Strainer with clogging logic.
    User defines pressure drop at a reference flow for clean and dirty states.
    """
    def __init__(self, name: str, 
                 dp_clean_bar: float = 0.2, 
                 dp_terminal_bar: float = 1.0, 
                 flow_ref_lmin: float = 100.0,
                 clogging_pct: float = 0.0,
                 ref_viscosity_mpas: float = None):
        super().__init__(name, node_type="filter")
        
        # Inputs
        self.dp_clean = dp_clean_bar * 100000.0
        self.dp_terminal = dp_terminal_bar * 100000.0
        self.flow_ref = flow_ref_lmin / 60000.0 # Convert to m3/s
        self.clogging_pct = clogging_pct
        # F1-19: viscosity of the fluid the datasheet dP refers to (mPa*s); None = system fluid at
        # its reference temperature (40 C for oils and fuels, 20 C for aqueous fluids)
        self.ref_viscosity_mpas = ref_viscosity_mpas
        
        self.add_inlet()
        self.add_outlet()

    def _reference_state(self):
        """(rho_ref, mu_ref) of the datasheet fluid the clean / terminal dP refer to."""
        fluid = getattr(self.global_settings, 'fluid_type', 'water')
        t_ref = 293.15 if FluidProperties.get_fluid(fluid)["category"] == "Water & Aqueous" else 313.15
        rho_ref = FluidProperties.get_density(fluid, t_ref)
        if self.ref_viscosity_mpas:
            mu_ref = self.ref_viscosity_mpas * 1e-3
        else:
            mu_ref = FluidProperties.get_viscosity(fluid, t_ref)
        return rho_ref, mu_ref

    def _element_area(self):
        return max(1e-4, self.flow_ref / max(0.1, (2.0 * max(100.0, self.dp_clean) / 1000.0)**0.5))

    def _reynolds(self, flow_rate: float, density: float, viscosity: float) -> float:
        # Representative element dimension & velocity for filter mesh Reynolds number (1 mm pore)
        v_elem = flow_rate / self._element_area()
        return (density * abs(v_elem) * 0.001) / max(1e-7, viscosity)

    def get_resistance_k(self):
        """Current K factor (dP = K * rho * Q^2 * f(Re)), calibrated so that the datasheet dP is
        reproduced at the reference flow in the reference fluid (F1-19)."""
        rho_ref, mu_ref = self._reference_state()
        q_ref = max(1e-9, self.flow_ref)
        f_ref = FluidProperties.get_filter_viscosity_factor(self._reynolds(q_ref, rho_ref, mu_ref))
        k_clean = self.dp_clean / (rho_ref * q_ref**2 * f_ref)
        k_terminal = self.dp_terminal / (rho_ref * q_ref**2 * f_ref)

        # Linear interpolation of resistance
        clog_factor = self.clogging_pct / 100.0
        return k_clean + clog_factor * (k_terminal - k_clean)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        k_curr = self.get_resistance_k()
        re_filter = self._reynolds(flow_rate, density, viscosity)
        
        visc_factor = FluidProperties.get_filter_viscosity_factor(re_filter)
        return k_curr * density * flow_rate * abs(flow_rate) * visc_factor

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        k_curr = self.get_resistance_k()
        d_pore = 0.001
        a_ref = self._element_area()
        re_filter = self._reynolds(flow_rate, density, viscosity)
        
        deriv_turb = 2.0 * k_curr * density * abs(flow_rate)
        if re_filter < 2000.0:
            c_lam = 100.0 * a_ref * viscosity / (density * d_pore)
            return k_curr * density * (2.0 * abs(flow_rate) + c_lam)
        elif re_filter > 4000.0:
            return deriv_turb
        else:
            c_lam = 100.0 * a_ref * viscosity / (density * d_pore)
            deriv_lam = k_curr * density * (2.0 * abs(flow_rate) + c_lam)
            w = (re_filter - 2000.0) / 2000.0
            return (1.0 - w) * deriv_lam + w * deriv_turb

    def calculate(self):

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
        
        return dp
