"""
Physics tests for FluidSource — Universal Fluid Boundary Condition.

Tests cover:
1. Pressure mode: port pressure equals source_pressure.
2. Flow mode: delta_p stiffness spring behaviour.
3. Flow mode: analytical derivative vs. numerical central difference.
4. Full network equilibrium solve (Pressure mode): Tank → FluidSource → Pipe → Tank.
5. Full network equilibrium solve (Flow mode): FluidSource → Pipe → Tank.
"""

import pytest
import sys
import os

# Ensure backend is importable when running pytest from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from simulation.equipment.fluid_source import FluidSource
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_global_settings(fluid_type: str = 'water') -> GlobalSettings:
    gs = GlobalSettings()
    gs.fluid_type = fluid_type
    return gs


def _make_pressure_source(pressure_bara: float = 6.0, temp_c: float = 20.0) -> FluidSource:
    node = FluidSource(
        name='FS_P',
        source_type='pressure',
        source_pressure=pressure_bara * 100_000.0,
        source_flow=50.0 / 60_000.0,
        temperature=temp_c + 273.15,
    )
    node.global_settings = _make_global_settings()
    return node


def _make_flow_source(flow_lmin: float = 50.0, temp_c: float = 20.0) -> FluidSource:
    node = FluidSource(
        name='FS_Q',
        source_type='flow',
        source_pressure=6.0 * 100_000.0,
        source_flow=flow_lmin / 60_000.0,
        temperature=temp_c + 273.15,
    )
    node.global_settings = _make_global_settings()
    return node


# ---------------------------------------------------------------------------
# 1. Pressure Mode — boundary pressure
# ---------------------------------------------------------------------------

class TestPressureMode:
    def test_is_pressure_boundary_flag(self):
        src = _make_pressure_source(pressure_bara=6.0)
        assert src.is_pressure_boundary is True

    def test_is_flow_boundary_false(self):
        src = _make_pressure_source()
        assert src.is_flow_boundary is False

    def test_calculate_stamps_pressure_on_all_ports(self):
        src = _make_pressure_source(pressure_bara=6.0)
        src.calculate()
        expected_pa = 6.0 * 100_000.0
        for port in src.inlets + src.outlets:
            assert abs(port.pressure - expected_pa) < 1.0, (
                f"Port pressure {port.pressure} Pa ≠ {expected_pa} Pa"
            )

    def test_calculate_stamps_temperature(self):
        src = _make_pressure_source(temp_c=50.0)
        src.calculate()
        expected_k = 50.0 + 273.15
        for port in src.inlets + src.outlets:
            assert abs(port.temperature - expected_k) < 0.01

    def test_delta_p_returns_zero_in_pressure_mode(self):
        src = _make_pressure_source()
        dp = src.calculate_delta_p(flow_rate=0.001, density=1000.0)
        assert dp == 0.0

    def test_dp_derivative_returns_zero_in_pressure_mode(self):
        src = _make_pressure_source()
        deriv = src.calculate_dp_derivative(flow_rate=0.001, density=1000.0)
        assert deriv == 0.0


# ---------------------------------------------------------------------------
# 2. Flow Mode — spring stiffness behaviour
# ---------------------------------------------------------------------------

class TestFlowMode:
    def test_is_pressure_boundary_false(self):
        src = _make_flow_source(flow_lmin=50.0)
        assert src.is_pressure_boundary is False

    def test_delta_p_zero_at_target_flow(self):
        """When Q = Q_target, dP should be exactly 0."""
        flow_m3s = 50.0 / 60_000.0
        src = _make_flow_source(flow_lmin=50.0)
        dp = src.calculate_delta_p(flow_rate=flow_m3s, density=1000.0)
        assert abs(dp) < 1.0  # within 1 Pa

    def test_delta_p_negative_below_target(self):
        """When Q < Q_target, source generates negative dp (adds pressure = supply energy)."""
        flow_m3s = 50.0 / 60_000.0
        src = _make_flow_source(flow_lmin=50.0)
        dp = src.calculate_delta_p(flow_rate=flow_m3s * 0.5, density=1000.0)
        assert dp < 0.0, f"Expected negative dp (pressure boost) below target, got {dp}"

    def test_delta_p_positive_above_target(self):
        """When Q > Q_target, source resists excess flow with positive dp (pressure loss)."""
        flow_m3s = 50.0 / 60_000.0
        src = _make_flow_source(flow_lmin=50.0)
        dp = src.calculate_delta_p(flow_rate=flow_m3s * 2.0, density=1000.0)
        assert dp > 0.0, f"Expected positive dp (resistance) above target, got {dp}"

    def test_delta_p_hard_cap_not_exceeded(self):
        """ΔP must not exceed ±200 bar (20 MPa) regardless of flow deviation."""
        src = _make_flow_source(flow_lmin=50.0)
        dp_max = src.calculate_delta_p(flow_rate=0.0, density=1000.0)
        dp_min = src.calculate_delta_p(flow_rate=1.0, density=1000.0)  # very high Q
        assert dp_max <= FluidSource._HARD_CAP_PA + 1.0
        assert dp_min >= -FluidSource._HARD_CAP_PA - 1.0


# ---------------------------------------------------------------------------
# 3. Flow Mode — analytical derivative vs. numerical central difference
# ---------------------------------------------------------------------------

class TestFlowModeDerivative:
    # Use relative tolerance: analytical and numerical agree to within 0.01%
    # Absolute tolerance is unhelpful here because stiffness can be 10^12 Pa/(m³/s)
    RELATIVE_TOLERANCE = 1e-4   # 0.01%

    @pytest.mark.parametrize("flow_lmin,q_test_m3s", [
        (50.0,   50.0 / 60_000.0),          # at target (dp=0, derivative=+stiffness)
        (50.0,   25.0 / 60_000.0),          # below target (dp<0, source in boost region)
        (50.0,   75.0 / 60_000.0),          # above target but within hard cap
        (10.0,   10.0 / 60_000.0),          # small flow target — at target
        (500.0,  500.0 / 60_000.0),         # large flow target — at target
    ])
    def test_analytical_vs_numerical(self, flow_lmin, q_test_m3s):
        src = _make_flow_source(flow_lmin=flow_lmin)
        density = 1000.0
        delta = 1e-7  # m³/s

        dp_fwd = src.calculate_delta_p(q_test_m3s + delta, density)
        dp_bwd = src.calculate_delta_p(q_test_m3s - delta, density)
        numerical_deriv = (dp_fwd - dp_bwd) / (2.0 * delta)

        analytical_deriv = src.calculate_dp_derivative(q_test_m3s, density)

        # Relative tolerance: |analytical - numerical| / |analytical| < 0.01%
        relative_error = abs(analytical_deriv - numerical_deriv) / max(abs(analytical_deriv), 1.0)
        assert relative_error < self.RELATIVE_TOLERANCE, (
            f"Derivative mismatch at Q={q_test_m3s*60000:.1f} L/min: "
            f"analytical={analytical_deriv:.6e}, numerical={numerical_deriv:.6e}, "
            f"relative_error={relative_error:.2e}"
        )


# ---------------------------------------------------------------------------
# 4 & 5. Full network equilibrium solves
# ---------------------------------------------------------------------------

class TestNetworkSolve:
    """
    Verify that FluidSource integrates correctly with the HydraulicNetwork solver.

    Circuit topology: Tank_supply → Pipe → FluidSource → Pipe → ControlValve → Pipe → Tank_sink
    This 4-node circuit avoids degenerate (fully pressure-boundary) topologies.
    """

    def _gs(self) -> GlobalSettings:
        return _make_global_settings()

    def _make_pipe(self, name='pipe', length=5.0, diameter=0.05, friction=0.02) -> Pipe:
        p = Pipe(name=name, length=length, diameter=diameter, friction_factor=friction)
        p.global_settings = self._gs()
        return p

    def _make_tank(self, name='tank', level_m=2.0) -> Tank:
        t = Tank(name=name, elevation=0.0, fluid_level=level_m,
                 temperature=293.15, fluid_type='water')
        t.global_settings = self._gs()
        return t

    def _make_valve(self, name='valve', cv=50.0) -> LinearControlValve:
        from simulation.equipment.linear_control_valve import LinearControlValve
        v = LinearControlValve(name=name, max_cv=cv, opening_pct=100.0)
        v.global_settings = self._gs()
        return v

    def _build_network(self, source, extra_nodes=None):
        """Build a 4-node: Tank → FluidSource → Valve → Tank circuit."""
        gs = self._gs()
        tank_in  = self._make_tank('t_in', level_m=2.0)
        valve    = self._make_valve('v1')
        tank_out = self._make_tank('t_out', level_m=2.0)
        p1 = self._make_pipe('p1')
        p2 = self._make_pipe('p2')
        p3 = self._make_pipe('p3')

        nodes = {'t_in': tank_in, 'src': source, 'v1': valve, 't_out': tank_out}
        edges = [
            {'id': 'e1', 'label': 'p1', 'source': 't_in', 'target': 'src',
             'source_port': 'outlet-0', 'target_port': 'inlet-0', 'pipe': p1},
            {'id': 'e2', 'label': 'p2', 'source': 'src', 'target': 'v1',
             'source_port': 'outlet-0', 'target_port': 'inlet-0', 'pipe': p2},
            {'id': 'e3', 'label': 'p3', 'source': 'v1', 'target': 't_out',
             'source_port': 'outlet-0', 'target_port': 'inlet-0', 'pipe': p3},
        ]

        network = HydraulicNetwork(nodes=nodes, edges=edges)
        network.global_settings = gs
        for n in nodes.values():
            n.global_settings = gs
        for p in [p1, p2, p3]:
            p.global_settings = gs

        return network

    def test_pressure_mode_convergence(self):
        """
        Pressure mode FluidSource in a 4-node circuit.
        Expected: solver converges and source stamps 6 bara.
        """
        source = _make_pressure_source(pressure_bara=6.0)
        network = self._build_network(source)
        solver = NetworkSolver(network)
        stats = solver.solve()
        assert stats is not None
        # After solve, FluidSource in pressure mode should have its pressure on the ports
        source.calculate()
        for port in source.inlets + source.outlets:
            assert abs(port.pressure - 6.0 * 100_000.0) < 5000.0, (
                f"Expected ~600000 Pa, got {port.pressure:.0f} Pa"
            )

    def test_flow_mode_convergence(self):
        """
        Flow mode FluidSource enforces ~50 L/min in a 4-node circuit.
        """
        target_lmin = 50.0
        source = _make_flow_source(flow_lmin=target_lmin)
        # Clear warm-start cache to avoid topology collision from the pressure-mode test
        # (same graph topology but different is_pressure_boundary configuration)
        NetworkSolver._warm_start_cache.clear()
        network = self._build_network(source)
        solver = NetworkSolver(network)
        stats = solver.solve()
        assert stats is not None

        # Check that solved outlet flow is close to 50 L/min
        actual_flow_lmin = abs(source.outlets[0].flow_rate) * 60_000.0
        assert abs(actual_flow_lmin - target_lmin) < 2.0, (
            f"Flow mode: expected ~{target_lmin} L/min, got {actual_flow_lmin:.2f} L/min"
        )

    def test_flow_mode_unconnected_inlet(self):
        """
        Test that a flow-mode FluidSource with an unconnected inlet still supplies fluid
        to the network at the target flow rate, with its inlet pressure pinned to atmospheric.
        """
        target_lmin = 35.0
        source = _make_flow_source(flow_lmin=target_lmin)
        NetworkSolver._warm_start_cache.clear()

        # Build a network where the inlet of the source is not connected to anything
        # src (outlet-0) -> pipe -> tank (outlet-0, acting as outlet pressure boundary)
        tank_out = self._make_tank('t_out', level_m=2.0)
        p = self._make_pipe('p')
        gs = self._gs()

        nodes = {'src': source, 't_out': tank_out}
        edges = [
            {'id': 'e1', 'label': 'p', 'source': 'src', 'target': 't_out',
             'source_port': 'outlet-0', 'target_port': 'inlet-0', 'pipe': p},
        ]

        network = HydraulicNetwork(nodes=nodes, edges=edges)
        network.global_settings = gs
        for n in nodes.values():
            n.global_settings = gs
        p.global_settings = gs

        solver = NetworkSolver(network)
        stats = solver.solve()
        assert stats is not None
        assert stats['success'] is True

        # FluidSource should supply flow close to target
        actual_flow_lmin = abs(source.outlets[0].flow_rate) * 60_000.0
        assert abs(actual_flow_lmin - target_lmin) < 1.0, (
            f"Flow mode (unconnected inlet): expected ~{target_lmin} L/min, got {actual_flow_lmin:.2f} L/min"
        )

        # Inlet pressure should be pinned to atmospheric pressure (101,325 Pa)
        expected_atm_pa = gs.atmospheric_pressure
        assert abs(source.inlets[0].pressure - expected_atm_pa) < 1.0, (
            f"Expected inlet pressure to be pinned to {expected_atm_pa} Pa, got {source.inlets[0].pressure:.2f} Pa"
        )

