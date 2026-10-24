from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class CalibratedRestriction(HydraulicNode):
    """
    A Calibrated Restriction acts as a restriction in the hydraulic network,
    calibrated from a baseline flow, temperature, and pressure drop case.
    Supports three models: Orifice, Laminar, and Quadratic.
    """
    def __init__(
        self,
        name: str,
        flow_base_lmin: float = 10.0,
        inlet_pressure_base_bar: float = 3.5,
        outlet_pressure_base_bar: float = 1.0,
        temp_base_c: float = 45.0,
        restriction_model: str = "orifice",
        fluid_type: str = "system"
    ):
        super().__init__(name, node_type="calibrated_restriction")
        
        # Only a missing value takes the default; 0 °C is a valid calibration temperature
        self.flow_base_lmin = 10.0 if flow_base_lmin is None else float(flow_base_lmin)
        self.inlet_pressure_base_bar = 3.5 if inlet_pressure_base_bar is None else float(inlet_pressure_base_bar)
        self.outlet_pressure_base_bar = 1.0 if outlet_pressure_base_bar is None else float(outlet_pressure_base_bar)
        self.temp_base_c = 45.0 if temp_base_c is None else float(temp_base_c)
        self.restriction_model = restriction_model or "orifice"
        self.fluid_type = fluid_type or "system"
        
        # Will be auto-set by graph parser based on connection, default to DN50
        self.pipe_diameter = 0.05248
        
        self.add_inlet()
        self.add_outlet()
        
        # Calibrated lazily at first use: the parser sets the pipe bore and the
        # global settings (system fluid) only after construction
        self._calibration_key = None

    def _get_calibration_fluid(self) -> str:
        """Helper to resolve the fluid type at calibration time."""
        if self.fluid_type == "system" and self.global_settings:
            return getattr(self.global_settings, "fluid_type", "water")
        if self.fluid_type == "system":
            return "water"
        return self.fluid_type

    def _ensure_calibrated(self):
        """Calibrates on first use and again only when an input of the calibration changed."""
        key = (self.flow_base_lmin, self.inlet_pressure_base_bar, self.outlet_pressure_base_bar,
               self.temp_base_c, self.restriction_model, self._get_calibration_fluid(), self.pipe_diameter)
        if key != self._calibration_key:
            self._calibrate()
            self._calibration_key = key

    def _calibrate(self):
        """Calibrates coefficients based on baseline case."""
        # 1. Convert baseline parameters to SI units
        q0 = max(1e-6, self.flow_base_lmin / 60000.0)
        dp0 = max(1.0, (self.inlet_pressure_base_bar - self.outlet_pressure_base_bar) * 100000.0)
        t0 = max(273.15, self.temp_base_c + 273.15)
        
        cal_fluid = self._get_calibration_fluid()
        rho0 = FluidProperties.get_density(cal_fluid, t0)
        mu0 = FluidProperties.get_viscosity(cal_fluid, t0)
        
        self.cal_rho0 = rho0
        self.cal_mu0 = mu0

        if self.restriction_model == "laminar":
            # dP = K_lam * mu * q  =>  K_lam = dP / (mu * q)
            self.k_lam = dp0 / (mu0 * q0)
            
        elif self.restriction_model == "quadratic":
            # dP = K_quad * rho * q^2  =>  K_quad = dP / (rho * q^2)
            self.k_quad = dp0 / (rho0 * q0**2)
            
        else: # orifice model
            # Solve exact dP(d) = dp0 using bisection method
            pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
            
            def calculate_dp_for_d(d_val):
                return FluidProperties.get_classic_orifice_dp(q0, rho0, mu0, pipe_d, d_val)
            
            x_low = 1e-6
            x_high = 10.0
            
            # Ensure high bound is high enough so that dp < dp0
            while calculate_dp_for_d(x_high) > dp0 and x_high > 1e-3:
                x_high /= 2.0
                if x_high < 1e-5:
                    break
            
            # Ensure low bound is low enough so that dp > dp0
            while calculate_dp_for_d(x_low) < dp0 and x_low < 10.0:
                x_low *= 2.0
                if x_low > 10.0:
                    break
                
            for _ in range(100):
                mid = 0.5 * (x_low + x_high)
                val = calculate_dp_for_d(mid)
                if abs(val - dp0) < 1e-9 or abs(x_high - x_low) < 1e-12:
                    self.eq_diameter = mid
                    break
                # Since dp decreases as d increases:
                if val > dp0:
                    x_low = mid
                else:
                    x_high = mid
            else:
                self.eq_diameter = 0.5 * (x_low + x_high)
                
            # Keep eq_diameter within reasonable bounds
            self.eq_diameter = max(1e-4, min(10.0, self.eq_diameter))

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        self._ensure_calibrated()

        # Handle flow direction
        abs_q = abs(flow_rate)

        if self.restriction_model == "laminar":
            return self.k_lam * viscosity * flow_rate
            
        elif self.restriction_model == "quadratic":
            return self.k_quad * density * flow_rate * abs_q
            
        else: # orifice
            pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
            orif_d = max(0.0001, getattr(self, 'eq_diameter', 0.01))
            return FluidProperties.get_classic_orifice_dp(flow_rate, density, viscosity, pipe_d, orif_d)

    def calculate(self):
        self._ensure_calibrated()
        
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        # In reverse flow the fluid enters at the outlet port: the pressure drop uses its properties
        if inlet.flow_rate < 0:
            inlet.density = outlet.density
            inlet.viscosity = outlet.viscosity

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        # Throttling Heat: dT = abs(dP) / (rho * Cp)
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')

        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt

        # Density and viscosity of each port at its own temperature (the leaving port includes the throttling heat)
        for port in (inlet, outlet):
            port.density = FluidProperties.get_density(fluid_type, port.temperature)
            port.viscosity = FluidProperties.get_viscosity(fluid_type, port.temperature)

        return dp
