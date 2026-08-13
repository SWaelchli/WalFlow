from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class FluidSource(HydraulicNode):
    """
    Universal Fluid Source — a compact, mode-switchable boundary condition.

    Supports two operating modes, selectable via `source_type`:

    **Pressure Mode** (`source_type = "pressure"`)
        Acts as a Dirichlet pressure boundary: all ports are clamped to
        `source_pressure` (Pa). Flow direction and magnitude are determined
        by the rest of the network. Equivalent archetype: Pressure Boundary.

    **Flow Mode** (`source_type = "flow"`)
        Enforces a fixed volumetric flow rate using a high-stiffness spring
        formulation:  dP = stiffness × (Q_target − Q)
        Positive `source_flow` → net flow from inlet to outlet (supply).
        Negative `source_flow` → net flow from outlet to inlet (return/sink).

    Ports
    -----
    inlet-0  : left handle  (target handle in ReactFlow)
    outlet-0 : right handle (source handle in ReactFlow)

    Parameters (all stored in SI units internally)
    ------
    source_type     : str   — "pressure" | "flow"
    source_pressure : float — target pressure [Pa]  (set from bara in parser)
    source_flow     : float — target flow [m³/s]    (set from L/min in parser)
    temperature     : float — injected fluid temperature [K]
    """

    # Stiffness constant for flow-mode spring curve.
    # 10 MPa per 1% of rated flow deviation  — identical strategy to VolumetricPump.
    _BASE_STIFFNESS_PA_PER_M3S = 1e10     # Pa/(m³/s): steep but finite for Newton convergence
    _HARD_CAP_PA = 20_000_000.0           # 200 bar physical upper bound

    def __init__(
        self,
        name: str,
        source_type: str = "pressure",
        source_pressure: float = 600_000.0,   # 6 bara default
        source_flow: float = 8.333e-4,        # 50 L/min default
        temperature: float = 293.15,          # 20 °C default
    ):
        super().__init__(name, node_type="fluid_source")

        self.source_type = source_type        # "pressure" or "flow"
        self.source_pressure = float(source_pressure)   # Pa
        self.source_flow = float(source_flow)           # m³/s
        self.temperature = float(temperature)           # K

        # Solver flags: pressure mode → Dirichlet boundary; flow mode → spring curve
        self.is_pressure_boundary = (self.source_type == "pressure")
        self.is_flow_boundary = False         # Spring approach; NOT a hard topology constraint
        self.blocks_flow_on_shutdown = False

        # 1 inlet + 1 outlet (bidirectional, like Tank)
        self.add_inlet()
        self.add_outlet()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_fluid_type(self) -> str:
        """Returns the active fluid type from global settings or falls back to water."""
        return getattr(self.global_settings, 'fluid_type', 'water')

    def _set_port_fluid_properties(self, port, temp_k: float) -> None:
        """Stamps temperature and fluid properties on a port."""
        fluid_type = self._get_fluid_type()
        port.temperature = temp_k
        port.density = FluidProperties.get_density(fluid_type, temp_k)
        port.viscosity = FluidProperties.get_viscosity(fluid_type, temp_k)

    # ------------------------------------------------------------------
    # Pressure-mode boundary
    # ------------------------------------------------------------------

    def _apply_pressure_boundary(self) -> None:
        """
        Pressure Mode: clamp all ports to the set pressure (Dirichlet BC).
        The solver will compute the resulting flow through the network.
        """
        for port in self.inlets + self.outlets:
            port.pressure = self.source_pressure
            self._set_port_fluid_properties(port, self.temperature)

    # ------------------------------------------------------------------
    # Flow-mode spring formulation (used by Newton-Raphson solver)
    # ------------------------------------------------------------------

    def _compute_stiffness(self) -> float:
        """
        Derive stiffness from rated flow: 10 MPa per 1% of target deviation.
        Falls back to _BASE_STIFFNESS when source_flow ≈ 0.
        """
        q_ref = abs(self.source_flow)
        if q_ref > 1e-9:
            return 10_000_000.0 / (0.01 * q_ref)
        return self._BASE_STIFFNESS_PA_PER_M3S

    def calculate_delta_p(
        self,
        flow_rate: float,
        density: float,
        viscosity: float = 0.001
    ) -> float:
        """
        Returns ΔP [Pa] across the FluidSource node as seen by the solver.

        **Sign convention**: The solver computes `p_out = p_in - ΔP`.
        Therefore:
         - To ADD pressure (supply mode, Q < Q_target): return negative ΔP.
         - To REMOVE pressure (over-supply resistance, Q > Q_target): return positive ΔP.

        Formula: ΔP = stiffness × (Q_actual − Q_target)
         * Q < Q_target → ΔP < 0 → p_out > p_in  (source pushes fluid forward)
         * Q > Q_target → ΔP > 0 → p_out < p_in  (source resists excess flow)

        Pressure Mode
        -------------
        The solver never calls this — the node is a pressure boundary.
        Returns 0 as safe fallback.

        Flow Mode
        ---------
        Linear spring: ΔP = stiffness × (Q − Q_target), clamped to ±200 bar.
        """
        if self.source_type == "pressure":
            return 0.0

        stiffness = self._compute_stiffness()
        # Positive dp = pressure DROP (solver subtracts from p_in).
        # Negative dp = pressure RISE (source adds energy to the fluid).
        dp = stiffness * (flow_rate - self.source_flow)

        # Apply symmetric hard cap
        dp = max(-self._HARD_CAP_PA, min(self._HARD_CAP_PA, dp))
        return dp

    def calculate_dp_derivative(
        self,
        flow_rate: float,
        density: float,
        viscosity: float = 0.001
    ) -> float:
        """
        Analytical derivative ∂ΔP/∂Q [Pa/(m³/s)] for Newton-Raphson.

        Pressure Mode: 0 (boundary node; derivative unused).
        Flow Mode    : +stiffness  when spring is within hard cap  (passive-resistor sign).
                       0           when spring is at the hard cap (flat region).

        Note the positive sign: with dp = stiffness * (Q - Q_target), the
        derivative ∂dp/∂Q = +stiffness.
        """
        if self.source_type == "pressure":
            return 0.0

        stiffness = self._compute_stiffness()
        unclamped_dp = stiffness * (flow_rate - self.source_flow)

        # If the unclamped value would be clamped, the effective derivative is 0
        if abs(unclamped_dp) >= self._HARD_CAP_PA:
            return 0.0

        return stiffness  # positive: pressure drop increases with flow rate

    # ------------------------------------------------------------------
    # Post-solve telemetry propagation
    # ------------------------------------------------------------------

    def calculate(self):
        """
        Propagate final pressures, flow rates, and thermal state after solver
        convergence.

        Pressure Mode
        -------------
        Re-stamp the boundary pressure and temperature on both ports.
        The solver has already determined the flow rate — preserve it.

        Flow Mode
        ---------
        Apply the spring ΔP to propagate outlet pressure from the inlet.
        Propagate temperature and fluid properties from the injected source
        temperature (the FluidSource injects fluid at `self.temperature`).
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        fluid_type = self._get_fluid_type()

        if self.source_type == "pressure":
            # Boundary clamp: stamp pressure on both ports; leave flow_rate as-is
            for port in self.inlets + self.outlets:
                port.pressure = self.source_pressure
                self._set_port_fluid_properties(port, self.temperature)
            return self.source_pressure
        else:
            # Flow mode: propagate pressure drop and thermal state
            # Sign convention matches calculate_delta_p:
            # dp = stiffness*(Q - Q_target) < 0 when supplying, so p_out = p_in - dp > p_in
            dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
            outlet.pressure = inlet.pressure - dp  # subtracts negative dp = adds pressure
            outlet.flow_rate = inlet.flow_rate

            # The FluidSource injects fluid at its set temperature
            # (rather than inheriting inlet temperature, as it represents a utility header)
            outlet.temperature = self.temperature
            self._set_port_fluid_properties(outlet, self.temperature)

            # Inlet temperature: use the injected temperature for the boundary port too
            self._set_port_fluid_properties(inlet, self.temperature)
            return 0.0
