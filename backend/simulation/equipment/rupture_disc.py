from simulation.equipment.relief_device import ReliefDevice
from simulation.equipment.check_valve import open_seat_dp
from simulation.fluid_utils import FluidProperties


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

    def update_relief_state(self, p_in_pa=None, p_out_pa=None, p_sense_pa=None) -> bool:
        if self.forced_state != "auto" or self.is_burst:
            return False
        if self.opening_margin_pa(p_in_pa, p_out_pa, p_sense_pa) >= 0.0:
            self.is_burst = True
            return True
        return False

    def closed_status(self) -> str:
        return "intact"

    def open_status(self) -> str:
        return "burst"

    def open_dp(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """Burst disc pressure drop: orifice (reduced bore) or Cv (full bore)."""
        if self.bore_type == "reduced_bore":
            pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
            orif_d = max(0.0001, min(pipe_d * 0.99, self.orifice_diameter))
            return FluidProperties.get_classic_orifice_dp(flow_rate, density, viscosity, pipe_d, orif_d)
        # "full_bore": the Cv seat of the check valve
        return open_seat_dp(self.cv, flow_rate, density, viscosity)
