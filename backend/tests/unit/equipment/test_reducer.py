import pytest
from simulation.equipment.reducer import Reducer
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver



@pytest.mark.parametrize("d_in, d_out, q_lmin, bernoulli_sign", [
    # 3" to 2" contraction: v1 ~ 0.35 m/s, v2 ~ 0.77 m/s, so dp_bern = 0.5*rho*(v2^2 - v1^2) positive
    pytest.param(0.07792, 0.05248, 100.0, +1, id="contraction-3x2"),
    # 2" to 3" diffuser: the fluid decelerates, dynamic pressure converts to static pressure
    pytest.param(0.05248, 0.07792, 150.0, -1, id="expander-2x3"),
])
def test_reducer_losses_and_bernoulli(d_in, d_out, q_lmin, bernoulli_sign):
    """Form and friction losses are always dissipative; the Bernoulli term has the sign of the velocity change."""
    reducer = Reducer(name="Red", diameter_in=d_in, diameter_out=d_out, length=0.089,
                      cone_angle_deg=18.2, reducer_type="concentric")
    q = q_lmin / 60000.0
    rho = 998.2
    mu = 0.001

    dp_loss, dp_bern, dp_total = reducer.calculate_losses(q, rho, mu)

    assert bernoulli_sign * dp_bern > 0.0
    assert dp_loss > 0.0
    assert dp_total == pytest.approx(dp_loss + dp_bern, rel=1e-5)
    assert reducer.calculate_delta_p(q, rho, mu) == pytest.approx(dp_total, rel=1e-5)






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
        data={"diameter_in_m": None, "diameter_out_m": 0.05248, "cone_angle_deg": None, "standard": "DIN_EN_10253_2_REDUCERS"}
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


@pytest.mark.parametrize("design_code,expected", [
    ("EN 13480", "DIN_EN_PIPE_SCHEDULES"),
    ("DIN EN 13480-3", "DIN_EN_PIPE_SCHEDULES"),
    ("ASME B31.3", "ASME_B36_10M_SCHEDULES"),
    ("NORSOK L-001 / GENERAL", "ASME_B36_10M_SCHEDULES"),
    ("", "ASME_B36_10M_SCHEDULES"),
])
def test_tr2000_design_code_to_schedule_standard(design_code, expected):
    from services.tr2000_service import _map_schedule_standard
    assert _map_schedule_standard(design_code) == expected


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


@pytest.mark.parametrize("p_src, d_in, d_out, len_out, recovery", [
    # source at 5 bar, 3x2 reducer, tank: contraction, flow must be positive
    pytest.param(500000.0, 0.07792, 0.05248, 5.0, False, id="contraction-3x2"),
    # The expander recovery outweighs the very short downstream pipe, so the
    # expander to tank edge Jacobian term is negative. The solver must still converge.
    pytest.param(150000.0, 0.05248, 0.07792, 0.05, True, id="expander-dominant-pressure-recovery"),
])
def test_reducer_network_solves(p_src, d_in, d_out, len_out, recovery):
    gs = GlobalSettings(fluid_type="water", default_temperature=20.0)
    src = PressureSource(name="Supply", source_pressure=p_src, temperature=293.15)
    red = Reducer(name="Red", diameter_in=d_in, diameter_out=d_out, length=0.089, cone_angle_deg=18.2)
    tank = Tank(name="DischargeTank", fluid_level=0.0, elevation=0.0, temperature=293.15, fluid_type="water")
    nodes = {"src": src, "red": red, "tank": tank}
    edges = [
        {"source": "src", "target": "red", "pipe": Pipe("p1", 5.0, d_in)},
        {"source": "red", "target": "tank", "pipe": Pipe("p2", len_out, d_out)}
    ]
    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs
    NetworkSolver._warm_start_cache.clear()
    stats = NetworkSolver(HydraulicNetwork(nodes=nodes, edges=edges)).solve()
    assert stats["success"] is True, stats.get("error")
    q = red.inlets[0].flow_rate
    rho, mu = red.inlets[0].density, red.inlets[0].viscosity
    assert q > 0.0
    if not recovery:
        return
    # Edge term d(dp_red + dp_pipe2)/dQ is negative at the solution (central difference)
    h = 1e-4 * abs(q)
    pipe2 = edges[1]["pipe"]

    def edge_dp(x):
        return red.calculate_delta_p(x, rho, mu) + pipe2.calculate_delta_p(x, rho, mu)

    assert (edge_dp(q + h) - edge_dp(q - h)) / (2.0 * h) < 0.0
    # Pressure drop across the expander must match its own characteristic at the solved flow
    dp_solved = red.inlets[0].pressure - red.outlets[0].pressure
    dp_model = red.calculate_delta_p(q, red.inlets[0].density, red.inlets[0].viscosity)
    assert dp_solved == pytest.approx(dp_model, rel=1e-3)
    assert dp_solved < 0.0  # net static pressure recovery


def _reducer_graph(reducer_data):
    from simulation.schemas import ReactFlowGraph
    return ReactFlowGraph(**{
        "nodes": [
            {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1"}},
            {"id": "r1", "type": "reducer", "position": {"x": 1, "y": 0}, "data": {"label": "R-1", **reducer_data}},
            {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2"}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "r1", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"length_m": 1.0, "diameter_m": 0.07792}},
            {"id": "e2", "source": "r1", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"length_m": 1.0, "diameter_m": 0.05248}},
        ],
    })


@pytest.mark.parametrize("field", ["diameter_in_m", "diameter_out_m", "length_m"])
@pytest.mark.parametrize("value", [0.0, -0.05])
def test_zero_or_negative_reducer_dimension_is_rejected(field, value):
    from simulation.graph_parser import GraphParser, ModelInputError
    with pytest.raises(ModelInputError, match=f"R-1.*{field}"):
        GraphParser.parse_graph(_reducer_graph({field: value}))


def test_missing_reducer_dimensions_use_the_dn80_dn50_defaults():
    from simulation.graph_parser import GraphParser
    red = GraphParser.parse_graph(_reducer_graph({})).nodes["r1"]
    assert (red.diameter_in, red.diameter_out, red.length) == pytest.approx((0.07792, 0.05248, 0.089))


def test_reducer_roughness_is_read_in_mm():
    from simulation.graph_parser import GraphParser
    assert GraphParser.parse_graph(_reducer_graph({"roughness_mm": 0.2})).nodes["r1"].roughness == pytest.approx(0.0002)
    assert GraphParser.parse_graph(_reducer_graph({})).nodes["r1"].roughness == pytest.approx(0.000045)


def test_zero_reducer_roughness_is_kept_as_smooth():
    from simulation.graph_parser import GraphParser
    assert GraphParser.parse_graph(_reducer_graph({"roughness_mm": 0})).nodes["r1"].roughness == 0.0


def test_negative_reducer_roughness_is_rejected():
    from simulation.graph_parser import GraphParser, ModelInputError
    with pytest.raises(ModelInputError, match="R-1.*roughness_mm"):
        GraphParser.parse_graph(_reducer_graph({"roughness_mm": -0.1}))


@pytest.mark.audit("D-07")
@pytest.mark.parametrize("roughness", [0.0, 0.000045])
@pytest.mark.parametrize("q", [1e-6, 2e-5, 5e-5, 1e-4, 1e-3, 1e-2])
def test_d07_reducer_friction_equals_pipe_friction(roughness, q):
    # Equal bores: no form loss and no Bernoulli term, only wall friction over the length
    d, length, rho, mu = 0.05, 0.5, 870.0, 0.03
    red = Reducer("R", diameter_in=d, diameter_out=d, length=length, roughness=roughness)
    pipe = Pipe("P", length, d, roughness)
    assert red.calculate_delta_p(q, rho, mu) == pytest.approx(pipe.calculate_delta_p(q, rho, mu), rel=1e-9)
