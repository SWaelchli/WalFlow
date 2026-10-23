from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class RemoteControlValve(HydraulicNode):
    """
    A Control Valve that maintains a set point at a REMOTE location.
    Its opening_pct is adjusted by the solver to reach the target pressure
    at the connected SensingNode.
    """
    def __init__(self, name: str, max_cv: float, set_pressure: float = 500000.0, backpressure: bool = False,
                 fl: float = 0.9, fd: float = 0.46):
        super().__init__(name, node_type="remote_control_valve")
        self.max_cv = max_cv
        self.set_pressure = set_pressure
        self.backpressure = backpressure
        # IEC 60534-2-1 Table D.2 style factors; default globe single port, contoured plug, flow to open
        self.fl = fl
        self.fd = fd
        # Valve size for F_R, set by the graph parser from the connected pipe; default DN50
        self.pipe_diameter = 0.05248

        # Configuration for remote sensing: {"node_id": str, "port_type": "inlet"|"outlet", "port_idx": int}
        self.remote_sensing_config = None
        
        # Current physical opening (adjusted by solver)
        self.opening_pct = 100.0
        self.locked_up = False  # closed PRV holding its setpoint downstream (F1-37), set by the solver
        self.sensed_pressure = 0.0
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001,
                          opening_pct: float | None = None) -> float:
        """Standard Cv-based dP at the current opening_pct (or the given one) with the IEC 60534-2-1 Annex A F_R."""
        if opening_pct is None:
            opening_pct = self.opening_pct
        # Clamp opening to physical limits
        eff_opening = max(0.001, min(100.0, opening_pct)) / 100.0
        cv_eff = self.max_cv * eff_opening

        # Reynolds number factor, IEC 60534-2-1 Annex A (D-29)
        fr = FluidProperties.get_iec_valve_fr(flow_rate, viscosity / density, cv_eff, self.max_cv,
                                              self.fl, self.fd, self.pipe_diameter)
        cv_eff_adj = max(1e-10, cv_eff * fr)  # F_R is floored; keeps laminar Δp linear in Q (D-29)
        
        K_CV_SI = 1.732e9
        dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_eff_adj**2)
        
        return dp

    def calculate(self):

        inlet = self.inlets[0]
        outlet = self.outlets[0]
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        
        # Throttling Heat: dT = abs(dP) / (rho * Cp)
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
        
        # Outlet temperature already includes the throttling heat (F1-16); do not overwrite it
        return dp
