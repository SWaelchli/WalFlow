import pytest
import numpy as np
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver
from simulation.equipment.tank import Tank
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.flow_source import FlowSource
from simulation.equipment.pipe import Pipe
from simulation.equipment.linear_control_valve import LinearControlValve

def _make_pressure_source(pressure_bara=6.0, temp_c=20.0):
    return PressureSource(
        name='p_src',
        source_pressure=pressure_bara * 100_000.0,
        temperature=temp_c + 273.15
    )

def _make_flow_source(flow_lmin=50.0, temp_c=20.0):
    return FlowSource(
        name='f_src',
        source_flow=flow_lmin / 60_000.0,
        temperature=temp_c + 273.15
    )

class TestPressureSource:
    def test_is_pressure_boundary_flag(self):
        source = _make_pressure_source()
        assert source.is_pressure_boundary is True
        assert source.is_flow_boundary is False

    def test_calculate_stamps_pressure_on_all_ports(self):
        source = _make_pressure_source(pressure_bara=5.0)
        source.calculate()
        for port in source.inlets + source.outlets:
            assert port.pressure == 500_000.0

    def test_calculate_stamps_temperature(self):
        source = _make_pressure_source(temp_c=25.0)
        source.calculate()
        for port in source.inlets + source.outlets:
            assert port.temperature == 298.15
            assert port.density > 900.0
            assert port.viscosity > 0.0

class TestFlowSource:
    def test_is_pressure_boundary_false(self):
        source = _make_flow_source()
        assert source.is_pressure_boundary is False
        assert source.is_flow_boundary is False

    def test_delta_p_zero_at_target_flow(self):
        source = _make_flow_source(flow_lmin=60.0)
        dp = source.calculate_delta_p(1.0 / 1000.0, 1000.0) # 1.0 L/s = 60 L/min
        assert abs(dp) < 1e-7

    def test_delta_p_negative_below_target(self):
        source = _make_flow_source(flow_lmin=60.0)
        # flow is less than target (0.5 L/s < 1 L/s)
        dp = source.calculate_delta_p(0.5 / 1000.0, 1000.0)
        assert dp < 0.0 # adds pressure boost

    def test_delta_p_positive_above_target(self):
        source = _make_flow_source(flow_lmin=60.0)
        # flow is more than target (1.5 L/s > 1 L/s)
        dp = source.calculate_delta_p(1.5 / 1000.0, 1000.0)
        assert dp > 0.0 # resists flow

    def test_delta_p_hard_cap_not_exceeded(self):
        source = _make_flow_source(flow_lmin=60.0)
        # extreme low flow relative to target
        dp = source.calculate_delta_p(0.0, 1000.0)
        assert abs(dp) <= 20_000_000.0

class TestFlowSourceDerivative:
    @pytest.mark.parametrize("flow_lmin, test_flow_m3s", [
        (50.0, 50.0 / 60000.0),
        (50.0, 25.0 / 60000.0),
        (50.0, 75.0 / 60000.0),
        (10.0, 10.0 / 60000.0),
        (500.0, 500.0 / 60000.0),
    ])
    def test_analytical_vs_numerical(self, flow_lmin, test_flow_m3s):
        source = _make_flow_source(flow_lmin=flow_lmin)
        density = 1000.0
        viscosity = 0.001
        
        # Analytical
        d_analytical = source.calculate_dp_derivative(test_flow_m3s, density, viscosity)
        
        # Numerical central difference
        delta = 1e-7
        dp_plus = source.calculate_delta_p(test_flow_m3s + delta, density, viscosity)
        dp_minus = source.calculate_delta_p(test_flow_m3s - delta, density, viscosity)
        d_numerical = (dp_plus - dp_minus) / (2.0 * delta)
        
        assert abs(d_analytical - d_numerical) < 1.0, (
            f"Derivative mismatch: analytical={d_analytical}, numerical={d_numerical}"
        )

class TestNetworkSolve:
    def _gs(self):
        from simulation.schemas import GlobalSettings
        return GlobalSettings(
            fluid_type='water',
            ambient_temperature=293.15,
            atmospheric_pressure=101325.0,
            tolerance=1e-6
        )

    def _make_tank(self, name='tank', level_m=2.0) -> Tank:
        t = Tank(name=name, elevation=0.0, fluid_level=level_m,
                 temperature=293.15, fluid_type='water')
        t.global_settings = self._gs()
        return t

    def _make_pipe(self, name='pipe', friction=0.02) -> Pipe:
        from simulation.equipment.pipe import Pipe
        p = Pipe(name=name, length=10.0, diameter=0.05, friction_factor=friction)
        p.global_settings = self._gs()
        return p

    def _make_valve(self, name='valve', cv=50.0) -> LinearControlValve:
        from simulation.equipment.linear_control_valve import LinearControlValve
        v = LinearControlValve(name=name, max_cv=cv, opening_pct=100.0)
        v.global_settings = self._gs()
        return v

    def test_pressure_source_network_solve(self):
        """
        PressureSource in a 3-node circuit: PressureSource -> Pipe -> Tank.
        """
        gs = self._gs()
        source = _make_pressure_source(pressure_bara=6.0)
        tank = self._make_tank('t_out', level_m=2.0)
        pipe = self._make_pipe('p1')

        nodes = {'src': source, 't_out': tank}
        edges = [
            {'id': 'e1', 'label': 'p1', 'source': 'src', 'target': 't_out',
             'source_port': 'outlet-0', 'target_port': 'inlet-0', 'pipe': pipe},
        ]

        network = HydraulicNetwork(nodes=nodes, edges=edges)
        network.global_settings = gs
        for n in nodes.values(): n.global_settings = gs
        pipe.global_settings = gs

        solver = NetworkSolver(network)
        stats = solver.solve()
        assert stats is not None
        assert stats['success'] is True

        # Verify port pressure is correctly solved and stamped to 6 bara
        assert abs(source.outlets[0].pressure - 600_000.0) < 1.0

    def test_flow_source_network_solve(self):
        """
        FlowSource in a 2-node circuit: FlowSource -> Pipe -> Tank.
        """
        gs = self._gs()
        target_lmin = 45.0
        source = _make_flow_source(flow_lmin=target_lmin)
        tank = self._make_tank('t_out', level_m=2.0)
        pipe = self._make_pipe('p1')

        nodes = {'src': source, 't_out': tank}
        edges = [
            {'id': 'e1', 'label': 'p1', 'source': 'src', 'target': 't_out',
             'source_port': 'outlet-0', 'target_port': 'inlet-0', 'pipe': pipe},
        ]

        network = HydraulicNetwork(nodes=nodes, edges=edges)
        network.global_settings = gs
        for n in nodes.values(): n.global_settings = gs
        pipe.global_settings = gs

        solver = NetworkSolver(network)
        stats = solver.solve()
        assert stats is not None
        assert stats['success'] is True

        # Flow source should supply flow close to target
        actual_flow_lmin = abs(source.outlets[0].flow_rate) * 60_000.0
        assert abs(actual_flow_lmin - target_lmin) < 1.0

        # The solver pinned the internal node pressure to atmospheric_pressure (101,325 Pa).
        # Therefore, the outlet pressure must equal atmospheric_pressure - dp.
        density = 1000.0
        viscosity = 0.001
        dp = source.calculate_delta_p(source.outlets[0].flow_rate, density, viscosity)
        expected_outlet_p = gs.atmospheric_pressure - dp
        assert abs(source.outlets[0].pressure - expected_outlet_p) < 1.0
