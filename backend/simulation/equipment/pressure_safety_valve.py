from simulation.equipment.relief_device import ReliefDevice, P_SCALE
from simulation.fluid_utils import FluidProperties
import math

K_CV_SI = 1.732e9
FULL_LIFT_PCT = 99.9          # lift reported as full ("open") from here; below it the valve is modulating
CYCLING_BAND = 0.01           # cycling stand-in: lift band as a fraction of set, so the average holds the driver at set


VALVE_TYPES = ("conventional", "balanced_bellows", "pilot")
ACTION_MODES = ("pop_action", "pop_latching", "modulating")
ACTION_MODE_ALIASES = {"rupture_disc": "pop_latching"}   # files before the latching mode was named


class PressureSafetyValve(ReliefDevice):
    """
    Pressure Safety Relief Valve (PSV / PRV): pop action (reseating), pop action latching or modulating,
    as a conventional, balanced bellows or pilot-operated valve, with relief capacity tracking.

    Opening driver and threshold by valve type:
    - conventional: P_in - P_out against the cold differential test pressure CDTP = set - design superimposed
      backpressure, so a backpressure other than the design value shifts the opening;
    - balanced bellows: inlet gauge pressure against the set pressure (independent of backpressure);
    - pilot: gauge pressure at the pilot sensing point (own inlet without a sensing line) against the set pressure.

    Steady-state lift (F1-04):
    - modulating: closed below the threshold, lift linear to full lift at 10 % overpressure;
    - pop action: closed until the driver reaches the threshold, then full lift. It stays open while the
      full-lift driver is at or above the reseat threshold·(1 − blowdown). Below reseat the valve would cycle
      open/closed (oversized for the load): it is then solved like a modulating valve with a narrow band, which
      holds the driver at the threshold and gives the average relief load, and reported as "cycling" with the
      inlet range reseat → set;
    - pop latching: opens at the threshold and stays at full lift for the run (no reseat).
    """
    def __init__(
        self,
        name: str,
        set_pressure_barg: float = 20.0,
        cv: float = 10.0,
        action_mode: str = "pop_action",
        blowdown_pct: float = 7.0,
        forced_state: str = "auto",
        valve_type: str = "conventional",
        design_superimposed_bp_barg: float = 0.0
    ):
        super().__init__(name, "pressure_safety_valve", set_pressure_barg, forced_state)
        self.cv = max(0.001, float(cv))
        action_mode = ACTION_MODE_ALIASES.get(action_mode, action_mode)
        self.action_mode = action_mode if action_mode in ACTION_MODES else "pop_action"
        self.blowdown_pct = max(0.0, min(50.0, float(blowdown_pct)))
        self.valve_type = valve_type if valve_type in VALVE_TYPES else "conventional"
        self.design_superimposed_bp_barg = max(0.0, float(design_superimposed_bp_barg or 0.0))

        # Pilot sensing line, set by the graph parser from a signal edge: (node, "inlet"|"outlet", port index)
        self.remote_sensing_config = None
        self.pilot_source = None
        # Set by the solver: False when the sensing point is left out of the solve (the pilot then senses its inlet)
        self.pilot_in_solve = True

        # Held state, decided between hydraulic solves: "closed", "open" or "cycling" (pop action);
        # pop latching uses is_burst
        self.lift_state = "closed"
        self.is_burst = False
        self.status = "closed"  # "closed", "modulating", "open", "cycling", "overcapacity"
        self.cycle_low_barg = None
        self.cycle_high_barg = None

    @property
    def opening_pressure_barg(self) -> float:
        """Inlet gauge pressure at which the valve opens, at the current outlet and pilot pressures."""
        return (self.threshold_pa + self._inlet_offset_pa()) / P_SCALE

    @property
    def reseat_pressure_barg(self) -> float:
        """Inlet gauge pressure at which a pop valve reseats, at the current outlet and pilot pressures."""
        return (self.reseat_threshold_pa + self._inlet_offset_pa()) / P_SCALE

    def _inlet_offset_pa(self, p_in_pa=None, p_out_pa=None, p_sense_pa=None) -> float:
        """Inlet gauge pressure less the opening driver (the outlet gauge pressure for a conventional valve)."""
        p_in, p_out, p_sense = self.port_pressures(p_in_pa, p_out_pa, p_sense_pa)
        return (p_in - self.p_atm) - self.driver_pa(p_in, p_out, p_sense)

    # --- opening driver by valve type ------------------------------------------------------------
    @property
    def has_remote_pilot(self) -> bool:
        return self.valve_type == "pilot" and self.pilot_source is not None and self.pilot_in_solve

    @property
    def opening_depends_on_outlet(self) -> bool:
        return self.valve_type == "conventional"

    @property
    def cdtp_barg(self) -> float:
        """Spring setting of a conventional valve: set pressure less the design superimposed backpressure."""
        return max(0.01, self.set_pressure_barg - self.design_superimposed_bp_barg)

    @property
    def threshold_pa(self) -> float:
        if self.valve_type == "conventional":
            return self.cdtp_barg * P_SCALE
        return self.set_pressure_barg * P_SCALE

    @property
    def reseat_threshold_pa(self) -> float:
        return self.threshold_pa * (1.0 - self.blowdown_pct / 100.0)

    def driver_pa(self, p_in_pa: float, p_out_pa: float, p_sense_pa: float) -> float:
        if self.valve_type == "conventional":
            return p_in_pa - p_out_pa
        if self.valve_type == "pilot":
            return p_sense_pa - self.p_atm
        return p_in_pa - self.p_atm

    def sensed_port_pressure(self, p_in_pa: float) -> float:
        if not self.has_remote_pilot:
            return p_in_pa
        node, port_type, idx = self.pilot_source
        ports = node.inlets if port_type == "inlet" else node.outlets
        return ports[idx].pressure if idx < len(ports) else p_in_pa

    def inlet_opening_pressure_pa(self):
        if self.has_remote_pilot:
            return None
        if self.valve_type == "conventional":
            return self.outlets[0].pressure + self.threshold_pa
        return self.set_pressure_pa

    # --- held state ------------------------------------------------------------------------------
    def reset_run_state(self):
        """Every run starts with the valve closed."""
        super().reset_run_state()
        self.lift_state = "closed"
        self.is_burst = False
        self.status = "closed"
        self.cycle_low_barg = None
        self.cycle_high_barg = None

    def lift_mode(self) -> str:
        if self.forced_state == "forced_closed":
            return "closed"
        if self.forced_state == "forced_open":
            return "full"
        if self.action_mode == "modulating":
            return "modulating"
        if self.action_mode == "pop_latching":
            return "full" if self.is_burst else "closed"
        return {"closed": "closed", "open": "full", "cycling": "modulating"}[self.lift_state]

    def update_relief_state(self, p_in_pa=None, p_out_pa=None, p_sense_pa=None) -> bool:
        if self.forced_state != "auto":
            return False
        driver = self.driver_pa(*self.port_pressures(p_in_pa, p_out_pa, p_sense_pa))
        if self.action_mode == "pop_latching":
            if not self.is_burst and driver >= self.threshold_pa:
                self.is_burst = True
                return True
            return False
        if self.action_mode != "pop_action":
            return False
        if self.lift_state == "closed" and driver >= self.threshold_pa:
            self.lift_state = "open"
            return True
        if self.lift_state == "open" and driver < self.reseat_threshold_pa:
            self.lift_state = "cycling"
            return True
        return False

    def modulating_band_pa(self) -> float:
        if self.is_cycling():
            # A cycling valve opens at set and closes at reseat: on average its inlet stays in that range,
            # so the stand-in for the average holds the driver just at the threshold
            return max(1000.0, CYCLING_BAND * self.set_pressure_barg * P_SCALE)
        return super().modulating_band_pa()

    def is_cycling(self) -> bool:
        return self.action_mode == "pop_action" and self.forced_state == "auto" and self.lift_state == "cycling"

    def open_status(self) -> str:
        if self.is_cycling():
            return "cycling"
        return "open" if self.lift_pct >= FULL_LIFT_PCT else "modulating"

    def report(self, flow_rate, density, viscosity, p_in_pa, p_out_pa, p_sense_pa=None):
        super().report(flow_rate, density, viscosity, p_in_pa, p_out_pa, p_sense_pa)
        self.cycle_low_barg = self.cycle_high_barg = None
        if self.status != "cycling":
            return
        # The average state holds the driver near the threshold; the inlet cycles between the pressures at
        # which the driver reaches the reseat and the opening threshold (inlet-to-driver offset held)
        offset = self._inlet_offset_pa(p_in_pa, p_out_pa, p_sense_pa)
        self.cycle_low_barg = (self.reseat_threshold_pa + offset) / P_SCALE
        self.cycle_high_barg = (self.threshold_pa + offset) / P_SCALE
        self.lift_pct = None   # the averaged lift is not a valve position

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
