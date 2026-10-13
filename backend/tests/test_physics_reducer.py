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


@pytest.mark.parametrize("d_in,d_out,q_lmin", [
    (0.05248, 0.07792, 100.0),    # Expander, forward flow (pressure recovery)
    (0.05248, 0.07792, 1000.0),
    (0.07792, 0.05248, -100.0),   # Reducer, reverse flow (pressure recovery)
    (0.07792, 0.05248, -1000.0),
    (0.05248, 0.07792, -300.0),   # Expander, reverse flow (contraction)
])
def test_reducer_derivative_sign_with_pressure_recovery(d_in, d_out, q_lmin):
    """
    The static pressure model makes dP/dQ negative wherever Bernoulli recovery exceeds
    the irreversible losses. The analytical derivative must keep that sign for Newton.
    """
    red = Reducer(name="R", diameter_in=d_in, diameter_out=d_out, length=0.089, cone_angle_deg=18.2)
    rho, mu, dq = 998.2, 0.001, 1e-6
    q = q_lmin / 60000.0

    numerical = (red.calculate_delta_p(q + dq, rho, mu) - red.calculate_delta_p(q - dq, rho, mu)) / (2.0 * dq)
    assert red.calculate_dp_derivative(q, rho, mu) == pytest.approx(numerical, rel=0.05)


@pytest.mark.parametrize("angle,expected_contr,expected_exp", [
    # beta = 0.05248 / 0.07792 = 0.67351, (1 - beta^2) = 0.54638
    # theta <= 45: K_c = 0.8 sin(t/2)(1-b2), K_e = 2.6 sin(t/2)(1-b2)^2
    (18.2, 0.8 * 0.158158 * 0.54638, 2.6 * 0.158158 * 0.54638 ** 2),
    # theta > 45: K_c = 0.5 sqrt(sin(t/2))(1-b2), K_e = (1-b2)^2
    (90.0, 0.5 * (0.707107 ** 0.5) * 0.54638, 0.54638 ** 2),
])
def test_reducer_crane_k_factors(angle, expected_contr, expected_exp):
    """Hand-calculated Crane TP 410 (A-26) K2 values, referenced to the small bore."""
    red = Reducer(name="R", diameter_in=0.07792, diameter_out=0.05248, length=0.089, cone_angle_deg=angle)

    k_contr, ref_contr = red._get_form_loss_k(+0.001)
    k_exp, ref_exp = red._get_form_loss_k(-0.001)

    assert k_contr == pytest.approx(expected_contr, rel=1e-4)
    assert k_exp == pytest.approx(expected_exp, rel=1e-4)
    assert ref_contr == pytest.approx(red.area_out)
    assert ref_exp == pytest.approx(red.area_out)


def test_graph_parser_tolerates_null_reducer_fields():
    """Null / missing geometry from the frontend falls back to the DN80 x DN50 defaults."""
    from simulation.graph_parser import GraphParser
    from simulation.schemas import ReactFlowNode

    node = GraphParser.create_node(ReactFlowNode(
        id="r1", type="reducer", position={"x": 0, "y": 0},
        data={"diameter_in": None, "diameter_out": 0.05248, "cone_angle_deg": None, "standard": "DIN_EN_10253_2_REDUCERS"}
    ))
    assert node.diameter_in == pytest.approx(0.07792)
    assert node.diameter_out == pytest.approx(0.05248)
    assert node.cone_angle_deg == pytest.approx(18.2)
    assert node.standard == "DIN_EN_10253_2_REDUCERS"


@pytest.mark.parametrize("design_code,expected", [
    ("EN 13480", "DIN_EN_10253_2_REDUCERS"),
    ("DIN EN 13480-3", "DIN_EN_10253_2_REDUCERS"),
    ("en 13480", "DIN_EN_10253_2_REDUCERS"),
    ("ASME B31.3", "ASME_B16_9_REDUCERS"),
    ("NORSOK L-001 / GENERAL", "ASME_B16_9_REDUCERS"),   # contains 'EN' inside words only
    ("", "ASME_B16_9_REDUCERS"),
])
def test_tr2000_design_code_to_reducer_standard(design_code, expected):
    from services.tr2000_service import _map_reducer_standard
    assert _map_reducer_standard(design_code) == expected


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

    assert stats["success"] is True, stats.get("error")

    # Flow should be positive across all elements
    flow_lmin = red.inlets[0].flow_rate * 60000.0
    assert flow_lmin > 0.0


def test_expander_network_with_dominant_pressure_recovery():
    """
    PressureSource -> DN50 pipe -> Expander (2"x3") -> very short DN80 pipe -> Tank.
    The expander's static-pressure recovery outweighs the downstream pipe friction, so the
    expander->tank edge Jacobian term is negative. The solver must still converge.
    """
    gs = GlobalSettings(fluid_type="water", default_temperature=20.0)

    src = PressureSource(name="Supply", source_pressure=150000.0, temperature=293.15)
    exp = Reducer(name="Exp_2x3", diameter_in=0.05248, diameter_out=0.07792, length=0.089, cone_angle_deg=18.2)
    tank = Tank(name="DischargeTank", fluid_level=0.0, elevation=0.0, temperature=293.15, fluid_type="water")

    nodes = {"src": src, "exp": exp, "tank": tank}
    edges = [
        {"source": "src", "target": "exp", "pipe": Pipe("p1", 5.0, 0.05248)},
        {"source": "exp", "target": "tank", "pipe": Pipe("p2", 0.05, 0.07792)}
    ]
    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs

    NetworkSolver._warm_start_cache.clear()
    stats = NetworkSolver(HydraulicNetwork(nodes=nodes, edges=edges)).solve()
    assert stats["success"] is True, stats.get("error")

    q = exp.inlets[0].flow_rate
    rho, mu = exp.inlets[0].density, exp.inlets[0].viscosity
    # Edge term d(dp_exp + dp_pipe2)/dQ is negative at the solution
    assert exp.calculate_dp_derivative(q, rho, mu) + edges[1]["pipe"].calculate_dp_derivative(q, rho, mu) < 0.0
    assert q > 0.0

    # Pressure drop across the expander must match its own characteristic at the solved flow
    dp_solved = exp.inlets[0].pressure - exp.outlets[0].pressure
    dp_model = exp.calculate_delta_p(q, exp.inlets[0].density, exp.inlets[0].viscosity)
    assert dp_solved == pytest.approx(dp_model, rel=1e-3)
    assert dp_solved < 0.0  # net static pressure recovery
