from simulation.equipment.relief_device import ReliefDevice, P_SCALE
from simulation.fluid_utils import FluidProperties
import math

K_CV_SI = 1.732e9


class PressureSafetyValve(ReliefDevice):
    """
    Pressure Safety Relief Valve (PSV / PRV) supporting Pop Action, Modulating,
    and Rupture Disc emergency relief modes with relief capacity tracking.

    Steady-state lift (F1-04):
    - modulating: closed below set pressure, lift linear to full lift at 10 % overpressure;
    - pop action: closed until the inlet reaches set pressure, then full lift. It stays open while the
      full-lift inlet pressure is at or above the reseat pressure set·(1 − blowdown). Below reseat the
      valve would cycle open/closed (oversized for the load): it is then solved like a modulating valve,
      which holds the inlet at about the set pressure, and reported as "cycling".
    """
    def __init__(
        self,
        name: str,
        set_pressure_barg: float = 20.0,
        cv: float = 10.0,
        action_mode: str = "pop_action",
        blowdown_pct: float = 7.0,
        forced_state: str = "auto"
    ):
        super().__init__(name, "pressure_safety_valve", set_pressure_barg, forced_state)
        self.cv = max(0.001, float(cv))
        self.action_mode = action_mode if action_mode in ["pop_action", "modulating", "rupture_disc"] else "pop_action"
        self.blowdown_pct = max(0.0, min(50.0, float(blowdown_pct)))

        # Held state, decided between hydraulic solves: "closed", "open" or "cycling" (pop action);
        # rupture-disc mode uses is_burst
        self.lift_state = "closed"
        self.is_burst = False
        self.status = "closed"  # "closed", "cracked", "cycling", "overcapacity"

    @property
    def reseat_pressure_barg(self) -> float:
        return self.set_pressure_barg * (1.0 - self.blowdown_pct / 100.0)

    def reset_run_state(self):
        """Every run starts with the valve closed (rupture-disc mode: intact)."""
        super().reset_run_state()
        self.lift_state = "closed"
        self.is_burst = False
        self.status = "closed"

    def lift_mode(self) -> str:
        if self.forced_state == "forced_closed":
            return "closed"
        if self.forced_state == "forced_open":
            return "full"
        if self.action_mode == "modulating":
            return "modulating"
        if self.action_mode == "rupture_disc":
            return "full" if self.is_burst else "closed"
        return {"closed": "closed", "open": "full", "cycling": "modulating"}[self.lift_state]

    def update_relief_state(self, p_in_pa: float) -> bool:
        if self.forced_state != "auto":
            return False
        if self.action_mode == "rupture_disc":
            if not self.is_burst and p_in_pa >= self.set_pressure_pa:
                self.is_burst = True
                return True
            return False
        if self.action_mode != "pop_action":
            return False
        if self.lift_state == "closed" and p_in_pa >= self.set_pressure_pa:
            self.lift_state = "open"
            return True
        if self.lift_state == "open" and p_in_pa < self.reseat_pressure_barg * P_SCALE + self.p_atm:
            self.lift_state = "cycling"
            return True
        return False

    def open_status(self) -> str:
        if self.action_mode == "pop_action" and self.forced_state == "auto" and self.lift_state == "cycling":
            return "cycling"
        return "cracked"

    def open_dp(self, flow_rate: float, density: float, viscosity: float) -> float:
        dp, _ = self.calculate_open_friction_and_deriv(flow_rate, density, viscosity)
        return dp

    def calculate_open_friction_and_deriv(self, flow_rate: float, density: float, viscosity: float = 0.001) -> tuple:
        """
        Computes safety valve open (full lift) friction pressure drop and its derivative.
        """
        d_v = max(0.002, 0.01 * math.sqrt(self.cv))
        v_v = flow_rate / (0.25 * math.pi * d_v**2) if d_v > 0 else 0.0
        re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
        fr = FluidProperties.get_valve_fr(re_v)
        cv_adj = max(0.001, self.cv * fr)

        dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_adj ** 2)
        deriv = (2.0 * K_CV_SI * density * abs(flow_rate)) / (cv_adj ** 2)
        return dp, deriv
