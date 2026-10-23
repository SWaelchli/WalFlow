
import pytest

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver
from simulation.fluid_utils import FluidProperties

def run_test(name, gs, t1_elev, t2_elev, expect_forward):
    
    # Setup: Tank -> Orifice -> Tank
    t1 = Tank("Tank1", elevation=t1_elev, fluid_level=0.0, fluid_type=gs.fluid_type, temperature=293.15)
    t2 = Tank("Tank2", elevation=t2_elev, fluid_level=0.0, fluid_type=gs.fluid_type, temperature=293.15)
    
    ori = Orifice("Restriction", pipe_diameter=0.05, orifice_diameter=0.005)
    
    nodes = {"t1": t1, "t2": t2, "ori": ori}
    edges = [
        {"id": "e1", "source": "t1", "target": "ori", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P1", 1.0, 0.05)},
        {"id": "e2", "source": "ori", "target": "t2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    network.global_settings = gs
    for node in nodes.values():
        node.global_settings = gs
    for edge in edges:
        edge["pipe"].global_settings = gs
    
    solver = NetworkSolver(network)
    solver.solve()
    
    q = ori.inlets[0].flow_rate
    t_in = ori.inlets[0].temperature
    t_out = ori.outlets[0].temperature

    # Isenthalpic throttling of an incompressible fluid: dT = dp / (rho * cp), with dp the orifice's own pressure loss at the solved flow, evaluated at the upstream state
    t_up = 293.15
    dt_ref = abs(ori.calculate_delta_p(q, ori.inlets[0].density, ori.inlets[0].viscosity)) / (FluidProperties.get_density(gs.fluid_type, t_up) * FluidProperties.get_specific_heat(gs.fluid_type, t_up))
    assert dt_ref > 0.01  # the case must actually throttle, otherwise the check below proves nothing

    if expect_forward:
        assert q > 0
        assert t_in == pytest.approx(t_up, abs=1e-3)       # upstream port keeps the tank temperature
        assert t_out - t_in == pytest.approx(dt_ref, rel=1e-3)
    else:
        assert q < 0
        assert t_out == pytest.approx(t_up, abs=1e-3)      # upstream is now the outlet port
        assert t_in - t_out == pytest.approx(dt_ref, rel=1e-3)

@pytest.mark.parametrize("t1_elev, t2_elev, expect_forward", [
    # Tank1 above Tank2: flow runs inlet to outlet and the outlet port gets the throttling heat
    pytest.param(1000.0, 0.0, True, id="forward-flow-heats-the-outlet"),
    # Tank2 above Tank1: flow runs outlet to inlet and the inlet port gets the throttling heat
    pytest.param(0.0, 1000.0, False, id="reverse-flow-heats-the-inlet"),
])
def test_throttling_heats_the_downstream_port(t1_elev, t2_elev, expect_forward):
    run_test("Throttling Heat", GlobalSettings(fluid_type="iso_vg_46"), t1_elev, t2_elev, expect_forward)
