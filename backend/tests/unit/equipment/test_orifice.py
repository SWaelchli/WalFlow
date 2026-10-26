import math

import pytest

from simulation.equipment.orifice import Orifice
from simulation.fluid_utils import FluidProperties
from simulation.schemas import ReactFlowNode, ReactFlowEdge, ReactFlowGraph, GlobalSettings
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
    """The RG implementation matches an independent reimplementation to rel 1e-9.
    _cd_rg_iso5167 returns C_d (discharge coefficient), not the meter coefficient."""
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


@pytest.mark.parametrize("orif_d, cm_gap", [
    pytest.param(0.02, None, id="beta-0.38-tap-dp"),
    # at beta ~ 0.7 r(C_d) and r(C_m) differ by ~9 %, so a wrong coefficient in Formula (7) shows
    pytest.param(0.036736, 0.05, id="beta-0.7-formula7-uses-cd"),
])
def test_orifice_permanent_loss_against_iso5167(orif_d, cm_gap):
    """Tap dP follows the ISO 5167 flow equation dp_tap = 0.5*rho*Q^2*(1-beta^4) / (Ao^2*Cd^2)
    and the permanent loss is dp_tap * r with r from Formula (7) evaluated with C_d (not C_m)."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d = 0.05248
    beta_eff = min(0.75, max(0.1, orif_d / pipe_d))
    area_orifice = math.pi * (orif_d / 2.0) ** 2
    ori = Orifice("Loss", pipe_diameter=pipe_d, orifice_diameter=orif_d)

    re_pipe = 1e5  # fully turbulent, w = 1
    q = flow_from_re(re_pipe, rho, mu, pipe_d)
    c_d = Orifice._cd_rg_iso5167(beta_eff, pipe_d, re_pipe)
    r_correct = rg_loss_ratio(c_d, beta_eff)

    if cm_gap is not None:
        c_m = c_d / math.sqrt(1.0 - beta_eff ** 4)
        r_wrong = rg_loss_ratio(c_m, beta_eff)
        assert abs(r_correct - r_wrong) / r_correct > cm_gap

    dp = ori.calculate_delta_p(q, rho, mu)
    dp_tap_expected = 0.5 * rho * q * abs(q) * (1 - beta_eff**4) / (area_orifice ** 2 * c_d ** 2)
    assert math.isclose(dp / r_correct, dp_tap_expected, rel_tol=1e-4)
    assert math.isclose(dp / dp_tap_expected, r_correct, rel_tol=1e-4)






def test_continuity_across_blend_bands():
    """No jumps in dP across the blend band [Re_lo, Re_valid]."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d = 0.05248

    for beta in (0.5, 0.7):
        orif_d = beta * pipe_d
        ori = Orifice(f"Cont_{beta}", pipe_diameter=pipe_d, orifice_diameter=orif_d)
        re_valid = Orifice._re_valid(beta)
        re_lo = 0.4 * re_valid

        dp_prev = None
        n = 100
        rel_re_step = (re_valid - re_lo) / re_lo / n
        dp_tol = 2.0 * rel_re_step + 0.005
        for i in range(n + 1):
            re_pipe = re_lo + (re_valid - re_lo) * i / n
            q = flow_from_re(re_pipe, rho, mu, pipe_d)
            dp = ori.calculate_delta_p(q, rho, mu)
            assert dp > 0, f"beta={beta} Re={re_pipe}: dP={dp} must be positive"
            if dp_prev is not None:
                assert abs(dp - dp_prev) / dp_prev < dp_tol, f"beta={beta} Re={re_pipe}: dP jump"
            dp_prev = dp


@pytest.mark.parametrize("re_pipe, in_iso_range", [
    pytest.param(9100.0, True, id="above-16000-beta-sq"),
    pytest.param(8500.0, False, id="below-16000-beta-sq"),
])
def test_reynolds_limit_above_beta_056_is_16000_beta_squared(re_pipe, in_iso_range):
    """beta 0.75: ISO 5167-2:2022 5.3.1 limit is 16000*beta^2 = 9000, not a flat 16000. Above it the
    meter is the pure Reader-Harris/Gallagher value (no viscous blend) and no Reynolds issue is reported."""
    rho, mu, pipe_d, beta = WATER_RHO, WATER_MU, 0.05248, 0.75
    orif_d = beta * pipe_d
    ori = Orifice("D26", pipe_diameter=pipe_d, orifice_diameter=orif_d)
    issues = [i for i in ori.iso_validity_issues(re_pipe) if "Re_D" in i]
    assert (issues == []) is in_iso_range
    if in_iso_range:
        q = flow_from_re(re_pipe, rho, mu, pipe_d)
        c_d = rg_c(beta, pipe_d, re_pipe)
        tap = 0.5 * rho * q * q * (1 - beta ** 4) / ((math.pi * orif_d ** 2 / 4) ** 2 * c_d ** 2)
        assert math.isclose(ori.calculate_delta_p(q, rho, mu), tap * rg_loss_ratio(c_d, beta), rel_tol=1e-9)


def _calibrated_restriction(pipe_d, orif_d):
    from simulation.equipment.calibrated_restriction import CalibratedRestriction
    node = CalibratedRestriction("CR", restriction_model="orifice", fluid_type="water")
    node.pipe_diameter = pipe_d
    node._ensure_calibrated()
    node.eq_diameter = orif_d  # the formula is under test, not the bisection that picks the bore
    return node


def _check_valve_orifice(pipe_d, orif_d):
    from simulation.equipment.check_valve_orifice import CheckValveOrifice
    node = CheckValveOrifice("CVO", cv=10.0, cracking_pressure_bar=0.0, pipe_diameter=pipe_d, orifice_diameter=orif_d)
    return node


def _rupture_disc(pipe_d, orif_d):
    from simulation.equipment.rupture_disc import RuptureDisc
    return RuptureDisc("RD", burst_pressure_barg=10.0, bore_type="reduced_bore", pipe_diameter=pipe_d,
                       orifice_diameter=orif_d)


@pytest.mark.parametrize("build, drop", [
    pytest.param(lambda D, d: Orifice("O", pipe_diameter=D, orifice_diameter=d, standard="classic_cd"),
                 lambda n, q, r, m: n.calculate_delta_p(q, r, m), id="orifice-classic_cd"),
    pytest.param(_calibrated_restriction, lambda n, q, r, m: n.calculate_delta_p(q, r, m),
                 id="calibrated_restriction"),
    pytest.param(_check_valve_orifice, lambda n, q, r, m: n._calculate_orifice_dp(q, r, m),
                 id="check_valve_orifice"),
    pytest.param(_rupture_disc, lambda n, q, r, m: n.open_dp(q, r, m), id="rupture_disc-reduced_bore"),
])
def test_permanent_loss_is_tap_dp_times_formula_7(build, drop):
    """Water 20 C, beta 0.5, turbulent: drop = tap differential * ISO 5167-2 Formula (7) ratio with C_d."""
    rho, mu, pipe_d, beta = WATER_RHO, WATER_MU, 0.05248, 0.5
    orif_d = beta * pipe_d
    q = flow_from_re(1e5, rho, mu, pipe_d)
    cd = FluidProperties.get_orifice_cd(rho * (q / (math.pi * orif_d ** 2 / 4)) * orif_d / mu)
    tap = 0.5 * rho * q * q * (1 - beta ** 4) / ((math.pi * orif_d ** 2 / 4) ** 2 * cd ** 2)
    assert math.isclose(drop(build(pipe_d, orif_d), q, rho, mu), tap * rg_loss_ratio(cd, beta), rel_tol=1e-9)


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
    return dynamic_pressure * geometry_factor * rg_loss_ratio(cd, beta_ratio)


def test_classic_cd_model_is_tanh_cd_with_formula_7():
    """classic_cd: dP follows the tanh Cd(Re) law times the ISO 5167-2 Formula (7) permanent-loss ratio."""
    rho, mu = WATER_RHO, WATER_MU
    pipe_d, orif_d = 0.05248, 0.01
    ori = Orifice("Legacy", pipe_diameter=pipe_d, orifice_diameter=orif_d, standard='classic_cd')

    for q in (0.0001, 0.001, 0.01, -0.001):
        dp_impl = ori.calculate_delta_p(q, rho, mu)
        dp_ref = legacy_dp(q, rho, mu, pipe_d, orif_d)
        assert math.isclose(dp_impl, dp_ref, rel_tol=1e-12, abs_tol=1e-20), \
            f"legacy dP mismatch at Q={q}: {dp_impl} vs {dp_ref}"


def test_outlet_properties_belong_to_the_warmed_outlet_temperature():
    """Throttling warms the leaving stream: its density and viscosity are those of the warmed temperature,
    not of the inlet (a stale copy left the outlet ~0.5 K off its own temperature)."""
    ori = Orifice("Warm", pipe_diameter=0.05248, orifice_diameter=0.005)
    ori.global_settings = GlobalSettings(fluid_type="iso_vg_46")
    inlet, outlet = ori.inlets[0], ori.outlets[0]
    inlet.flow_rate, inlet.pressure, inlet.temperature = 1e-3, 60e5, 300.0
    inlet.density = FluidProperties.get_density("iso_vg_46", 300.0)
    inlet.viscosity = FluidProperties.get_viscosity("iso_vg_46", 300.0)
    ori.calculate()
    assert outlet.temperature - inlet.temperature > 0.2  # the row only means something with real warming
    assert outlet.density == pytest.approx(FluidProperties.get_density("iso_vg_46", outlet.temperature), rel=1e-12)
    assert outlet.viscosity == pytest.approx(FluidProperties.get_viscosity("iso_vg_46", outlet.temperature), rel=1e-12)


def test_standard_defaults_and_folding():
    """Default is iso_5167; invalid values fold back to the default."""
    ori = Orifice("Default")
    assert ori.standard == 'iso_5167'

    ori_bad = Orifice("Bad", standard='asme_mfc_3m')
    assert ori_bad.standard == 'iso_5167'

    ori_legacy = Orifice("Legacy", standard='classic_cd')
    assert ori_legacy.standard == 'classic_cd'




def test_graph_parser_orifice():
    node_data = ReactFlowNode(
        id="ori_node_1",
        type="orifice",
        position={"x": 10.0, "y": 20.0},
        data={
            "label": "Orifice 1",
            "pipe_diameter_m": 0.1,
            "orifice_diameter_m": 0.07,
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
        data={"label": "Orifice 2", "pipe_diameter_m": 0.05248, "orifice_diameter_m": 0.02}
    )
    parsed_default = GraphParser.create_node(node_data_default)
    assert parsed_default.standard == 'iso_5167'


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
                      data={"label": "Source", "level_m": 5.0, "elevation_m": 0.0, "temperature_k": 293.15}),
        ReactFlowNode(id="ori", type="orifice", position={"x": 0, "y": 0},
                      data={"label": "Orifice", "pipe_diameter_m": 0.05248, "orifice_diameter_m": 0.02,
                            "standard": "classic_cd"}),
        ReactFlowNode(id="t2", type="tank", position={"x": 0, "y": 0},
                      data={"label": "Sink", "level_m": 1.0, "elevation_m": 0.0, "temperature_k": 293.15}),
    ]
    edges = [
        ReactFlowEdge(id="e1", source="t1", target="ori", sourceHandle="outlet-0", targetHandle="inlet-0",
                      data={"diameter_m": 0.08}),
        ReactFlowEdge(id="e2", source="ori", target="t2", sourceHandle="outlet-0", targetHandle="inlet-0",
                      data={"diameter_m": 0.08}),
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
    assert math.isclose(dp_tel, dp_direct, rel_tol=1e-7), \
        "telemetry operating-point dP must match a direct calculation with the same effective geometry"


if __name__ == "__main__":
    test_rg_formula_roundtrip()
    test_high_re_analytic_limit()
    test_orifice_permanent_loss_against_iso5167(0.02, None)
    test_continuity_across_blend_bands()
    test_bidirectional_symmetry()
    test_classic_cd_model_is_tanh_cd_with_formula_7()
    test_standard_defaults_and_folding()
    test_network_solve()
    test_graph_parser_orifice()
    test_extract_telemetry_carries_solver_effective_geometry()
