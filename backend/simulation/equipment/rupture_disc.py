from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class RuptureDisc(HydraulicNode):
    """
    Dedicated Rupture Disc (Burst Diaphragm) safety equipment node.
    Evaluates as intact at the start of each simulation run; if burst pressure is reached,
    it bursts open. Supports Full Bore (Cv-governed) vs Reduced Bore (Orifice-governed) flow math.
    """
    def __init__(
        self,
        name: str,
        burst_pressure_bar: float = 25.0,
        bore_type: str = "full_bore",
        cv: float = 10.0,
        pipe_diameter: float = 0.05248,
        orifice_diameter: float = 0.01,
        forced_state: str = "auto"
    ):
        super().__init__(name, node_type="rupture_disc")
        self.burst_pressure_bar = max(0.01, float(burst_pressure_bar))
        self.bore_type = bore_type if bore_type in ["full_bore", "reduced_bore"] else "full_bore"
        self.cv = max(0.001, float(cv))
        self.pipe_diameter = max(0.001, float(pipe_diameter))
        self.orifice_diameter = max(0.001, float(orifice_diameter))
        self.forced_state = forced_state if forced_state in ["auto", "forced_closed"] else "auto"

        # Runtime states
        self.is_burst = False
        self.capacity_utilization_pct = 0.0
        self.status = "intact"  # "intact", "burst", "overcapacity"

        self.add_inlet()
        self.add_outlet()

    def reset_run_state(self):
        """Resets transient run states (Rupture Disc evaluates as intact at start of each run)."""
        self.is_burst = False
        self.capacity_utilization_pct = 0.0
        self.status = "intact"

    def check_burst_status(self, p_inlet_bar: float) -> bool:
        """Determines if the diaphragm bursts open during this simulation run."""
        if self.forced_state == "forced_closed":
            self.status = "intact"
            return False

        if p_inlet_bar >= self.burst_pressure_bar or self.is_burst:
            self.is_burst = True
            self.status = "burst"
            return True
        else:
            self.status = "intact"
            return False

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001, p_in_pa: float = None) -> float:
        """Calculates pressure drop across the Rupture Disc."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        p_in_actual = p_in_pa if p_in_pa is not None else inlet.pressure
        p_in_bar = p_in_actual / 100000.0

        burst_open = self.check_burst_status(p_in_bar)

        if not burst_open:
            self.status = "intact"
            self.capacity_utilization_pct = 0.0
            R_CLOSED = 1.0e10
            return R_CLOSED * flow_rate

        # Diaphragm is burst open
        self.status = "burst"

        if self.bore_type == "reduced_bore":
            # Bernoulli Orifice Pressure Drop Math
            pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
            orif_d = max(0.0001, min(pipe_d * 0.99, self.orifice_diameter))
            beta_ratio = min(0.99, orif_d / pipe_d)

            area_pipe = math.pi * (pipe_d / 2.0)**2
            velocity = flow_rate / max(1e-9, area_pipe)
            dynamic_pressure = 0.5 * density * velocity * abs(velocity)

            area_orifice = math.pi * (orif_d / 2.0)**2
            v_orifice = flow_rate / max(1e-9, area_orifice)
            re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)

            discharge_coefficient = FluidProperties.get_orifice_cd(re_orifice)
            geometry_factor = (1.0 - beta_ratio**4) / (discharge_coefficient**2 * beta_ratio**4)
            rec_delta_p = dynamic_pressure * geometry_factor
            dp = rec_delta_p * (1.0 - beta_ratio**2)

            # Capacity utilization calculation based on maximum orifice choked capacity estimate
            choked_q_m3s = area_orifice * math.sqrt(max(1000.0, 100000.0) / max(10.0, density))
            choked_q_lmin = choked_q_m3s * 60000.0
            actual_q_lmin = abs(flow_rate) * 60000.0
            self.capacity_utilization_pct = min(999.0, (actual_q_lmin / max(0.01, choked_q_lmin)) * 100.0)

        else: # "full_bore"
            # Standard Cv Pressure Drop Math
            K_CV_SI = 1.732e9
            d_v = max(0.002, 0.01 * math.sqrt(self.cv))
            v_v = flow_rate / (0.25 * math.pi * d_v**2) if d_v > 0 else 0.0
            re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
            fr = FluidProperties.get_valve_fr(re_v)
            cv_adj = max(0.0001, self.cv * fr)

            dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_adj ** 2)

            rated_q_m3s = (self.cv * math.sqrt(100000.0 / (K_CV_SI * density))) if density > 0 else 1.0
            rated_q_lmin = rated_q_m3s * 60000.0
            actual_q_lmin = abs(flow_rate) * 60000.0
            self.capacity_utilization_pct = min(999.0, (actual_q_lmin / max(0.01, rated_q_lmin)) * 100.0)

        if self.capacity_utilization_pct > 100.0:
            self.status = "overcapacity"

        return dp

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        if self.status == "intact" or self.forced_state == "forced_closed":
            inlet.flow_rate = 0.0
            outlet.flow_rate = 0.0
            self.capacity_utilization_pct = 0.0

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
