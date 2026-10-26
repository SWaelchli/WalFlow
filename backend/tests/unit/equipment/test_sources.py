import pytest
from simulation.equipment.base_node import total_of
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

class TestFlowSource:
    def test_is_pressure_boundary_false(self):
        source = _make_flow_source()
        assert source.is_pressure_boundary is False

    @pytest.mark.parametrize("flow_ls, sign", [
        pytest.param(1.0, 0, id="at-target"),          # 1.0 L/s = 60 L/min
        pytest.param(0.5, -1, id="below-target-boosts"),  # adds pressure boost
        pytest.param(1.5, +1, id="above-target-resists"),  # resists flow
    ])
    def test_delta_p_sign_follows_flow_error(self, flow_ls, sign):
        source = _make_flow_source(flow_lmin=60.0)
        dp = source.calculate_delta_p(flow_ls / 1000.0, 1000.0)
        if sign == 0:
            assert abs(dp) < 1e-7
        else:
            assert dp * sign > 0.0

    def test_delta_p_hard_cap_not_exceeded(self):
        source = _make_flow_source(flow_lmin=60.0)
        # extreme low flow relative to target
        dp = source.calculate_delta_p(0.0, 1000.0)
        assert abs(dp) <= 20_000_000.0

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

    def _make_pipe(self, name='pipe') -> Pipe:
        from simulation.equipment.pipe import Pipe
        p = Pipe(name=name, length=10.0, diameter=0.05)
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
        assert abs(total_of(source.outlets[0]) - expected_outlet_p) < 1.0   # the solve pins the total
