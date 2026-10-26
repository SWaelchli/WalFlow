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


# Jeppson, R.W. (1974), Steady Flow Analysis of Pipe Networks: An Instructional Manual, Utah State University,
# Ch. VI, example problem 3 (network figure p. 71, solution table p. 70): 48 pipes. Flow in ft³/s, friction loss in ft
# (magnitudes). p16, p22 and p33 are drawn against the published direction, so their WalFlow flow is negative.
PROBLEM_3_48_PIPE = {
    1: (19.80, 10.59), 2: (10.37, 2.97), 3: (4.89, 0.69), 4: (4.00, 24.57), 5: (2.66, 0.22),
    6: (4.13, 17.43), 7: (4.44, 10.04), 8: (4.60, 16.17), 9: (13.67, 11.30), 10: (2.40, 3.01),
    11: (4.07, 16.90), 12: (6.07, 2.29), 13: (1.64, 2.86), 14: (1.11, 1.01), 15: (5.47, 0.86),
    16: (1.60, 4.10), 17: (0.40, 0.10), 18: (1.33, 1.45), 19: (2.83, 0.52), 20: (4.83, 1.02),
    21: (4.07, 12.69), 22: (2.59, 10.46), 23: (1.41, 1.07), 24: (3.07, 7.29), 25: (3.11, 15.00),
    26: (3.07, 7.28), 27: (2.57, 5.16), 28: (6.98, 61.39), 29: (2.48, 0.81), 30: (8.02, 7.89),
    31: (10.26, 1.46), 32: (12.26, 5.16), 33: (2.94, 6.73), 34: (1.06, 0.92), 35: (17.21, 8.03),
    36: (0.63, 0.05), 37: (8.06, 5.99), 38: (11.69, 2.82), 39: (4.50, 1.53), 40: (12.03, 13.17),
    41: (12.55, 9.54), 42: (8.16, 4.90), 43: (29.73, 17.75), 44: (26.58, 9.48), 45: (19.58, 7.77),
    46: (2.48, 6.41), 47: (4.96, 25.04), 48: (9.74, 2.63),
}
AGAINST_PUBLISHED_DIRECTION = {"p16", "p22", "p33"}


def test_jeppson_48_pipe_network_flows_and_friction_losses():
    network, stats = solve_example("Example_Jeppson_48Pipe_Network", "Problem 3")
    assert stats["success"] is True
    pipes = {e["id"]: e["pipe"] for e in network.edges}
    assert {f"p{i}" for i in PROBLEM_3_48_PIPE} <= set(pipes)
    for i, (q_ref, hf_ref) in PROBLEM_3_48_PIPE.items():
        pid = f"p{i}"
        pipe = pipes[pid]
        q = pipe.inlets[0].flow_rate
        assert (q < 0) == (pid in AGAINST_PUBLISHED_DIRECTION), pid
        assert abs(q) / CFS == pytest.approx(q_ref, abs=0.03), pid
        loss = pipe._friction_dp(q, pipe.inlets[0].density, pipe.inlets[0].viscosity)
        assert abs(loss) / (pipe.inlets[0].density * G) / FT == pytest.approx(hf_ref, rel=0.01, abs=0.05), pid
