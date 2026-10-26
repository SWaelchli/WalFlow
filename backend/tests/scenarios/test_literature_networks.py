"""Whole networks against published solutions."""
import pytest
from physics_refs import G, pipe_end_total, solve_example

CFS = 0.028316846592     # m³/s per ft³/s
FT = 0.3048
PSI = 6894.757293168

EXAMPLE = "Example_Jeppson_7Pipe_Network"
PIPES = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]
# WalFlow draws p2, p3 and p5 against Jeppson's positive direction: its flow sign is the opposite
FLIP = {"p2": -1.0, "p3": -1.0, "p5": -1.0}
# Junction tee and the pipe end that sits on it: (junction node id, pipe id, "inlet" = the pipe's source end)
JUNCTION_END = {1: ("junction-1", "p1", "outlet"), 2: ("junction-2", "p2", "inlet"),
                3: ("junction-3", "p3", "outlet"), 4: ("junction-4", "p4", "inlet")}

# Jeppson, R.W. (1974), Steady Flow Analysis of Pipe Networks: An Instructional Manual, Utah State University,
# Ch. V, p. 48 (AFT Fathom Verification Case 63). Flows in ft³/s, head loss in ft (magnitude), heads in ft, psi gauge.
PROBLEM_2 = dict(
    flow=[0.533, 0.662, 1.338, 0.699, 0.639, -0.129, 0.828],
    loss=[1.306, 17.384, 15.563, 2.201, 8.127, 0.380, 13.474],
    head=[98.7, 81.3, 96.9, 99.1],
    psi=[8.10, 0.56, 7.32, 8.28],
)
PROBLEM_3 = dict(
    flow=[0.979, 0.680, 1.320, 0.527, 0.793, 0.300, 0.227],
    loss=[4.23, 18.32, 15.16, 1.28, 12.39, 1.88, 1.11],
)
JUNCTION_ELEVATION_FT = 80.0   # junctions sit at the model datum


@pytest.fixture(scope="module", params=[("Problem 2", PROBLEM_2), ("Problem 3", PROBLEM_3)],
                ids=["problem_2_pump_supply", "problem_3_three_reservoirs"])
def solved(request):
    prefix, published = request.param
    network, stats = solve_example(EXAMPLE, prefix)
    assert stats["success"] is True
    pipes = {e["id"]: e["pipe"] for e in network.edges}
    return network, pipes, published


def test_jeppson_flows_and_friction_losses(solved):
    network, pipes, published = solved
    demand = next(n for n in network.nodes.values() if n.node_type == "flow_source")
    assert abs(demand.outlets[0].flow_rate) / CFS == pytest.approx(2.0, abs=0.001)
    for pid, q_ref, loss_ref in zip(PIPES, published["flow"], published["loss"]):
        pipe = pipes[pid]
        q = pipe.inlets[0].flow_rate
        assert q * FLIP.get(pid, 1.0) / CFS == pytest.approx(q_ref, abs=0.01), pid
        # friction only: Jeppson's loss excludes the reservoir entrance term WalFlow adds on a tank outlet
        loss = pipe._friction_dp(q, pipe.inlets[0].density, pipe.inlets[0].viscosity)
        assert abs(loss) / (pipe.inlets[0].density * G) / FT == pytest.approx(abs(loss_ref), abs=0.15), pid


def test_jeppson_problem_2_junction_heads_and_pressures():
    network, stats = solve_example(EXAMPLE, "Problem 2")
    assert stats["success"] is True
    pipes = {e["id"]: e["pipe"] for e in network.edges}
    atm = 101325.0   # atmospheric_pressure of the example
    for i, (jid, pid, end) in enumerate(JUNCTION_END.values()):
        pipe = pipes[pid]
        port = pipe.inlets[0] if end == "inlet" else pipe.outlets[0]
        gauge = pipe_end_total(pipe, port, network.nodes[jid]) - atm   # Jeppson neglects velocity head
        rho = port.density
        assert JUNCTION_ELEVATION_FT + gauge / (rho * G) / FT == pytest.approx(PROBLEM_2["head"][i], abs=0.2), jid
        assert gauge / PSI == pytest.approx(PROBLEM_2["psi"][i], abs=0.1), jid
