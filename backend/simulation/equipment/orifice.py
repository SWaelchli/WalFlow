from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

# Constants from the viscous-corrected Cd model: Cd = 0.6 / sqrt(1 + _CD_VISCOUS_RE_COEFF / Re_o)
_CD_VISCOUS_RE_COEFF = 250.0
_CD_TURBULENT_SQ = 0.36  # 0.6^2, turbulent discharge coefficient squared

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
    - `'classic_cd'`: legacy Reynolds-corrected discharge coefficient model (C_d from
      `FluidProperties.get_orifice_cd`), retained byte-for-byte.
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
        """ISO 5167-2:2022 §5.3.1 lower Reynolds validity limit (corner taps)."""
        return 5000.0 if beta <= 0.56 else 16000.0

    @classmethod
    def _cd_rg_iso5167(cls, beta: float, pipe_d: float, re_pipe: float) -> float:
        """
        Reader-Harris/Gallagher discharge coefficient C_d (ISO 5167-2:2022 Formula (4))
        for corner taps (L1 = L2' = 0).
        Returns C_d directly — NOT the meter coefficient C_m = C_d / sqrt(1 - beta^4).
        beta must be the clamped effective beta ratio (within [0.1, 0.75]).
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
        c_low = (0.6 / math.sqrt(1.0 + _CD_VISCOUS_RE_COEFF / re_o)) / math.sqrt(1.0 - beta_eff ** 4)
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
            beta_eff = min(0.75, max(0.1, beta))
        re_pipe = self._pipe_reynolds(flow_rate, density, viscosity, pipe_d)

        if self.standard == 'classic_cd':
            beta_legacy = min(0.99, beta)
            re_orifice = max(1e-6, re_pipe / beta_legacy)
            cd = FluidProperties.get_orifice_cd(re_orifice)
            return cd / math.sqrt(1.0 - beta_legacy ** 4)

        return self._c_meter_from_re(re_pipe, pipe_d, beta_eff)

    @staticmethod
    def _iso_permanent_loss_ratio(cd: float, beta: float) -> float:
        """
        Permanent pressure loss ratio r = delta_p_perm / delta_p_tap.
        ISO 5167-2:2022 §5.4 Formula (7).
        IMPORTANT: cd must be the discharge coefficient C_d, not the meter coefficient
        C_m = C_d / sqrt(1 - beta^4). Passing C_m here gives an incorrect loss ratio.
        """
        s = math.sqrt(1.0 - beta ** 4 * (1.0 - cd ** 2))
        return (s - cd * beta ** 2) / (s + cd * beta ** 2)

    @staticmethod
    def _iso_ratio_derivative_wrt_cd(cd: float, beta: float) -> float:
        """dr/dC_d for the ISO 5167-2:2022 §5.4 Formula (7) permanent loss ratio."""
        s = math.sqrt(1.0 - beta ** 4 * (1.0 - cd ** 2))
        den = s + cd * beta ** 2
        return -2.0 * beta ** 2 * (1.0 - beta ** 4) / (s * den * den)

    def _dc_dre(self, re_pipe: float, pipe_d: float, beta_eff: float) -> float:
        """
        dC/dRe_D of the closed-form effective meter coefficient.
        Central difference with relative step 1e-4 (absolute floor 1e-3),
        falling back to a forward difference when Re_D is below the step.
        """
        step = max(1e-4 * re_pipe, 1e-3)
        if re_pipe >= step:
            c_plus = self._c_meter_from_re(re_pipe + step, pipe_d, beta_eff)
            c_minus = self._c_meter_from_re(re_pipe - step, pipe_d, beta_eff)
            return (c_plus - c_minus) / (2.0 * step)
        c_plus = self._c_meter_from_re(re_pipe + step, pipe_d, beta_eff)
        c_zero = self._c_meter_from_re(re_pipe, pipe_d, beta_eff)
        return (c_plus - c_zero) / step

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
            # Legacy model: byte-for-byte previous behavior
            beta_ratio = min(0.99, beta_ratio)
            area_pipe = math.pi * (pipe_d / 2.0) ** 2
            velocity = flow_rate / max(1e-9, area_pipe)
            dynamic_pressure = 0.5 * density * velocity * abs(velocity)  # abs to preserve direction of flow for pressure drop sign

            area_orifice = math.pi * (orif_d / 2.0) ** 2
            v_orifice = flow_rate / max(1e-9, area_orifice)
            re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)

            discharge_coefficient = FluidProperties.get_orifice_cd(re_orifice)
            geometry_factor = (1 - beta_ratio ** 4) / (discharge_coefficient ** 2 * beta_ratio ** 4)
            rec_delta_p = dynamic_pressure * geometry_factor
            return rec_delta_p * (1 - beta_ratio ** 2)

        # ISO 5167 model
        beta_eff = min(0.75, max(0.1, beta_ratio))
        area_orifice = math.pi * (orif_d / 2.0) ** 2
        c_meter = self._effective_c_meter(flow_rate, density, viscosity, pipe_d, beta_eff)

        # 2. Tap differential pressure: dp_tap = 0.5*rho*Q^2*(1-beta^4) / (Ao^2 * Cd^2)
        #    Using C_m = Cd/sqrt(1-beta^4) in the denominator achieves the same result
        #    without an explicit (1-beta^4) factor (Framing B, internally consistent).
        tap_dp = 0.5 * density * flow_rate * abs(flow_rate) / (area_orifice ** 2 * c_meter ** 2)

        # 3. Permanent pressure loss (ISO 5167-2:2022 §5.4 Formula (7)).
        #    Formula (7) is defined in terms of C_d, not C_m. Recover C_d here.
        cd = c_meter * math.sqrt(1.0 - beta_eff ** 4)
        ratio = self._iso_permanent_loss_ratio(cd, beta_eff)
        return ratio * tap_dp

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = max(0.0001, self.orifice_diameter)
        beta_ratio = orif_d / pipe_d
        area_pipe = math.pi * (pipe_d / 2.0) ** 2
        area_orifice = math.pi * (orif_d / 2.0) ** 2
        mu = max(1e-7, viscosity)

        if self.standard == 'classic_cd':
            # Legacy model: byte-for-byte previous analytic derivative
            beta_ratio = min(0.99, beta_ratio)
            v_orifice = flow_rate / max(1e-9, area_orifice)
            re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)

            cd_turbulent = 0.60
            re_safe = max(1e-6, re_orifice)
            cd_val = cd_turbulent / math.sqrt(1.0 + 250.0 / re_safe)

            c_const = 0.5 * density / (area_pipe ** 2) * (1.0 - beta_ratio ** 4) / (beta_ratio ** 4) * (1.0 - beta_ratio ** 2)

            if cd_val <= 0.05:
                cd = 0.05
                return c_const / (cd ** 2) * 2.0 * abs(flow_rate)
            else:
                c_re_coeff = (density * (1.0 / area_orifice) * orif_d) / max(1e-7, viscosity)
                c_inv_q = 250.0 / c_re_coeff
                return c_const / 0.36 * (2.0 * abs(flow_rate) + c_inv_q)

        # ISO 5167 model: semi-analytic chain rule through the closed-form meter coefficient
        beta_eff = min(0.75, max(0.1, beta_ratio))
        c_meter = self._effective_c_meter(flow_rate, density, mu, pipe_d, beta_eff)
        # Recover C_d for Formula (7); C_m = C_d/sqrt(1-beta^4) so C_d = C_m*sqrt(1-beta^4)
        sqrt_one_minus_b4 = math.sqrt(1.0 - beta_eff ** 4)
        cd = c_meter * sqrt_one_minus_b4
        ratio = self._iso_permanent_loss_ratio(cd, beta_eff)
        tap_dp = 0.5 * density * flow_rate * abs(flow_rate) / (area_orifice ** 2 * c_meter ** 2)

        # Small-|q| laminar limit: C_m ~ sqrt(Re_o) so d(tap_dp)/dq tends to a positive constant
        if abs(flow_rate) < 1e-12:
            c_re = density * pipe_d / (area_pipe * mu)
            slope = (0.5 * density * (1.0 - beta_eff ** 4) * _CD_VISCOUS_RE_COEFF * beta_eff
                     / (area_orifice ** 2 * _CD_TURBULENT_SQ * c_re))
            return ratio * slope

        re_pipe = self._pipe_reynolds(flow_rate, density, mu, pipe_d)
        dc_m_dre = self._dc_dre(re_pipe, pipe_d, beta_eff)  # dC_m/dRe_D
        d_re_dq = density * pipe_d / (area_pipe * mu)
        sign = 1.0 if flow_rate >= 0 else -1.0
        dc_m_dq = dc_m_dre * d_re_dq * sign                 # dC_m/dq

        # d(tap_dp)/dq via quotient rule: tap_dp = k*q*|q| / C_m^2
        d_tap_dq = tap_dp * (2.0 / flow_rate - 2.0 * dc_m_dq / c_meter)

        # d(ratio)/dq via chain rule: ratio = r(C_d), C_d = C_m * sqrt(1-beta^4)
        #   dr/dq = dr/dCd * dCd/dq = dr/dCd * sqrt(1-beta^4) * dCm/dq
        dr_dcd = self._iso_ratio_derivative_wrt_cd(cd, beta_eff)
        dcd_dq = dc_m_dq * sqrt_one_minus_b4
        return ratio * d_tap_dq + tap_dp * dr_dcd * dcd_dq

    def calculate(self):

        """
        Updates the outlet port's state based on the inlet port's state and the calculated drop.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        # Calculate the pressure drop based on the current flow rate passing through
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        # Update the outlet conditions
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate  # Incompressible flow means Q_in = Q_out
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

        return dp
