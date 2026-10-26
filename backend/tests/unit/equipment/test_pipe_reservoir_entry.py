"""Velocity head where fluid leaves a reservoir (tank or pressure source) into a pipe.

Tanks and pressure sources hold fluid at rest. Leaving one, the fluid accelerates to the pipe
velocity and pays the entrance loss, so the static pressure at the pipe end is
P - (1 + K) rho v² / 2 with K = 0.5. Entering one, the kinetic energy is lost in the vessel
(exit loss K = 1) and the static pressure at the pipe end equals the reservoir pressure.
"""
import math

import pytest

from physics_refs import bisect_flow, darcy_friction, pipe_dp, reservoir_entry_dp, reservoir_pipe_flow, solve
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.reducer import Reducer
from simulation.equipment.tank import Tank
from simulation.fluid_utils import FluidProperties
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

RHO = FluidProperties.get_density("water", 293.15)
MU = FluidProperties.get_viscosity("water", 293.15)
ROUGH = 0.000045
TOL = 1e-2   # Churchill (code) vs Colebrook (reference) friction factor, as in test_pipe_friction
D50, D80 = 0.05248, 0.07792
ATM = 101325.0


def _boundary(kind, pressure_pa):
    if kind == "source":
        return PressureSource(name="Supply", source_pressure=pressure_pa, temperature=293.15)
    return Tank(name="Supply", fluid_level=(pressure_pa - ATM) / (RHO * 9.81), temperature=293.15)


@pytest.mark.parametrize("kind", ["source", "tank"])
def test_flow_out_of_reservoir_pays_entry_velocity_head(kind):
    """Reservoir (0.5 bar above the sink) -> 10 m DN50 -> tank: entry + friction take the whole 0.5 bar."""
    NetworkSolver.clear_warm_start_cache()
    nodes = {"src": _boundary(kind, ATM + 50000.0), "tank": Tank(name="Sink", fluid_level=0.0)}
    edges = [{"source": "src", "target": "tank", "pipe": Pipe("p1", 10.0, D50, ROUGH)}]
    stats = solve(nodes, edges)
    assert stats["success"] is True, stats.get("error")

    q_ref = reservoir_pipe_flow(50000.0, 10.0, D50, ROUGH, RHO, MU)
    assert edges[0]["pipe"].inlets[0].flow_rate == pytest.approx(q_ref, rel=TOL)


def test_entry_term_follows_the_flow_direction():
    """An edge drawn against the flow (from the low to the high tank) gives the same flow, reversed."""
    def run(reverse):
        NetworkSolver.clear_warm_start_cache()
        nodes = {"hi": Tank(name="High", fluid_level=5.0), "lo": Tank(name="Low", fluid_level=0.0)}
        src, tgt = ("lo", "hi") if reverse else ("hi", "lo")
        edges = [{"source": src, "target": tgt, "pipe": Pipe("p1", 10.0, D50, ROUGH)}]
        stats = solve(nodes, edges)
        assert stats["success"] is True, stats.get("error")
        return edges[0]["pipe"].inlets[0].flow_rate

    q_ref = reservoir_pipe_flow(RHO * 9.81 * 5.0, 10.0, D50, ROUGH, RHO, MU)
    assert run(reverse=False) == pytest.approx(q_ref, rel=TOL)
    assert run(reverse=True) == pytest.approx(-q_ref, rel=TOL)


def _expander_dp(q):
    """Static drop across the 2"x3" expander: Crane TP 410 gradual enlargement (theta = 18.2 deg),
    friction over the 89 mm transition, and the Bernoulli recovery rho (v2² - v1²) / 2."""
    a1, a2 = math.pi * D50 ** 2 / 4.0, math.pi * D80 ** 2 / 4.0
    v1, v2 = q / a1, q / a2
    beta = D50 / D80
    k_exp = 2.6 * math.sin(math.radians(18.2) / 2.0) * (1.0 - beta ** 2) ** 2
    d_avg = (D50 + D80) / 2.0
    v_avg = q / (math.pi * d_avg ** 2 / 4.0)
    k_fric = darcy_friction(RHO * v_avg * d_avg / MU, ROUGH / d_avg) * 0.089 / d_avg
    return k_exp * RHO * v1 ** 2 / 2.0 + k_fric * RHO * v_avg ** 2 / 2.0 + RHO * (v2 ** 2 - v1 ** 2) / 2.0


@pytest.mark.parametrize("kind", ["source", "tank"])
@pytest.mark.parametrize("up_len", [0.1, 0.5, 1.0, 2.0, 5.0])
def test_expander_between_reservoirs_with_short_pipes(kind, up_len):
    """Reservoir -> short DN50 -> expander 2"x3" -> 0.1 m DN80 -> tank. Without the entry velocity head the
    expander's recovery outweighs the losses and no steady state exists (roadmap: expander solvability)."""
    NetworkSolver.clear_warm_start_cache()
    dp_avail = 50000.0
    exp = Reducer(name="Exp_2x3", diameter_in=D50, diameter_out=D80, length=0.089, cone_angle_deg=18.2, roughness=ROUGH)
    nodes = {"src": _boundary(kind, ATM + dp_avail), "exp": exp, "tank": Tank(name="Sink", fluid_level=0.0)}
    edges = [
        {"source": "src", "target": "exp", "pipe": Pipe("p1", up_len, D50, ROUGH)},
        {"source": "exp", "target": "tank", "pipe": Pipe("p2", 0.1, D80, ROUGH)},
    ]
    stats = solve(nodes, edges)
    assert stats["success"] is True, stats.get("error")

    def total_dp(q):
        return (reservoir_entry_dp(q, D50, RHO) + pipe_dp(q, up_len, D50, ROUGH, RHO, MU)
                + _expander_dp(q) + pipe_dp(q, 0.1, D80, ROUGH, RHO, MU))

    assert exp.inlets[0].flow_rate == pytest.approx(bisect_flow(total_dp, dp_avail), rel=TOL)


def test_network_marks_reservoir_pipe_ends_without_a_solver():
    """The flags follow the topology when the network is built, so a pipe evaluated outside the solver
    gives the same dp; rebuilding the network after a node change resets them."""
    exp = Reducer(name="Exp", diameter_in=D50, diameter_out=D80, length=0.089, cone_angle_deg=18.2)
    p1, p2 = Pipe("p1", 1.0, D50, ROUGH), Pipe("p2", 1.0, D80, ROUGH)
    nodes = {"src": _boundary("source", ATM + 50000.0), "exp": exp, "tank": Tank(name="Sink", fluid_level=0.0)}
    edges = [{"source": "src", "target": "exp", "pipe": p1}, {"source": "exp", "target": "tank", "pipe": p2}]
    HydraulicNetwork(nodes=nodes, edges=edges)
    assert (p1.inlet_at_reservoir, p1.outlet_at_reservoir) == (True, False)
    assert (p2.inlet_at_reservoir, p2.outlet_at_reservoir) == (False, True)

    nodes["src"] = Reducer(name="Junction", diameter_in=D50, diameter_out=D50, length=0.1)
    HydraulicNetwork(nodes=nodes, edges=edges)
    assert p1.inlet_at_reservoir is False


def test_entry_term_derivative_matches_finite_difference():
    pipe = Pipe("p1", 0.5, D50, ROUGH)
    pipe.inlet_at_reservoir = True
    pipe.outlet_at_reservoir = True
    dq = 1e-7
    for q in (-0.01, -0.002, 0.002, 0.01):
        numeric = (pipe.calculate_delta_p(q + dq, RHO, MU) - pipe.calculate_delta_p(q - dq, RHO, MU)) / (2 * dq)
        assert pipe.calculate_dp_derivative(q, RHO, MU) == pytest.approx(numeric, rel=1e-3)


@pytest.mark.parametrize("q, at_inlet, at_outlet, active", [
    (0.005, True, False, True),     # leaves the inlet-side reservoir
    (0.005, False, True, False),    # enters the outlet-side reservoir: no entry term
    (-0.005, False, True, True),    # reverse flow leaves the outlet-side reservoir
    (-0.005, True, False, False),   # reverse flow enters the inlet-side reservoir
])
def test_entry_term_only_where_flow_leaves_a_reservoir(q, at_inlet, at_outlet, active):
    plain = Pipe("plain", 2.0, D50, ROUGH)
    pipe = Pipe("p1", 2.0, D50, ROUGH)
    pipe.inlet_at_reservoir, pipe.outlet_at_reservoir = at_inlet, at_outlet
    extra = pipe.calculate_delta_p(q, RHO, MU) - plain.calculate_delta_p(q, RHO, MU)
    expected = math.copysign(reservoir_entry_dp(q, D50, RHO), q) if active else 0.0
    assert extra == pytest.approx(expected, rel=1e-9, abs=1e-9)


@pytest.mark.parametrize("q, at_inlet, at_outlet", [
    pytest.param(0.005, False, False, id="node_to_node_forward"),
    pytest.param(0.005, True, False, id="reservoir_to_node_forward"),
    pytest.param(0.005, False, True, id="node_to_reservoir_forward"),
    pytest.param(0.005, True, True, id="reservoir_to_reservoir_forward"),
    pytest.param(-0.005, False, False, id="node_to_node_reverse"),
    pytest.param(-0.005, True, False, id="node_to_reservoir_reverse"),
    pytest.param(-0.005, False, True, id="reservoir_to_node_reverse"),
    pytest.param(-0.005, True, True, id="reservoir_to_reservoir_reverse"),
])
def test_stagnation_drop_adds_entry_and_exit_loss_to_friction(q, at_inlet, at_outlet):
    """The solve works on total pressure: between two nodes the drop is friction alone (the velocity head is
    carried by the node total); leaving a reservoir it adds the entrance loss K rho v² / 2 (K = 0.5), entering one
    the exit loss rho v² / 2. Its derivative is the central difference of the drop."""
    pipe = Pipe("p1", 2.0, D50, ROUGH)
    pipe.inlet_at_reservoir, pipe.outlet_at_reservoir = at_inlet, at_outlet
    leaving_reservoir, entering_reservoir = (at_inlet, at_outlet) if q > 0 else (at_outlet, at_inlet)
    head = RHO * (q / (math.pi * D50 ** 2 / 4.0)) ** 2 / 2.0
    expected = math.copysign(pipe_dp(q, 2.0, D50, ROUGH, RHO, MU) + head * (0.5 * leaving_reservoir + 1.0 * entering_reservoir), q)
    assert pipe.stagnation_delta_p(q, RHO, MU) == pytest.approx(expected, rel=TOL)
    dq = 1e-7
    numeric = (pipe.stagnation_delta_p(q + dq, RHO, MU) - pipe.stagnation_delta_p(q - dq, RHO, MU)) / (2 * dq)
    assert pipe.stagnation_dp_derivative(q, RHO, MU) == pytest.approx(numeric, rel=1e-3)


def test_only_the_entrance_loss_heats_the_fluid():
    """Acceleration from rest is reversible; only K rho v² / 2 (and friction) becomes heat."""
    q = 0.01
    pipe = Pipe("p1", 2.0, D50, ROUGH)
    pipe.inlet_at_reservoir = True
    pipe.inlets[0].flow_rate = q
    pipe.inlets[0].temperature, pipe.inlets[0].density, pipe.inlets[0].viscosity = 293.15, RHO, MU
    pipe.calculate()

    cp = FluidProperties.get_specific_heat("water", 293.15)
    v = q / (math.pi * D50 ** 2 / 4.0)
    dissipated = pipe_dp(q, 2.0, D50, ROUGH, RHO, MU) + 0.5 * RHO * v ** 2 / 2.0
    assert pipe.outlets[0].temperature - 293.15 == pytest.approx(dissipated / (RHO * cp), rel=TOL)
