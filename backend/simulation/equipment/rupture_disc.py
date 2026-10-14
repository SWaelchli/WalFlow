from simulation.equipment.relief_device import ReliefDevice
from simulation.fluid_utils import FluidProperties
import math


class RuptureDisc(ReliefDevice):
    """
    Dedicated Rupture Disc (Burst Diaphragm) safety equipment node.
    Evaluates as intact at the start of each simulation run; if the inlet gauge pressure reaches the burst
    pressure (barg) it bursts open and stays open for the run. Supports Full Bore (Cv-governed) vs
    Reduced Bore (Orifice-governed) flow math.
    """
    def __init__(
        self,
        name: str,
        burst_pressure_barg: float = 25.0,
        bore_type: str = "full_bore",
        cv: float = 10.0,
        pipe_diameter: float = 0.05248,
        orifice_diameter: float = 0.01,
        forced_state: str = "auto"
    ):
        super().__init__(name, "rupture_disc", burst_pressure_barg, forced_state)
        self.bore_type = bore_type if bore_type in ["full_bore", "reduced_bore"] else "full_bore"
        self.cv = max(0.001, float(cv))
        self.pipe_diameter = max(0.001, float(pipe_diameter))
        self.orifice_diameter = max(0.001, float(orifice_diameter))

        # Held state, decided between hydraulic solves
        self.is_burst = False
        self.status = "intact"  # "intact", "burst", "overcapacity"

    @property
    def burst_pressure_barg(self) -> float:
        return self.set_pressure_barg

    @burst_pressure_barg.setter
    def burst_pressure_barg(self, value: float):
        self.set_pressure_barg = max(0.01, float(value))

    def reset_run_state(self):
        """Resets transient run states (Rupture Disc evaluates as intact at start of each run)."""
        super().reset_run_state()
        self.is_burst = False
        self.status = "intact"

    def lift_mode(self) -> str:
        if self.forced_state == "forced_closed":
            return "closed"
        if self.forced_state == "forced_open" or self.is_burst:
            return "full"
        return "closed"

    def update_relief_state(self, p_in_pa: float) -> bool:
        if self.forced_state != "auto" or self.is_burst:
            return False
        if p_in_pa >= self.set_pressure_pa:
            self.is_burst = True
            return True
        return False

    def closed_status(self) -> str:
        return "intact"

    def open_status(self) -> str:
        return "burst"

    def open_dp(self, flow_rate: float, density: float, viscosity: float) -> float:
        dp, _ = self.calculate_open_friction_and_deriv(flow_rate, density, viscosity)
        return dp

    def calculate_open_friction_and_deriv(self, flow_rate: float, density: float, viscosity: float = 0.001) -> tuple:
        """Computes rupture disc open pressure drop and its analytical derivative w.r.t. flow rate."""
        if self.bore_type == "reduced_bore":
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

            # Derivative w.r.t. flow rate
            deriv = density * abs(velocity) / area_pipe * geometry_factor * (1.0 - beta_ratio**2)
            return dp, deriv
        else: # "full_bore"
            K_CV_SI = 1.732e9
            d_v = max(0.002, 0.01 * math.sqrt(self.cv))
            v_v = flow_rate / (0.25 * math.pi * d_v**2) if d_v > 0 else 0.0
            re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
            fr = FluidProperties.get_valve_fr(re_v)
            cv_adj = max(0.0001, self.cv * fr)

            dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_adj ** 2)
            deriv = (2.0 * K_CV_SI * density * abs(flow_rate)) / (cv_adj ** 2)
            return dp, deriv
