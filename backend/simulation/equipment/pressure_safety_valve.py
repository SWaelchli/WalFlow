from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class PressureSafetyValve(HydraulicNode):
    """
    Pressure Safety Relief Valve (PSV / PRV) supporting Pop Action, Modulating,
    and Rupture Disc emergency relief modes with relief capacity tracking.
    """
    def __init__(
        self,
        name: str,
        set_pressure_bar: float = 20.0,
        cv: float = 10.0,
        action_mode: str = "pop_action",
        blowdown_pct: float = 7.0,
        forced_state: str = "auto"
    ):
        super().__init__(name, node_type="pressure_safety_valve")
        self.set_pressure_bar = max(0.01, float(set_pressure_bar))
        self.cv = max(0.001, float(cv))
        self.action_mode = action_mode if action_mode in ["pop_action", "modulating", "rupture_disc"] else "pop_action"
        self.blowdown_pct = max(0.0, min(50.0, float(blowdown_pct)))
        self.forced_state = forced_state if forced_state in ["auto", "forced_closed"] else "auto"

        # Runtime states
        self.is_burst = False
        self._was_open = False
        self.capacity_utilization_pct = 0.0
        self.status = "closed"  # "closed", "cracked", "overcapacity"

        self.add_inlet()
        self.add_outlet()

    def reset_run_state(self):
        """Resets transient run states (e.g. Rupture Disc resets to intact at start of run)."""
        self.is_burst = False
        self._was_open = False
        self.capacity_utilization_pct = 0.0
        self.status = "closed"

    def get_effective_cv(self, p_inlet_bar: float, p_outlet_bar: float = 0.0) -> float:
        """Calculates effective flow coefficient based on upstream pressure and action mode."""
        if self.forced_state == "forced_closed":
            self.status = "closed"
            return 1e-4

        dp_bar = max(0.0, p_inlet_bar - p_outlet_bar)

        if self.action_mode == "rupture_disc":
            if p_inlet_bar >= self.set_pressure_bar or self.is_burst:
                self.is_burst = True
                self.status = "cracked"
                return self.cv
            else:
                self.status = "closed"
                return 1e-4

        elif self.action_mode == "pop_action":
            if self._was_open or self.status in ["cracked", "overcapacity"]:
                self.status = "cracked"
                return self.cv
            if p_inlet_bar >= self.set_pressure_bar:
                self._was_open = True
                self.status = "cracked"
                return self.cv
            else:
                self._was_open = False
                self.status = "closed"
                return 1e-4

        elif self.action_mode == "modulating":
            overpressure_bar = p_inlet_bar - self.set_pressure_bar
            if overpressure_bar <= 0:
                self.status = "closed"
                return 1e-4
            else:
                # Full lift achieved at 10% overpressure above setpoint
                full_lift_overpressure = max(0.1, 0.10 * self.set_pressure_bar)
                lift_fraction = min(1.0, max(0.01, overpressure_bar / full_lift_overpressure))
                eff_cv = max(1e-4, self.cv * lift_fraction)
                self.status = "cracked"
                return eff_cv

        return 1e-4

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001, p_in_pa: float = None) -> float:
        """Calculates pressure drop across the PSV with viscosity correction."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        p_in_actual = p_in_pa if p_in_pa is not None else inlet.pressure
        p_in_bar = p_in_actual / 100000.0
        p_out_bar = outlet.pressure / 100000.0

        eff_cv = self.get_effective_cv(p_in_bar, p_out_bar)

        K_CV_SI = 1.732e9

        if self.status == "closed":
            # Closed PSV seat: smooth C1 linear resistance model
            self.capacity_utilization_pct = 0.0
            R_CLOSED = 1.0e10
            return R_CLOSED * flow_rate

        d_v = max(0.002, 0.01 * math.sqrt(eff_cv))
        v_v = flow_rate / (0.25 * math.pi * d_v**2) if d_v > 0 else 0.0
        re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
        fr = FluidProperties.get_valve_fr(re_v)
        cv_adj = max(0.001, eff_cv * fr)

        dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_adj ** 2)

        # Reverse flow check (PSV seat prevents backflow)
        if flow_rate < 0:
            dp = 1.0e10 * flow_rate

        # Calculate capacity utilization percentage
        # Rated volumetric flow capacity at set pressure diff (1 bar overpressure reference)
        rated_q_m3s = (self.cv * math.sqrt(100000.0 / (K_CV_SI * density))) if density > 0 else 1.0
        rated_q_lmin = rated_q_m3s * 60000.0
        actual_q_lmin = abs(flow_rate) * 60000.0

        if rated_q_lmin > 0:
            self.capacity_utilization_pct = min(999.0, (actual_q_lmin / rated_q_lmin) * 100.0)
        else:
            self.capacity_utilization_pct = 0.0

        if self.status == "cracked" and self.capacity_utilization_pct > 100.0:
            self.status = "overcapacity"

        return dp

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        if self.status == "closed" or self.forced_state == "forced_closed":
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
