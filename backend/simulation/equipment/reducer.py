from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math


class Reducer(HydraulicNode):
    """
    A Reducer / Expander models an area transition in a piping network.
    It calculates:
    1. Irreversible form and friction losses (Crane TP 410 conical contraction/diffuser)
    2. Reversible Bernoulli static pressure change due to fluid acceleration/deceleration
    3. Viscous dissipation temperature rise from irreversible head loss
    """
    def __init__(
        self,
        name: str,
        diameter_in: float = 0.07792,    # Inlet internal diameter (m), default ~DN80 (3" STD)
        diameter_out: float = 0.05248,   # Outlet internal diameter (m), default ~DN50 (2" STD)
        length: float = 0.089,           # Transition length (m), default 89 mm for 3"x2"
        cone_angle_deg: float = 18.2,    # Transition included angle (degrees)
        reducer_type: str = "concentric",# "concentric" or "eccentric"
        standard: str = "ASME_B16_9",    # "ASME_B16_9" or "CUSTOM"
        dn_large: int = 80,
        dn_small: int = 50,
        sch_large: str = "STD",
        sch_small: str = "STD",
        roughness: float = 0.000045      # Absolute roughness (m)
    ):
        super().__init__(name, node_type="reducer")

        self.diameter_in = max(0.001, float(diameter_in or 0.07792))
        self.diameter_out = max(0.001, float(diameter_out or 0.05248))
        self.length = max(0.001, float(length or 0.089))
        self.cone_angle_deg = float(cone_angle_deg) if cone_angle_deg is not None else 18.2
        self.reducer_type = reducer_type or "concentric"
        self.standard = standard or "ASME_B16_9"
        self.dn_large = int(dn_large or 80)
        self.dn_small = int(dn_small or 50)
        self.sch_large = sch_large or "STD"
        self.sch_small = sch_small or "STD"
        self.roughness = float(roughness or 0.000045)

        # Precompute areas and invariant terms
        self._update_geometry()

        # One inlet and one outlet
        self.add_inlet()
        self.add_outlet()

    def _update_geometry(self):
        """Precomputes geometric areas and diameter ratios."""
        self.d1 = self.diameter_in
        self.d2 = self.diameter_out
        self.area_in = math.pi * (self.d1 / 2.0) ** 2
        self.area_out = math.pi * (self.d2 / 2.0) ** 2
        self.d_avg = (self.d1 + self.d2) / 2.0
        self.area_avg = math.pi * (self.d_avg / 2.0) ** 2

        # Auto-compute cone angle if not explicitly set or <= 0
        if self.cone_angle_deg <= 0 and self.length > 0:
            half_rad = math.atan(abs(self.d1 - self.d2) / (2.0 * self.length))
            self.cone_angle_deg = math.degrees(2.0 * half_rad)

    def _get_form_loss_k(self, flow_rate: float) -> tuple[float, float]:
        """
        Calculates the form loss coefficient K and returns (K, ref_area).
        Applies Crane TP 410 conical contraction / diffuser formulas.
        """
        theta_rad = math.radians(max(1.0, min(180.0, self.cone_angle_deg)))

        if flow_rate >= 0:
            # Flow from 1 (inlet) to 2 (outlet)
            if self.d1 > self.d2:
                # Contraction: smaller diameter is d2
                beta = self.d2 / self.d1
                if self.cone_angle_deg <= 45.0:
                    k = 0.5 * (1.0 - beta ** 2) * math.sqrt(math.sin(theta_rad / 2.0))
                else:
                    k = 0.8 * math.sin(theta_rad / 2.0) * (1.0 - beta ** 2)
                return k, self.area_out
            elif self.d1 < self.d2:
                # Expansion / Diffuser: smaller diameter is d1
                beta = self.d1 / self.d2
                if self.cone_angle_deg <= 45.0:
                    k = 2.6 * math.sin(theta_rad / 2.0) * ((1.0 - beta ** 2) ** 2)
                else:
                    k = 1.0 * ((1.0 - beta ** 2) ** 2)
                return k, self.area_in
            else:
                return 0.0, self.area_in
        else:
            # Reverse flow: from 2 (outlet) to 1 (inlet)
            if self.d1 > self.d2:
                # Reverse of contraction is an expansion (from d2 to d1, smaller is d2)
                beta = self.d2 / self.d1
                if self.cone_angle_deg <= 45.0:
                    k = 2.6 * math.sin(theta_rad / 2.0) * ((1.0 - beta ** 2) ** 2)
                else:
                    k = 1.0 * ((1.0 - beta ** 2) ** 2)
                return k, self.area_out
            elif self.d1 < self.d2:
                # Reverse of expansion is a contraction (from d2 to d1, smaller is d1)
                beta = self.d1 / self.d2
                if self.cone_angle_deg <= 45.0:
                    k = 0.5 * (1.0 - beta ** 2) * math.sqrt(math.sin(theta_rad / 2.0))
                else:
                    k = 0.8 * math.sin(theta_rad / 2.0) * (1.0 - beta ** 2)
                return k, self.area_in
            else:
                return 0.0, self.area_in

    def _get_friction_factor(self, flow_rate: float, density: float, viscosity: float) -> float:
        """Calculates Darcy friction factor over average diameter."""
        abs_v = abs(flow_rate) / self.area_avg
        mu = max(1e-7, viscosity)
        re = (density * abs_v * self.d_avg) / mu

        if re < 1.0:
            return 64.0
        elif re < 2000.0:
            return 64.0 / re
        elif re > 4000.0:
            eps_term = self.roughness / (3.7 * self.d_avg)
            return 0.25 / (math.log10(eps_term + 5.74 / (re ** 0.9))) ** 2
        else:
            # Smooth blend 2000..4000
            f_lam = 64.0 / re
            eps_term = self.roughness / (3.7 * self.d_avg)
            f_turb = 0.25 / (math.log10(eps_term + 5.74 / (re ** 0.9))) ** 2
            w = (re - 2000.0) / 2000.0
            return (1.0 - w) * f_lam + w * f_turb

    def calculate_losses(self, flow_rate: float, density: float, viscosity: float) -> tuple[float, float, float]:
        """
        Calculates (dp_loss, dp_bernoulli, dp_total).
        dp_total = P_in - P_out = dp_loss + dp_bernoulli.
        """
        self._update_geometry()
        k_form, ref_area = self._get_form_loss_k(flow_rate)
        f_fric = self._get_friction_factor(flow_rate, density, viscosity)
        k_fric = f_fric * (self.length / self.d_avg)

        # Dynamic heads
        q_sq_signed = flow_rate * abs(flow_rate)
        q_sq = flow_rate * flow_rate

        # Irreversible head losses (opposes flow direction, signed with Q|Q|)
        dp_form = k_form * 0.5 * density * (q_sq_signed / (ref_area ** 2))
        dp_fric = k_fric * 0.5 * density * (q_sq_signed / (self.area_avg ** 2))
        dp_loss = dp_form + dp_fric

        # Reversible Bernoulli dynamic pressure shift: (v2^2 - v1^2) / 2 * rho
        # Pure kinetic energy difference between port 2 and port 1
        dp_bernoulli = 0.5 * density * q_sq * ((1.0 / (self.area_out ** 2)) - (1.0 / (self.area_in ** 2)))

        dp_total = dp_loss + dp_bernoulli
        return dp_loss, dp_bernoulli, dp_total

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float) -> float:
        """
        Calculates total pressure drop P_in - P_out for the given flow rate.
        """
        _, _, dp_total = self.calculate_losses(flow_rate, density, viscosity)
        return dp_total

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float) -> float:
        """
        Analytical derivative d(Delta P) / dQ for rapid Newton-Raphson solver convergence.
        """
        self._update_geometry()
        k_form, ref_area = self._get_form_loss_k(flow_rate)
        f_fric = self._get_friction_factor(flow_rate, density, viscosity)
        k_fric = f_fric * (self.length / self.d_avg)

        abs_q = abs(flow_rate)

        c_form = k_form / (ref_area ** 2)
        c_fric = k_fric / (self.area_avg ** 2)
        c_bern = (1.0 / (self.area_out ** 2)) - (1.0 / (self.area_in ** 2))

        # d(dp_loss)/dQ = rho * |Q| * (c_form + c_fric)
        # d(dp_bern)/dQ = rho * Q * c_bern
        deriv_loss = density * abs_q * (c_form + c_fric)
        deriv_bern = density * flow_rate * c_bern
        deriv = deriv_loss + deriv_bern

        min_deriv = 100.0  # Pa / (m^3/s)
        if deriv < min_deriv:
            deriv = max(min_deriv, abs(deriv))

        return deriv


    def calculate(self):
        """Propagates pressure, flow, and thermal viscous dissipation to ports."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        dp_loss, dp_bern, dp_total = self.calculate_losses(inlet.flow_rate, inlet.density, inlet.viscosity)

        outlet.pressure = inlet.pressure - dp_total
        outlet.flow_rate = inlet.flow_rate

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            # Only irreversible head loss generates viscous heating
            dt = abs(dp_loss) / max(1.0, inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
            outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
            outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
            inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
            inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp_loss) / max(1.0, outlet.density * cp)
            inlet.temperature = outlet.temperature + dt
            inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
            inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
            outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
            outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)

        return dp_total
