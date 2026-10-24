import math
from scipy.optimize import brentq
from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
from simulation.equipment.check_valve import open_seat_dp

class CheckValveOrifice(HydraulicNode):
    """
    A check valve with an integrated bypass orifice.
    Allows restricted flow through the orifice in reverse or sub-cracking conditions.
    Allows parallel flow through both the main valve trim and orifice when open.
    """
    def __init__(
        self,
        name: str,
        cv: float = 10.0,
        cracking_pressure_bar: float = 0.05,
        pipe_diameter: float = 0.1,
        orifice_diameter: float = 0.01
    ):
        super().__init__(name, node_type="check_valve_orifice")
        self.cv = max(0.001, cv)
        self.cracking_pressure_bar = max(0.0, cracking_pressure_bar)
        self.pipe_diameter = max(0.001, pipe_diameter)
        self.orifice_diameter = max(0.0001, orifice_diameter)

        self.add_inlet()
        self.add_outlet()

    def _calculate_orifice_dp(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """Calculates pressure drop using Bernoulli orifice equation with Re-dependent Cd."""
        pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = max(0.0001, self.orifice_diameter)
        return FluidProperties.get_classic_orifice_dp(flow_rate, density, viscosity, pipe_d, orif_d)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Calculates total pressure drop across Check Valve w/ Orifice.
        Reverse flow, or forward flow whose orifice drop stays below the cracking pressure: all flow through the orifice.
        Above cracking: seat and orifice in parallel at one valve drop,
        Q = Q_ori(dP) + Q_seat(dP - P_crack), solved for the orifice share of the flow.
        """
        cracking_pa = self.cracking_pressure_bar * 100000.0
        dp_ori = self._calculate_orifice_dp(flow_rate, density, viscosity)
        # Seat shut; a non-finite state (diverged iterate) passes through as NaN for the solver to reject
        if not (flow_rate > 0 and dp_ori > cracking_pa and math.isfinite(density) and math.isfinite(viscosity)):
            return dp_ori

        # Orifice drop rises and seat drop falls with the orifice share q_o: one root on (0, Q)
        def mismatch(q_o):
            return (self._calculate_orifice_dp(q_o, density, viscosity) - cracking_pa
                    - open_seat_dp(self.cv, flow_rate - q_o, density, viscosity))

        # 1e-12 of the flow: far below the solver's finite-difference step, with a floor for denormal flows
        q_o = brentq(mismatch, 0.0, flow_rate, xtol=max(1e-12 * flow_rate, 1e-300), rtol=1e-12)
        return self._calculate_orifice_dp(q_o, density, viscosity)

    def calculate(self):
        """Updates outlet port conditions and thermal enthalpy balance."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

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

        # Dynamically update local properties based on temperature feedback
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
        inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)

        # Outlet temperature already includes the throttling heat; do not overwrite it
        return dp
