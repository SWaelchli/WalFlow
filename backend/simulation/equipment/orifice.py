from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math


class Orifice(HydraulicNode):
    """
    An Orifice acts as a restriction in the hydraulic network. It calculates the permanent
    pressure loss caused by the area restriction.

    Two calculation standards are selectable via the `standard` parameter:
    - `'iso_5167'` (default): ISO 5167-1:2022 / ISO 5167-2:2022 orifice plates. Uses the
      Reader-Harris/Gallagher (RG) discharge coefficient C_d (ISO 5167-2:2022 Formula (4))
      for corner taps and the permanent pressure loss relation (ISO 5167-2:2022 §5.4
      Formula (7)). Formula (7) must be evaluated with the discharge coefficient C_d, NOT
      the meter coefficient C_m = C_d / sqrt(1 - beta^4). Internally, the blending logic
      works in C_m terms for the tap-dP denominator, and C_d is recovered just before
      Formula (7) is called.
      Below the Reynolds validity limit C_m is smoothly blended to a viscous extension so
      the Newton solver stays continuous down to zero flow.
    - `'classic_cd'`: Reynolds-corrected discharge coefficient model (C_d from
      `FluidProperties.get_orifice_cd`) with the Formula (7) loss ratio (`get_classic_orifice_dp`).
    """
    VALID_STANDARDS = ('iso_5167', 'classic_cd')

    def __init__(self, name: str, pipe_diameter: float = 0.05248, orifice_diameter: float = 0.01,
                 standard: str = 'iso_5167'):
        # Call the parent class constructor to set up the ID and lists
        super().__init__(name, node_type="orifice")
        
        self.pipe_diameter = max(0.001, float(pipe_diameter or 0.05248))
        self.orifice_diameter = max(0.0001, float(orifice_diameter or 0.01))
        self.standard = standard if standard in self.VALID_STANDARDS else 'iso_5167'
        
        # A orifice requires exactly one inlet and one outlet
        self.add_inlet()
        self.add_outlet()

    @staticmethod
    def _beta_eff(beta: float) -> float:
        """Beta used in the correlations: the true beta, only guarded against 0 and 1."""
        return min(0.99, max(0.01, beta))

    def iso_validity_issues(self, re_pipe: float = None) -> list:
        """Limits of ISO 5167-2 that the current geometry / operating point violates."""
        pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = self.orifice_diameter
        beta = orif_d / pipe_d
        issues = []
        if not 0.1 <= beta <= 0.75:
            issues.append(f"beta {beta:.2f} outside 0.1-0.75")
        if orif_d < 0.0125:
            issues.append(f"orifice d {orif_d * 1000:.1f} mm below 12.5 mm")
        if not 0.05 <= pipe_d <= 1.0:
            issues.append(f"pipe D {pipe_d * 1000:.0f} mm outside 50-1000 mm")
        if re_pipe is not None and re_pipe < self._re_valid(self._beta_eff(beta)):
            issues.append(f"Re_D {re_pipe:.0f} below {self._re_valid(self._beta_eff(beta)):.0f}")
        return issues

    @staticmethod
    def _smoothstep(t: float) -> float:
        """C^1 smoothstep, clamped to [0, 1]. 0 below the blend band, 1 above it."""
        t = max(0.0, min(1.0, t))
        return t * t * (3.0 - 2.0 * t)

    @staticmethod
    def _pipe_reynolds(flow_rate: float, density: float, viscosity: float, pipe_d: float) -> float:
        """Pipe Reynolds number Re_D = rho * |v_pipe| * D / mu (positive, incompressible)."""
        area_pipe = math.pi * (pipe_d / 2.0) ** 2
        mu = max(1e-7, viscosity)
        return density * abs(flow_rate) * pipe_d / (area_pipe * mu)

    @staticmethod
    def _re_valid(beta: float) -> float:
        """ISO 5167-2:2022 §5.3.1 lower Reynolds validity limit (corner taps), 16 000·β² above β 0.56."""
        return 5000.0 if beta <= 0.56 else 16000.0 * beta ** 2

    @classmethod
    def _cd_rg_iso5167(cls, beta: float, pipe_d: float, re_pipe: float) -> float:
        """
        Reader-Harris/Gallagher discharge coefficient C_d (ISO 5167-2:2022 Formula (4))
        for corner taps (L1 = L2' = 0).
        Returns C_d directly — NOT the meter coefficient C_m = C_d / sqrt(1 - beta^4).
        beta outside 0.1-0.75 is an extrapolation of the RG correlation (flagged by iso_validity_issues).
        """
        re_safe = max(1e-9, re_pipe)
        a = (19000.0 * beta / re_safe) ** 0.8

        c = 0.5961 \
            + 0.0261 * beta ** 2 \
            - 0.216 * beta ** 8 \
            + 0.000521 * (1e6 * beta / re_safe) ** 0.7 \
            + (0.0188 + 0.0063 * a) * beta ** 3.5 * (1e6 / re_safe) ** 0.3

        # Small-diameter correction term (only valid for D < 71.12 mm)
        if pipe_d < 0.07112:
            c += 0.011 * (0.75 - beta) * (2.8 - pipe_d / 0.0254)

        return c

    def _c_meter_from_re(self, re_pipe: float, pipe_d: float, beta_eff: float) -> float:
        """
        Blended meter coefficient C_m = C_d / sqrt(1 - beta^4) as a closed-form function
        of pipe Reynolds number.
        ISO model: C_d from RG (Formula (4)) converted to C_m and blended to a viscous
        extension below Re_valid for Newton-solver continuity. The blending is done in C_m
        space so that C_m is used directly in the tap-dP denominator. Callers must recover
        C_d = C_m * sqrt(1 - beta_eff^4) before passing to Formula (7).
        """
        re_valid = self._re_valid(beta_eff)
        re_lo = 0.4 * re_valid
        # _cd_rg_iso5167 returns C_d; convert to C_m = C_d / sqrt(1 - beta^4)
        cd_rg = self._cd_rg_iso5167(beta_eff, pipe_d, re_pipe)
        c_rg = cd_rg / math.sqrt(1.0 - beta_eff ** 4)
        re_o = max(1e-6, re_pipe / beta_eff)
        c_low = FluidProperties.get_orifice_cd(re_o) / math.sqrt(1.0 - beta_eff ** 4)
        w = self._smoothstep((re_pipe - re_lo) / (re_valid - re_lo))
        return (1.0 - w) * c_low + w * c_rg

    def _effective_c_meter(self, flow_rate: float, density: float, viscosity: float,
                           pipe_d: float = None, beta_eff: float = None) -> float:
        """
        Blended meter coefficient C_m for the configured standard.
        ISO: RG (converted to C_m) + viscous blend. classic_cd: legacy C_d / sqrt(1-beta^4).
        Accepts optional pre-computed pipe_d and beta_eff to avoid redundant lookups.
        """
        if pipe_d is None:
            pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = max(0.0001, self.orifice_diameter)
        beta = orif_d / pipe_d
        if beta_eff is None:
            beta_eff = self._beta_eff(beta)
        re_pipe = self._pipe_reynolds(flow_rate, density, viscosity, pipe_d)

        if self.standard == 'classic_cd':
            beta_legacy = min(0.99, beta)
            re_orifice = max(1e-6, re_pipe / beta_legacy)
            cd = FluidProperties.get_orifice_cd(re_orifice)
            return cd / math.sqrt(1.0 - beta_legacy ** 4)

        return self._c_meter_from_re(re_pipe, pipe_d, beta_eff)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Calculates the permanent pressure drop (network pressure loss).
        Automatically uses connected pipe diameter for beta ratio calculation.
        """
        pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = max(0.0001, self.orifice_diameter)

        # 1. Calculate beta ratio (b = d / D)
        beta_ratio = orif_d / pipe_d

        if self.standard == 'classic_cd':
            return FluidProperties.get_classic_orifice_dp(flow_rate, density, viscosity, pipe_d, orif_d)

        # ISO 5167 model
        beta_eff = self._beta_eff(beta_ratio)
        area_orifice = math.pi * (orif_d / 2.0) ** 2
        c_meter = self._effective_c_meter(flow_rate, density, viscosity, pipe_d, beta_eff)

        # 2. Tap differential pressure: dp_tap = 0.5*rho*Q^2*(1-beta^4) / (Ao^2 * Cd^2)
        #    Using C_m = Cd/sqrt(1-beta^4) in the denominator achieves the same result
        #    without an explicit (1-beta^4) factor (Framing B, internally consistent).
        tap_dp = 0.5 * density * flow_rate * abs(flow_rate) / (area_orifice ** 2 * c_meter ** 2)

        # 3. Permanent pressure loss (ISO 5167-2:2022 §5.4 Formula (7)).
        #    Formula (7) is defined in terms of C_d, not C_m. Recover C_d here.
        cd = c_meter * math.sqrt(1.0 - beta_eff ** 4)
        ratio = FluidProperties.get_orifice_permanent_loss_ratio(cd, beta_eff)
        return ratio * tap_dp

    def calculate(self):

        """
        Updates the outlet port's state based on the inlet port's state and the calculated drop.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        # In reverse flow the fluid enters at the outlet port: the pressure drop must use its properties,
        # not the (never populated) defaults of the inlet port.
        if inlet.flow_rate < 0:
            inlet.density = outlet.density
            inlet.viscosity = outlet.viscosity

        # Calculate the pressure drop based on the current flow rate passing through
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        # Update the outlet conditions
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate  # property pass only; the solver reports the solved outlet edge flow
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        # Throttling Heat: dT = abs(dP) / (rho * Cp)
        # Apply to the port where fluid is EXITING the node.
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')

        if inlet.flow_rate >= 0:
            # Forward flow: Inlet -> Outlet
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            # Reverse flow: Outlet -> Inlet
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt

        # Density and viscosity of each port at its own temperature (the leaving port includes the throttling heat)
        for port in (inlet, outlet):
            port.density = FluidProperties.get_density(fluid_type, port.temperature)
            port.viscosity = FluidProperties.get_viscosity(fluid_type, port.temperature)

        return dp
