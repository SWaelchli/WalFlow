from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class HeatExchanger(HydraulicNode):
    """
    Improved Heat Exchanger using a Design Duty Point.
    Calculates dynamic heat transfer based on flow and temperature difference.

    Physics:
    - Q = UA * (T_fluid_avg - T_medium)
    - UA scales with flow rate: UA = UA_rated * (Q_actual / Q_rated)^0.8
    """
    def __init__(self, name: str,
                 rated_cooling_kw: float = 300.0,
                 rated_flow_lmin: float = 500.0,
                 design_inlet_temp_c: float = 50.0,
                 medium_temp_c: float = 10.0,
                 rated_dp_bar: float = 0.5,
                 heat_duty: float = None,
                 cooler_type: str = "water_cooled",
                 pressure_drop_factor: float = None,
                 rating_method: str = "rated_duty",
                 design_outlet_temp_c: float = 40.0,
                 ua_direct_w_k: float = 1000.0):

        super().__init__(name, node_type="heat_exchanger")

        if heat_duty is not None:
            # Handle legacy heat_duty (in Watts)
            rated_cooling_kw = abs(heat_duty) / 1000.0

        # Design Parameters
        self.rated_cooling_kw = rated_cooling_kw
        self.rated_flow_lmin = rated_flow_lmin
        self.design_inlet_temp_c = design_inlet_temp_c
        self.medium_temp_c = medium_temp_c
        self.cooler_type = cooler_type      # "water_cooled" or "air_cooled"
        self.rated_dp_bar = rated_dp_bar
        self.rating_method = rating_method  # "rated_duty", "design_temps", "ua_direct"
        self.design_outlet_temp_c = design_outlet_temp_c
        self.ua_direct_w_k = ua_direct_w_k

        # Explicit resistance override [Pa/(m3/s)^2 at 1000 kg/m3]; None = calibrate from the rated dP (D-03)
        self.pressure_drop_factor = pressure_drop_factor
        self._rating_cache = {}

        # Internal State
        self.actual_duty_kw = 0.0
        # F1-40: design effectiveness of the rating and the resulting feasibility status
        self.design_effectiveness = None
        self.rating_status = "ok"   # "ok" | "high_effectiveness" (> 0.95) | "infeasible" (>= 1)

        self.add_inlet()
        self.add_outlet()

    def _calculate_ua_from_temps(self, t_in, t_out, tm, m_dot, cp):
        if abs(t_in - tm) <= 1e-5:
            return 0.0
        # For a single-phase utility medium with infinite capacity (C_max = inf):
        # effectiveness = (t_in - t_out) / (t_in - tm)
        effectiveness = (t_in - t_out) / (t_in - tm)
        self.design_effectiveness = effectiveness
        self.rating_status = "infeasible" if effectiveness >= 1.0 else ("high_effectiveness" if effectiveness > 0.95 else "ok")
        # Bounded between 0 and 1
        effectiveness = max(1e-5, min(0.999, effectiveness))
        ntu = -math.log(1.0 - effectiveness)
        return ntu * m_dot * cp

    def _fluid_type(self):
        return getattr(self.global_settings, 'fluid_type', 'water')

    def _design_state(self):
        """Density, viscosity and cp of the system fluid at the design inlet temperature (D-03)."""
        fluid_type = self._fluid_type()
        t = self.design_inlet_temp_c + 273.15
        return (FluidProperties.get_density(fluid_type, t), FluidProperties.get_viscosity(fluid_type, t),
                FluidProperties.get_specific_heat(fluid_type, t))

    def _cached(self, name, compute):
        """The rating depends only on the inputs; recompute when one of them changes."""
        key = (name, self._fluid_type(), self.rating_method, self.rated_cooling_kw, self.rated_flow_lmin,
               self.design_inlet_temp_c, self.design_outlet_temp_c, self.medium_temp_c, self.cooler_type,
               self.ua_direct_w_k, self.rated_dp_bar, self.pressure_drop_factor)
        if key not in self._rating_cache:
            self._rating_cache[key] = compute()
        return self._rating_cache[key]

    def _channel_area(self):
        return max(1e-4, (self.rated_flow_lmin / 60000.0) / 2.0)

    def _reynolds(self, flow, density, viscosity):
        d_hx = 0.01  # ~10mm tube/channel characteristic dimension
        return (density * abs(flow / self._channel_area()) * d_hx) / max(1e-7, viscosity)

    def _resistance_k(self):
        """K in dP = K * rho * Q|Q| * f(Re), calibrated so that the rated dP is reproduced at the
        rated flow in the system fluid at the design inlet temperature (D-03, as the filter in F1-19)."""
        if self.pressure_drop_factor is not None:
            return self.pressure_drop_factor / 1000.0

        def compute():
            q_rated = self.rated_flow_lmin / 60000.0
            if q_rated <= 0.0:
                return 0.0
            rho_ref, mu_ref, _ = self._design_state()
            f_ref = FluidProperties.get_filter_viscosity_factor(self._reynolds(q_rated, rho_ref, mu_ref))
            return (self.rated_dp_bar * 1e5) / (rho_ref * q_rated ** 2 * f_ref)
        return self._cached('k', compute)

    def _ua_rated(self):
        """Rated UA, with density and cp at the design inlet temperature (D-03)."""
        return self._cached('ua', lambda: self._calculate_ua_rated(self._design_state()[2]))

    def _calculate_ua_rated(self, cp: float):
        """
        Estimates the UA (Heat Transfer Coefficient * Area) from design point depending on the rating method.
        """
        rating_method = getattr(self, 'rating_method', 'rated_duty')

        # Determine medium temperature tm_rated for UA sizing calculations
        if getattr(self, 'cooler_type', 'water_cooled') == 'air_cooled':
            tm_rated = 20.0 + 273.15 # Design ambient standard
        else:
            tm_rated = self.medium_temp_c + 273.15

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        design_temp_k = self.design_inlet_temp_c + 273.15
        density_design = FluidProperties.get_density(fluid_type, design_temp_k)

        m_dot_rated = (self.rated_flow_lmin / 60000.0) * density_design
        if m_dot_rated <= 0.0:
            return 0.0

        if rating_method == 'ua_direct':
            # Option C: Direct UA (W/K)
            return getattr(self, 'ua_direct_w_k', 1000.0)

        elif rating_method == 'design_temps':
            # Option A: Sizing from Design Temperatures (exact e-NTU inversion)
            t_in = self.design_inlet_temp_c + 273.15
            t_out = self.design_outlet_temp_c + 273.15
            return self._calculate_ua_from_temps(t_in, t_out, tm_rated, m_dot_rated, cp)

        else: # 'rated_duty'
            # Option B: Rated Sizing Duty (exact e-NTU inversion)
            q_rated_si = self.rated_cooling_kw * 1000.0
            t_in = self.design_inlet_temp_c + 273.15
            t_out = t_in - (q_rated_si / (m_dot_rated * cp))
            return self._calculate_ua_from_temps(t_in, t_out, tm_rated, m_dot_rated, cp)

    def calculate_delta_p(self, flow: float, density: float, viscosity: float) -> float:
        # Scale friction for heat exchanger tubes/channels at low Re
        visc_factor = FluidProperties.get_filter_viscosity_factor(self._reynolds(flow, density, viscosity))
        return self._resistance_k() * density * flow * abs(flow) * visc_factor

    def calculate_temperature(self):
        """
        Calculates the actual cooling duty and resulting outlet temperature.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        # The stream enters at the inlet port in forward flow and at the outlet port in reverse flow (D-02)
        entering, leaving = (inlet, outlet) if inlet.flow_rate >= 0 else (outlet, inlet)

        if abs(inlet.flow_rate) < 1e-12 or not getattr(self, 'active', True):
            leaving.temperature = entering.temperature
            self.actual_duty_kw = 0.0
            return

        # Get fluid properties
        cp = FluidProperties.get_specific_heat(self._fluid_type(), entering.temperature)
        m_dot = abs(inlet.flow_rate) * entering.density

        # 1. Get Base UA from design point
        ua_rated = self._ua_rated()

        # 2. Scale UA with flow (Reynolds dependency)
        flow_ratio = abs(inlet.flow_rate) / (self.rated_flow_lmin / 60000.0)

        cooler_type = getattr(self, 'cooler_type', 'water_cooled')
        if cooler_type == 'air_cooled':
            ua_actual = ua_rated * (flow_ratio ** 0.6)
            # Use global settings ambient temperature for air-cooled
            if self.global_settings:
                tm = getattr(self.global_settings, 'ambient_temperature', 293.15)
            else:
                tm = 293.15
        else:
            ua_actual = ua_rated * (flow_ratio ** 0.8)
            tm = self.medium_temp_c + 273.15

        ti = entering.temperature

        # 3. Solve for Outlet Temperature using e-NTU method (bi-directional cooling/heating)
        ntu = ua_actual / (m_dot * cp) if (m_dot * cp) > 0.0 else 0.0

        # Effectiveness for phase change/constant utility temp (C_max = inf)
        if ntu > 50.0:
            to = tm
        else:
            effectiveness = 1.0 - math.exp(-ntu)
            to = ti - effectiveness * (ti - tm)

        self.actual_duty_kw = (m_dot * cp * (ti - to)) / 1000.0
        leaving.temperature = to

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        outlet.flow_rate = inlet.flow_rate
        outlet.pressure = inlet.pressure - self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')

        # Dynamically update local properties based on temperature feedback
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
        inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)

        return outlet.pressure
