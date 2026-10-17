"""F1-11: Newton and Levenberg–Marquardt are interchangeable; the fallback is held to the same checks."""
import pytest

pytestmark = pytest.mark.audit("F1-11")

import pytest

from physics_refs import solve_example

CASES = [
    ("Example_Multi_PSV_Protection", "Case 1"),
    ("Example_Pump_Comparison", None),
    ("Example_Large_Reference_Network", "Case 1"),
    ("Example_Pressure_Regulation", None),
]


@pytest.mark.parametrize("example,case", CASES)
def test_lm_solves_the_examples_newton_solves(example, case):
    # Audit: 'lm' failed on Multi_PSV, Pump_Comparison and the large reference network
    net_n, stats_n = solve_example(example, case, solver_method="sparse_newton")
    net_l, stats_l = solve_example(example, case, solver_method="lm")
    assert stats_n["success"] and stats_l["success"], stats_l["error"]
    for nid, n in net_n.nodes.items():
        if not n.outlets:
            continue
        m = net_l.nodes[nid]
        assert m.outlets[0].flow_rate == pytest.approx(n.outlets[0].flow_rate, rel=5e-3, abs=2e-6)   # 0.12 L/min
        if abs(n.outlets[0].flow_rate) > 1e-6:       # the pressure of a stagnant, floating branch is not defined
            assert m.outlets[0].pressure == pytest.approx(n.outlets[0].pressure, rel=2e-3, abs=2000.0)    # 0.02 bar


def test_non_physical_newton_result_is_replaced_by_a_physical_one_when_available():
    # The check that gated only the Newton branch also applies to the LM result: a physical,
    # converged solution is never swapped for an unphysical one (regression on the selection logic)
    net, stats = solve_example("Example_Parallel_Pumps")
    assert stats["success"] and stats["physical_validity"]["valid"]
    for n in net.nodes.values():
        if n.node_type in ("centrifugal_pump", "volumetric_pump") and n.active:
            assert n.inlets[0].flow_rate >= 0.0
