from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

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
        
        self.flow_base_lmin = float(flow_base_lmin or 10.0)
        self.inlet_pressure_base_bar = float(inlet_pressure_base_bar or 3.5)
        self.outlet_pressure_base_bar = float(outlet_pressure_base_bar or 1.0)
        self.temp_base_c = float(temp_base_c or 45.0)
        self.restriction_model = restriction_model or "orifice"
        self.fluid_type = fluid_type or "system"
        
        # Will be auto-set by graph parser based on connection, default to DN50
        self.pipe_diameter = 0.05248
        
        self.add_inlet()
        self.add_outlet()
        
        # Calibrate coefficients
        self._calibrate()

    def _get_calibration_fluid(self) -> str:
        """Helper to resolve the fluid type at calibration time."""
        if self.fluid_type == "system" and self.global_settings:
            return getattr(self.global_settings, "fluid_type", "water")
        if self.fluid_type == "system":
            return "water"
        return self.fluid_type

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
                beta = min(0.99, d_val / pipe_d)
                area_pipe = math.pi * (pipe_d / 2.0)**2
                velocity = q0 / max(1e-9, area_pipe)
                dynamic_pressure = 0.5 * rho0 * velocity * abs(velocity)
                
                area_orifice = math.pi * (d_val / 2.0)**2
                v_orifice = q0 / max(1e-9, area_orifice)
                re_orifice = (rho0 * abs(v_orifice) * d_val) / max(1e-7, mu0)
                
                cd = FluidProperties.get_orifice_cd(re_orifice)
                geometry_factor = (1.0 - beta**4) / (cd**2 * beta**4)
                rec_delta_p = dynamic_pressure * geometry_factor
                perm_delta_p = rec_delta_p * (1.0 - beta**2)
                return perm_delta_p
            
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
        # Re-run calibration if settings have changed or were not initialized
        if self.restriction_model == "laminar" and not hasattr(self, 'k_lam'):
            self._calibrate()
        elif self.restriction_model == "quadratic" and not hasattr(self, 'k_quad'):
            self._calibrate()
        elif self.restriction_model == "orifice" and not hasattr(self, 'eq_diameter'):
            self._calibrate()

        # Handle flow direction
        sign_q = 1.0 if flow_rate >= 0 else -1.0
        abs_q = abs(flow_rate)

        if self.restriction_model == "laminar":
            return self.k_lam * viscosity * flow_rate
            
        elif self.restriction_model == "quadratic":
            return self.k_quad * density * flow_rate * abs_q
            
        else: # orifice
            pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
            orif_d = max(0.0001, getattr(self, 'eq_diameter', 0.01))
            beta_ratio = min(0.99, orif_d / pipe_d)

            # velocity of the pipe upstream of the orifice (v1 = Q / A1)
            area_pipe = math.pi * (pipe_d / 2.0)**2
            velocity = flow_rate / max(1e-9, area_pipe)

            # Dynamic Pressure term (0.5 * rho * v^2)
            dynamic_pressure = 0.5 * density * velocity * abs(velocity)

            # Orifice Reynolds number and dynamic Discharge Coefficient (C_d)
            area_orifice = math.pi * (orif_d / 2)**2
            v_orifice = flow_rate / max(1e-9, area_orifice)
            re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)
            
            discharge_coefficient = FluidProperties.get_orifice_cd(re_orifice)
            geometry_factor = (1.0 - beta_ratio**4) / (discharge_coefficient**2 * beta_ratio**4)
            
            rec_delta_p = dynamic_pressure * geometry_factor
            perm_delta_p = rec_delta_p * (1.0 - beta_ratio**2)

            return perm_delta_p

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        # Re-run calibration if needed
        if self.restriction_model == "laminar" and not hasattr(self, 'k_lam'):
            self._calibrate()
        elif self.restriction_model == "quadratic" and not hasattr(self, 'k_quad'):
            self._calibrate()
        elif self.restriction_model == "orifice" and not hasattr(self, 'eq_diameter'):
            self._calibrate()

        if self.restriction_model == "laminar":
            return self.k_lam * viscosity
            
        elif self.restriction_model == "quadratic":
            return 2.0 * self.k_quad * density * abs(flow_rate)
            
        else: # orifice
            pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
            orif_d = max(0.0001, getattr(self, 'eq_diameter', 0.01))
            beta_ratio = min(0.99, orif_d / pipe_d)
            area_pipe = math.pi * (pipe_d / 2.0)**2
            
            area_orifice = math.pi * (orif_d / 2.0)**2
            v_orifice = flow_rate / max(1e-9, area_orifice)
            re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)
            
            cd_turbulent = 0.60
            re_safe = max(1e-6, re_orifice)
            cd_val = cd_turbulent / math.sqrt(1.0 + 250.0 / re_safe)
            
            c_const = 0.5 * density / (area_pipe ** 2) * (1.0 - beta_ratio**4) / (beta_ratio**4) * (1.0 - beta_ratio**2)
            
            if cd_val <= 0.05:
                cd = 0.05
                return c_const / (cd**2) * 2.0 * abs(flow_rate)
            else:
                c_re_coeff = (density * (1.0 / area_orifice) * orif_d) / max(1e-7, viscosity)
                c_inv_q = 250.0 / c_re_coeff
                return c_const / 0.36 * (2.0 * abs(flow_rate) + c_inv_q)

    def calculate(self):
        # Trigger calibration just in case
        self._calibrate()
        
        inlet = self.inlets[0]
        outlet = self.outlets[0]

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

        self.calculate_temperature()
        return dp
