import sys
import os
import math

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.equipment.orifice import Orifice
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.fluid_utils import FluidProperties
from simulation.schemas import ReactFlowNode, ReactFlowEdge, ReactFlowGraph, HydraulicNetwork, GlobalSettings
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

WATER_RHO = 998.2
WATER_MU = 0.001


def rg_c(beta, pipe_d, re_pipe):
    """Independent reimplementation of the ISO 5167-2:2022 Formula (4) RG equation (corner taps)."""
    re_safe = max(1e-9, re_pipe)
    a = (19000.0 * beta / re_safe) ** 0.8

    c = 0.5961 \
        + 0.0261 * beta ** 2 \
        - 0.216 * beta ** 8 \
        + 0.000521 * (1e6 * beta / re_safe) ** 0.7 \
        + (0.0188 + 0.0063 * a) * beta ** 3.5 * (1e6 / re_safe) ** 0.3

    if pipe_d < 0.07112:
        c += 0.011 * (0.75 - beta) * (2.8 - pipe_d / 0.0254)

    return c


def rg_loss_ratio(c, beta):
    """Independent reimplementation of ISO 5167-2:2022 §5.4 Formula (7) loss ratio."""
    s = math.sqrt(1.0 - beta ** 4 * (1.0 - c ** 2))
    return (s - c * beta ** 2) / (s + c * beta ** 2)


def flow_from_re(re_pipe, rho, mu, pipe_d):
    """Q (m3/s) that yields a given pipe Reynolds number."""
    area_pipe = math.pi * (pipe_d / 2.0) ** 2
    return re_pipe * area_pipe * mu / (rho * pipe_d)


def test_rg_formula_roundtrip():
    """The RG implementation matches an independent reimplementation to rel 1e-9."""
    for beta in (0.2, 0.5, 0.7):
        for re_pipe in (1e4, 1e5, 1e6):
            for pipe_d in (0.05, 0.1):
                c_impl = Orifice._cd_rg_iso5167(beta, pipe_d, re_pipe)
                c_ref = rg_c(beta, pipe_d, re_pipe)
                assert math.isclose(c_impl, c_ref, rel_tol=1e-9, abs_tol=1e-12), \
                    f"RG mismatch beta={beta} Re={re_pipe} D={pipe_d}: {c_impl} vs {c_ref}"


def test_high_re_analytic_limit():
    """D >= 71.12 mm: C(Re->inf) -> 0.5961 + 0.0261*beta^2 - 0.216*beta^8."""
    beta = 0.5
    pipe_d = 0.1
    re_pipe = 1e12
    c = Orifice._cd_rg_iso5167(beta, pipe_d, re_pipe)
    limit = 0.5961 + 0.0261 * beta ** 2 - 0.216 * beta ** 8
    assert math.isclose(c, limit, rel_tol=1e-4), f"C(high Re) {c} != limit {limit}"


def test_tap_dp_against_iso_flow_equation():
    """q_m = C * A_o * sqrt(2 * rho * dP_tap) holds for the implemented tap dP."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d, orif_d = 0.05248, 0.02
    beta = orif_d / pipe_d
    area_orifice = math.pi * (orif_d / 2.0) ** 2
    ori = Orifice("Tap", pipe_diameter=pipe_d, orifice_diameter=orif_d)

    re_pipe = 1e5  # fully turbulent, w = 1
    q = flow_from_re(re_pipe, rho, mu, pipe_d)
    c_rg = Orifice._cd_rg_iso5167(beta, pipe_d, re_pipe)
    dp = ori.calculate_delta_p(q, rho, mu)

    r = rg_loss_ratio(c_rg, beta)
    dp_tap_impl = dp / r
    dp_tap_expected = 0.5 * rho * q * abs(q) / (area_orifice ** 2 * c_rg ** 2)
    assert math.isclose(dp_tap_impl, dp_tap_expected, rel_tol=1e-4), \
        f"tap dP {dp_tap_impl} != ISO flow equation {dp_tap_expected}"


def test_formula7_loss_ratio():
    """Permanent loss ratio matches the Formula (7) recomputation using C directly."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d, orif_d = 0.05248, 0.036736  # beta ~ 0.7
    beta = orif_d / pipe_d
    area_orifice = math.pi * (orif_d / 2.0) ** 2
    ori = Orifice("Loss", pipe_diameter=pipe_d, orifice_diameter=orif_d)

    re_pipe = 1e5
    q = flow_from_re(re_pipe, rho, mu, pipe_d)
    c_rg = Orifice._cd_rg_iso5167(beta, pipe_d, re_pipe)
    dp = ori.calculate_delta_p(q, rho, mu)

    r_impl = dp / (0.5 * rho * q * abs(q) / (area_orifice ** 2 * c_rg ** 2))
    r_ref = rg_loss_ratio(c_rg, beta)
    assert math.isclose(r_impl, r_ref, rel_tol=1e-4), f"loss ratio {r_impl} != {r_ref}"


def _numerical_derivative(ori, q, rho, mu, h_rel=1e-6):
    h = max(h_rel * abs(q), 1e-9)
    dp_plus = ori.calculate_delta_p(q + h, rho, mu)
    dp_minus = ori.calculate_delta_p(q - h, rho, mu)
    return (dp_plus - dp_minus) / (2.0 * h)


def test_derivative_vs_numerical():
    """Analytic derivative within 1% of central differences across regimes."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d = 0.05248

    cases = [
        (0.5, 800.0, 'laminar'),
        (0.5, 3500.0, 'blend'),
        (0.5, 1e5, 'turbulent'),
        (0.7, 3000.0, 'laminar'),
        (0.7, 10000.0, 'blend'),
        (0.7, 1e5, 'turbulent'),
    ]
    for beta, re_pipe, regime in cases:
        orif_d = beta * pipe_d
        ori = Orifice(f"Deriv_{regime}", pipe_diameter=pipe_d, orifice_diameter=orif_d)
        q = flow_from_re(re_pipe, rho, mu, pipe_d)
        analytic = ori.calculate_dp_derivative(q, rho, mu)
        numeric = _numerical_derivative(ori, q, rho, mu)
        assert numeric != 0
        assert math.isclose(analytic, numeric, rel_tol=1e-2), \
            f"[{regime}] beta={beta} Re={re_pipe}: analytic {analytic} != numeric {numeric}"


def test_continuity_across_blend_bands():
    """No jumps in dP or its derivative across the blend band [Re_lo, Re_valid]."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d = 0.05248

    for beta in (0.5, 0.7):
        orif_d = beta * pipe_d
        ori = Orifice(f"Cont_{beta}", pipe_diameter=pipe_d, orifice_diameter=orif_d)
        re_valid = Orifice._re_valid(beta)
        re_lo = 0.4 * re_valid

        dp_prev = None
        deriv_prev = None
        n = 100
        rel_re_step = (re_valid - re_lo) / re_lo / n
        dp_tol = 2.0 * rel_re_step + 0.005
        deriv_tol = rel_re_step + 0.02
        for i in range(n + 1):
            re_pipe = re_lo + (re_valid - re_lo) * i / n
            q = flow_from_re(re_pipe, rho, mu, pipe_d)
            dp = ori.calculate_delta_p(q, rho, mu)
            deriv = ori.calculate_dp_derivative(q, rho, mu)
            assert dp > 0 and deriv > 0, f"beta={beta} Re={re_pipe}: dP={dp}, deriv={deriv} must be positive"
            if dp_prev is not None:
                assert abs(dp - dp_prev) / dp_prev < dp_tol, f"beta={beta} Re={re_pipe}: dP jump"
                assert abs(deriv - deriv_prev) / abs(deriv_prev) < deriv_tol, f"beta={beta} Re={re_pipe}: deriv jump"
            dp_prev = dp
            deriv_prev = deriv


def test_bidirectional_symmetry():
    """dP(-Q) = -dP(Q): antisymmetric pressure drop."""
    rho, mu = WATER_RHO, WATER_MU
    ori = Orifice("Bidi", pipe_diameter=0.05248, orifice_diameter=0.02)
    q = flow_from_re(1e5, rho, mu, 0.05248)
    dp_pos = ori.calculate_delta_p(q, rho, mu)
    dp_neg = ori.calculate_delta_p(-q, rho, mu)
    assert math.isclose(dp_neg, -dp_pos, rel_tol=1e-9)
    assert math.isclose(abs(dp_neg), abs(dp_pos), rel_tol=1e-9)


def legacy_dp(flow_rate, density, viscosity, pipe_d, orif_d):
    """Old orifice formula recomputed in the test."""
    beta_ratio = min(0.99, orif_d / pipe_d)
    area_pipe = math.pi * (pipe_d / 2.0) ** 2
    velocity = flow_rate / max(1e-9, area_pipe)
    dynamic_pressure = 0.5 * density * velocity * abs(velocity)
    area_orifice = math.pi * (orif_d / 2.0) ** 2
    v_orifice = flow_rate / max(1e-9, area_orifice)
    re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)
    cd = FluidProperties.get_orifice_cd(re_orifice)
    geometry_factor = (1 - beta_ratio ** 4) / (cd ** 2 * beta_ratio ** 4)
    return dynamic_pressure * geometry_factor * (1 - beta_ratio ** 2)


def legacy_deriv(flow_rate, density, viscosity, pipe_d, orif_d):
    """Old orifice analytic derivative recomputed in the test."""
    beta_ratio = min(0.99, orif_d / pipe_d)
    area_pipe = math.pi * (pipe_d / 2.0) ** 2
    area_orifice = math.pi * (orif_d / 2.0) ** 2
    v_orifice = flow_rate / max(1e-9, area_orifice)
    re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)
    re_safe = max(1e-6, re_orifice)
    cd_val = 0.60 / math.sqrt(1.0 + 250.0 / re_safe)
    c_const = 0.5 * density / (area_pipe ** 2) * (1 - beta_ratio ** 4) / (beta_ratio ** 4) * (1 - beta_ratio ** 2)
    if cd_val <= 0.05:
        return c_const / (0.05 ** 2) * 2.0 * abs(flow_rate)
    c_re_coeff = (density * (1.0 / area_orifice) * orif_d) / max(1e-7, viscosity)
    return c_const / 0.36 * (2.0 * abs(flow_rate) + 250.0 / c_re_coeff)


def test_legacy_model_unchanged():
    """classic_cd reproduces the old formula and derivative exactly."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d, orif_d = 0.05248, 0.01
    ori = Orifice("Legacy", pipe_diameter=pipe_d, orifice_diameter=orif_d, standard='classic_cd')

    for q in (0.0001, 0.001, 0.01, -0.001):
        dp_impl = ori.calculate_delta_p(q, rho, mu)
        dp_ref = legacy_dp(q, rho, mu, pipe_d, orif_d)
        assert math.isclose(dp_impl, dp_ref, rel_tol=1e-12, abs_tol=1e-20), \
            f"legacy dP mismatch at Q={q}: {dp_impl} vs {dp_ref}"

        deriv_impl = ori.calculate_dp_derivative(q, rho, mu)
        deriv_ref = legacy_deriv(q, rho, mu, pipe_d, orif_d)
        assert math.isclose(deriv_impl, deriv_ref, rel_tol=1e-12, abs_tol=1e-20), \
            f"legacy derivative mismatch at Q={q}: {deriv_impl} vs {deriv_ref}"


def test_standard_defaults_and_folding():
    """Default is iso_5167; invalid values fold back to the default."""
    ori = Orifice("Default")
    assert ori.standard == 'iso_5167'

    ori_bad = Orifice("Bad", standard='asme_mfc_3m')
    assert ori_bad.standard == 'iso_5167'

    ori_legacy = Orifice("Legacy", standard='classic_cd')
    assert ori_legacy.standard == 'classic_cd'


def test_network_solve():
    """Tank -> Pipe -> Orifice -> Pipe -> Tank converges with a positive orifice dP."""
    gs = GlobalSettings(fluid_type="water")
    t1 = Tank("Source", fluid_level=5.0, elevation=0.0, temperature=293.15, fluid_type="water")
    ori = Orifice("Restriction", pipe_diameter=0.05248, orifice_diameter=0.02)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0.0, temperature=293.15, fluid_type="water")

    nodes = {"t1": t1, "ori": ori, "t2": t2}
    edges = [
        {"id": "e1", "source": "t1", "target": "ori", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P1", 1.0, 0.05248)},
        {"id": "e2", "source": "ori", "target": "t2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P2", 1.0, 0.05248)}
    ]

    network = HydraulicNetwork(nodes=nodes, edges=edges)
    network.global_settings = gs
    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs

    solver = NetworkSolver(network)
    solver.solve()

    q = ori.inlets[0].flow_rate
    dp = ori.inlets[0].pressure - ori.outlets[0].pressure
    assert q > 0, "Orifice flow must be positive"
    assert dp > 0, "Orifice dP must be positive"


def test_graph_parser_orifice():
    node_data = ReactFlowNode(
        id="ori_node_1",
        type="orifice",
        position={"x": 10.0, "y": 20.0},
        data={
            "label": "Orifice 1",
            "pipe_diameter": 0.1,
            "orifice_diameter": 0.07,
            "standard": "classic_cd"
        }
    )
    parsed_node = GraphParser.create_node(node_data)
    assert isinstance(parsed_node, Orifice)
    assert parsed_node.pipe_diameter == 0.1
    assert parsed_node.orifice_diameter == 0.07
    assert parsed_node.standard == "classic_cd"

    node_data_default = ReactFlowNode(
        id="ori_node_2",
        type="orifice",
        position={"x": 0.0, "y": 0.0},
        data={"label": "Orifice 2", "pipe_diameter": 0.05248, "orifice_diameter": 0.02}
    )
    parsed_default = GraphParser.create_node(node_data_default)
    assert parsed_default.standard == 'iso_5167'
    print("GraphParser successfully created Orifice instance!")


def test_extract_telemetry_carries_solver_effective_geometry():
    """
    Regression for the OrificeDetails curve mismatch: telemetry must report the
    solver-effective pipe diameter (auto-detected from the connected pipe) and
    standard, so the frontend chart mirrors the same geometry as the solve.
    """
    from routers.simulation import extract_telemetry_dict

    gs = GlobalSettings(fluid_type="water")
    nodes = [
        ReactFlowNode(id="t1", type="tank", position={"x": 0, "y": 0},
                      data={"label": "Source", "level": 5.0, "elevation": 0.0, "temperature": 293.15}),
        ReactFlowNode(id="ori", type="orifice", position={"x": 0, "y": 0},
                      data={"label": "Orifice", "pipe_diameter": 0.05248, "orifice_diameter": 0.02,
                            "standard": "classic_cd"}),
        ReactFlowNode(id="t2", type="tank", position={"x": 0, "y": 0},
                      data={"label": "Sink", "level": 1.0, "elevation": 0.0, "temperature": 293.15}),
    ]
    edges = [
        ReactFlowEdge(id="e1", source="t1", target="ori", sourceHandle="outlet-0", targetHandle="inlet-0",
                      data={"diameter": 0.08}),
        ReactFlowEdge(id="e2", source="ori", target="t2", sourceHandle="outlet-0", targetHandle="inlet-0",
                      data={"diameter": 0.08}),
    ]
    graph = ReactFlowGraph(nodes=nodes, edges=edges, global_settings=gs)
    network = GraphParser.parse_graph(graph)

    ori = network.nodes["ori"]
    assert ori.pipe_diameter == 0.08, \
        "graph_parser must override the node default (0.05248) with the connected pipe diameter (0.08)"

    solver = NetworkSolver(network)
    solver.solve()
    telemetry = extract_telemetry_dict(network)
    ori_tel = telemetry["nodes"]["ori"]

    assert ori_tel["pipe_diameter"] == 0.08
    assert ori_tel["standard"] == "classic_cd"

    dp_tel = ori.inlets[0].pressure - ori.outlets[0].pressure
    dp_direct = ori.calculate_delta_p(ori.inlets[0].flow_rate, ori.inlets[0].density, ori.inlets[0].viscosity)
    assert math.isclose(dp_tel, dp_direct, rel_tol=1e-9), \
        "telemetry operating-point dP must match a direct calculation with the same effective geometry"


if __name__ == "__main__":
    test_rg_formula_roundtrip()
    test_high_re_analytic_limit()
    test_tap_dp_against_iso_flow_equation()
    test_formula7_loss_ratio()
    test_derivative_vs_numerical()
    test_continuity_across_blend_bands()
    test_bidirectional_symmetry()
    test_legacy_model_unchanged()
    test_standard_defaults_and_folding()
    test_network_solve()
    test_graph_parser_orifice()
    test_extract_telemetry_carries_solver_effective_geometry()
    print("All Orifice ISO 5167 tests passed successfully!")
