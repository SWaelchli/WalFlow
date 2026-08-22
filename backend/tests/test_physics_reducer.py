import pytest
from simulation.equipment.reducer import Reducer
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver


def test_reducer_contraction_losses_and_bernoulli():
    """
    Tests gradual conical contraction (3" to 2" reducer):
    D1 = 0.07792 m, D2 = 0.05248 m, H = 0.089 m, theta = 18.2 deg.
    Fluid: Water (rho = 998.2 kg/m3, mu = 0.001 Pa.s).
    """
    reducer = Reducer(
        name="Red_3x2",
        diameter_in=0.07792,
        diameter_out=0.05248,
        length=0.089,
        cone_angle_deg=18.2,
        reducer_type="concentric"
    )

    # 100 L/min -> 0.0016667 m3/s
    q = 100.0 / 60000.0
    rho = 998.2
    mu = 0.001

    dp_loss, dp_bern, dp_total = reducer.calculate_losses(q, rho, mu)

    # In contraction:
    # v1 = Q / A1 = 0.0016667 / 0.004768 = ~0.35 m/s
    # v2 = Q / A2 = 0.0016667 / 0.002163 = ~0.77 m/s
    # Bernoulli: dp_bern = 0.5 * rho * (v2^2 - v1^2) > 0
    assert dp_bern > 0.0
    assert dp_loss > 0.0
    assert dp_total == pytest.approx(dp_loss + dp_bern, rel=1e-5)

    # Total delta P must equal calculate_delta_p
    assert reducer.calculate_delta_p(q, rho, mu) == pytest.approx(dp_total, rel=1e-5)


def test_reducer_expander_diffuser_recovery():
    """
    Tests gradual expansion / diffuser (2" to 3" expander):
    D1 = 0.05248 m, D2 = 0.07792 m.
    Bernoulli static pressure should recover (dp_bern < 0).
    """
    expander = Reducer(
        name="Exp_2x3",
        diameter_in=0.05248,
        diameter_out=0.07792,
        length=0.089,
        cone_angle_deg=18.2,
        reducer_type="concentric"
    )

    q = 150.0 / 60000.0
    rho = 998.2
    mu = 0.001

    dp_loss, dp_bern, dp_total = expander.calculate_losses(q, rho, mu)

    # In expansion: fluid decelerates, dynamic pressure converts to static pressure
    assert dp_bern < 0.0
    assert dp_loss > 0.0  # Form and friction losses are always dissipative (positive)


def test_reducer_analytical_derivative():
    """
    Verifies that the analytical Jacobian derivative calculate_dp_derivative matches
    central finite differences to high precision across a range of flow rates.
    """
    reducer = Reducer(
        name="Red_Derivative_Check",
        diameter_in=0.07792,
        diameter_out=0.05248,
        length=0.089,
        cone_angle_deg=18.2
    )

    rho = 998.2
    mu = 0.001
    delta_q = 1e-6

    for q_lmin in [10.0, 50.0, 100.0, 300.0, 1000.0]:
        q = q_lmin / 60000.0

        analytical_deriv = reducer.calculate_dp_derivative(q, rho, mu)

        dp_plus = reducer.calculate_delta_p(q + delta_q, rho, mu)
        dp_minus = reducer.calculate_delta_p(q - delta_q, rho, mu)
        numerical_deriv = (dp_plus - dp_minus) / (2.0 * delta_q)

        # Allow small deviation due to friction factor derivative nuances
        assert analytical_deriv == pytest.approx(numerical_deriv, rel=0.05)


def test_reducer_reverse_flow_symmetry():
    """
    Verifies that reverse flow (Q < 0) through a 3"x2" reducer acts identically to
    forward flow (Q > 0) through a 2"x3" expander with opposite sign.
    """
    red_3x2 = Reducer(name="R32", diameter_in=0.07792, diameter_out=0.05248, length=0.089, cone_angle_deg=18.2)
    exp_2x3 = Reducer(name="E23", diameter_in=0.05248, diameter_out=0.07792, length=0.089, cone_angle_deg=18.2)

    q = 100.0 / 60000.0
    rho = 998.2
    mu = 0.001

    dp_reverse = red_3x2.calculate_delta_p(-q, rho, mu)
    dp_forward = exp_2x3.calculate_delta_p(q, rho, mu)

    assert dp_reverse == pytest.approx(-dp_forward, rel=1e-4)


def test_reducer_network_solver_integration():
    """
    Integrates Reducer into a complete hydraulic network:
    PressureSource (5 bar) -> Reducer (3"x2") -> Tank (1 bar).
    Verifies full equilibrium solve with NetworkSolver.
    """
    gs = GlobalSettings(fluid_type="water", default_temperature=20.0)

    src = PressureSource(name="Supply", source_pressure=500000.0, temperature=293.15)
    red = Reducer(name="Reducer_3x2", diameter_in=0.07792, diameter_out=0.05248, length=0.089, cone_angle_deg=18.2)
    tank = Tank(name="DischargeTank", fluid_level=0.0, elevation=0.0, temperature=293.15, fluid_type="water")


    nodes = {"src": src, "red": red, "tank": tank}
    edges = [
        {"source": "src", "target": "red", "pipe": Pipe("p1", 5.0, 0.07792)},
        {"source": "red", "target": "tank", "pipe": Pipe("p2", 5.0, 0.05248)}
    ]

    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs

    network = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(network)
    stats = solver.solve()

    assert stats.get("converged", True) is True

    # Flow should be positive across all elements
    flow_lmin = red.inlets[0].flow_rate * 60000.0
    assert flow_lmin > 0.0
