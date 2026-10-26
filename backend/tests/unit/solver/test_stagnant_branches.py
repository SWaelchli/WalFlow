"""Pressure in stagnant branches (ROADMAP "Undefined Pressure in Stagnant Branches").

A section shut in by blocking devices (stopped PD pump, closed check valve, closed relief device) carries no
flow and has no pressure reference, so the hydraulic equations leave its pressure free. It is set from the
strongest leak path out of the section (stopped pump to its suction, then check valve, then relief device
seat), held where no check valve would open and no relief device would lift, and its ports are flagged."""
import pytest

from physics_refs import solve
from simulation.equipment.base_node import total_of
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.check_valve import CheckValve
from simulation.equipment.check_valve_orifice import CheckValveOrifice
from simulation.equipment.flow_source import FlowSource
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.equipment.mixer import Mixer
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.splitter import Splitter
from simulation.equipment.tank import Tank
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.fluid_utils import FluidProperties
from simulation.schemas import GlobalSettings, HydraulicNetwork
from simulation.solver import NetworkSolver, run_sequential_relief_simulation

ID = 0.05
HEADER_PA = 400_000.0
METHODS = ("sparse_newton", "lm")


def standby_branch(with_pump=True, psv_set_barg=10.0):
    """Header (4 bara) -> consumer, with a branch teed into it through a check valve.
    The branch: suction tank (2 m level) -> stopped PD pump -> tee -> PSV back to the tank, and tee -> check valve -> header.
    Without the pump the tee is a dead leg bounded only by the check valve and the PSV."""
    nodes = {
        "suction": Tank("Suction", fluid_level=2.0),
        "tee": Splitter("Discharge tee"),
        "psv": PressureSafetyValve("PSV", set_pressure_barg=psv_set_barg, valve_type="balanced_bellows"),
        "nrv": CheckValve("NRV"),
        "header": PressureSource("Header", source_pressure=HEADER_PA),
        "mix": Mixer("Header tee"),
        "consumer": LinearControlValve("Consumer", max_cv=2.0, opening_pct=50.0),
        "return": Tank("Return", fluid_level=0.0),
    }
    edges = [
        {"id": "e_relief", "source": "tee", "target": "psv", "source_port": "outlet-0", "pipe": Pipe("relief inlet", 1, ID)},
        {"id": "e_relief_out", "source": "psv", "target": "suction", "pipe": Pipe("relief outlet", 1, ID)},
        {"id": "e_nrv", "source": "tee", "target": "nrv", "source_port": "outlet-1", "pipe": Pipe("to NRV", 1, ID)},
        {"id": "e_nrv_out", "source": "nrv", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("NRV outlet", 1, ID)},
        {"id": "e_header", "source": "header", "target": "mix", "target_port": "inlet-0", "pipe": Pipe("header", 1, ID)},
        {"id": "e_mix", "source": "mix", "target": "consumer", "pipe": Pipe("to consumer", 1, ID)},
        {"id": "e_return", "source": "consumer", "target": "return", "pipe": Pipe("return", 1, ID)},
    ]
    if with_pump:
        pump = VolumetricPump("Standby pump", flow_rated=30.0 / 60000.0, motor_power=3000.0, efficiency=0.85)
        pump.active = False
        nodes["pump"] = pump
        edges += [
            {"id": "e_suction", "source": "suction", "target": "pump", "pipe": Pipe("suction", 1, ID)},
            {"id": "e_discharge", "source": "pump", "target": "tee", "pipe": Pipe("discharge", 1, ID)},
        ]
    return nodes, edges


def solved(method="sparse_newton", **kw):
    NetworkSolver.clear_warm_start_cache()
    nodes, edges = standby_branch(**kw)
    stats = solve(nodes, edges, solver_method=method)
    assert stats["success"], stats.get("error")
    return nodes, {e["id"]: e["pipe"] for e in edges}


def section_ports(nodes, pipes, with_pump=True):
    ports = [*nodes["tee"].inlets, *nodes["tee"].outlets, nodes["psv"].inlets[0], nodes["nrv"].inlets[0]]
    names = ["e_relief", "e_nrv"] + (["e_discharge"] if with_pump else [])
    ports += [p for n in names for p in (*pipes[n].inlets, *pipes[n].outlets)]
    if with_pump:
        ports.append(nodes["pump"].outlets[0])
    return ports


@pytest.mark.parametrize("method", METHODS)
def test_section_behind_a_stopped_pump_sits_at_its_suction_pressure(method):
    # The stopped pump is the strongest leak path (slip / open passage): the shut-in section equalises with
    # the suction tank, whatever the solver method; the check valve stays closed against the header
    nodes, pipes = solved(method)
    p_suction = nodes["suction"].outlets[0].pressure
    for port in section_ports(nodes, pipes):
        assert port.flow_rate == pytest.approx(0.0, abs=1e-9)
        assert port.pressure == pytest.approx(p_suction, abs=1.0)
    # Pipe 106 in the reference network: no flow, so the same pressure at both ends and at the pump inlet
    assert nodes["pump"].inlets[0].pressure == pytest.approx(p_suction, abs=1.0)
    assert pipes["e_suction"].outlets[0].pressure == pytest.approx(p_suction, abs=1.0)
    assert nodes["nrv"].outlets[0].pressure == pytest.approx(nodes["mix"].inlets[0].pressure, abs=1.0)   # dead mixer inlet reads the run's static pressure (flowing header inlet)
    assert nodes["nrv"].outlets[0].pressure > p_suction + 1e5


def test_stagnant_ports_are_flagged():
    nodes, pipes = solved()
    assert all(p.stagnant for p in section_ports(nodes, pipes))
    flowing = [nodes["header"].outlets[0], nodes["mix"].outlets[0], nodes["nrv"].outlets[0],
               *pipes["e_mix"].inlets, *pipes["e_suction"].inlets, nodes["pump"].inlets[0]]
    assert not any(p.stagnant for p in flowing)


@pytest.mark.parametrize("method", METHODS)
def test_dead_leg_behind_a_check_valve_takes_the_header_pressure(method):
    # Without a pump the check valve's back-leakage outweighs the PSV seat: the dead leg sits at header pressure
    nodes, pipes = solved(method, with_pump=False)
    p_header_side = nodes["nrv"].outlets[0].pressure
    for port in section_ports(nodes, pipes, with_pump=False):
        assert port.pressure == pytest.approx(p_header_side, abs=1.0)


def test_stagnant_pressure_never_lifts_a_closed_psv():
    # PSV set below the header pressure: leakage alone does not lift it in a steady-state model
    nodes, pipes = solved(with_pump=False, psv_set_barg=1.0)
    psv = nodes["psv"]
    assert psv.is_closed() and psv.inlets[0].flow_rate == 0.0
    assert psv.set_pressure_pa - 200.0 <= psv.inlets[0].pressure < psv.set_pressure_pa


def test_relief_passes_keep_the_section_at_suction_pressure():
    # The unmitigated pass holds the PSV forced closed, which prunes the whole section from the solve
    NetworkSolver.clear_warm_start_cache()
    nodes, edges = standby_branch()
    gs = GlobalSettings(fluid_type="water")
    for item in [*nodes.values(), *(e["pipe"] for e in edges)]:
        item.global_settings = gs
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    stats, telemetry, _, _, _ = run_sequential_relief_simulation(network, NetworkSolver(network), lambda net: {})
    assert stats["success"], stats.get("error")
    p_suction = nodes["suction"].outlets[0].pressure
    pipes = {e["id"]: e["pipe"] for e in edges}
    for port in section_ports(nodes, pipes):
        assert port.pressure == pytest.approx(p_suction, abs=1.0)


def _network(nodes, edges):
    gs = GlobalSettings(fluid_type="water")
    for item in [*nodes.values(), *(e["pipe"] for e in edges)]:
        item.global_settings = gs
    return HydraulicNetwork(nodes=nodes, edges=edges)


def _stopped_pump():
    pump = VolumetricPump("Standby pump", flow_rated=30.0 / 60000.0, motor_power=3000.0, efficiency=0.85)
    pump.active = False
    return pump


def _header_and_consumer(nodes, edges):
    nodes.update({"header": PressureSource("Header", source_pressure=HEADER_PA), "mix": Mixer("Header tee"),
                  "consumer": LinearControlValve("Consumer", max_cv=2.0, opening_pct=50.0),
                  "return": Tank("Return", fluid_level=0.0)})
    edges += [{"id": "e_header", "source": "header", "target": "mix", "target_port": "inlet-0", "pipe": Pipe("header", 1, ID)},
              {"id": "e_mix", "source": "mix", "target": "consumer", "pipe": Pipe("to consumer", 1, ID)},
              {"id": "e_return", "source": "consumer", "target": "return", "pipe": Pipe("return", 1, ID)}]


@pytest.mark.parametrize("reverse", [False, True])
def test_pruned_suction_line_keeps_its_own_pressure_whatever_the_edge_order(reverse):
    # Review finding: the pump discharge side overwrote the pump's one pressure value, so with the discharge
    # edge first the suction line kept a stale pressure from the previous run
    NetworkSolver.clear_warm_start_cache()
    nodes = {"suction": Tank("Suction", fluid_level=2.0),
             "valve": LinearControlValve("Suction valve", max_cv=5.0, opening_pct=100.0), "pump": _stopped_pump()}
    edges = [{"id": "e_suction", "source": "suction", "target": "valve", "pipe": Pipe("suction", 1, ID)},
             {"id": "e_valve", "source": "valve", "target": "pump", "pipe": Pipe("valve to pump", 1, ID)},
             {"id": "e_discharge", "source": "pump", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("discharge", 1, ID)}]
    _header_and_consumer(nodes, edges)
    if reverse:
        edges.reverse()
    nodes["pump"].inlets[0].pressure = 7e5   # stale value from an earlier run
    stats = NetworkSolver(_network(nodes, edges)).solve()
    assert stats["success"], stats.get("error")
    p_suction = nodes["suction"].outlets[0].pressure
    pipe = next(e["pipe"] for e in edges if e["id"] == "e_valve")
    for port in (nodes["valve"].outlets[0], pipe.inlets[0], pipe.outlets[0], nodes["pump"].inlets[0]):
        assert port.pressure == pytest.approx(p_suction, abs=1.0)
    assert nodes["pump"].outlets[0].pressure == pytest.approx(nodes["mix"].inlets[1].pressure, abs=1.0)


@pytest.mark.parametrize("reverse", [False, True])
def test_sections_leaning_on_each_other_do_not_depend_on_the_node_order(reverse):
    # Review finding: suction section shut in by a check valve from a tank, discharge section by a check valve
    # to the header, the stopped pump between them. Both lean on each other; the strongest known leak path
    # starts (header back-leakage, the higher of the two check valves) and the pump carries it to the suction
    NetworkSolver.clear_warm_start_cache()
    nodes = {"suction": Tank("Suction", fluid_level=1.0), "foot": CheckValve("Foot valve"), "pump": _stopped_pump(),
             "nrv": CheckValve("NRV")}
    edges = [{"id": "e_suction", "source": "suction", "target": "foot", "pipe": Pipe("suction", 1, ID)},
             {"id": "e_foot", "source": "foot", "target": "pump", "pipe": Pipe("foot to pump", 1, ID)},
             {"id": "e_discharge", "source": "pump", "target": "nrv", "pipe": Pipe("discharge", 1, ID)},
             {"id": "e_nrv_out", "source": "nrv", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("NRV outlet", 1, ID)}]
    _header_and_consumer(nodes, edges)
    if reverse:
        nodes = dict(reversed(list(nodes.items())))
    stats = NetworkSolver(_network(nodes, edges)).solve()
    assert stats["success"], stats.get("error")
    p_header_side = nodes["nrv"].outlets[0].pressure
    for port in (nodes["pump"].inlets[0], nodes["pump"].outlets[0], nodes["foot"].outlets[0], nodes["nrv"].inlets[0]):
        assert port.stagnant
        assert port.pressure == pytest.approx(p_header_side, abs=1.0)


def test_check_valve_push_above_a_relief_set_pressure_stays_visible():
    # Review finding: the check valve's lower limit (header minus cracking) and the PSV seat limit conflict;
    # the check valve wins, so the section shows the breach instead of hiding it below the set pressure
    NetworkSolver.clear_warm_start_cache()
    nodes = {"header": PressureSource("Header", source_pressure=8e5), "nrv": CheckValve("NRV"),
             "psv": PressureSafetyValve("PSV", set_pressure_barg=5.0, valve_type="balanced_bellows"), "return": Tank("Return", fluid_level=0.0)}
    edges = [{"id": "e_in", "source": "header", "target": "nrv", "pipe": Pipe("header", 1, ID)},
             {"id": "e_mid", "source": "nrv", "target": "psv", "pipe": Pipe("NRV to PSV", 1, ID)},
             {"id": "e_out", "source": "psv", "target": "return", "pipe": Pipe("relief outlet", 1, ID)}]
    nrv, psv = nodes["nrv"], nodes["psv"]
    psv.forced_state = "forced_closed"
    solver = NetworkSolver(_network(nodes, edges))
    solver.held_closed_ids = {"psv"}   # as in a relief pass before it opens
    stats = solver.solve()
    assert stats["success"], stats.get("error")
    assert nrv.inlets[0].flow_rate == pytest.approx(0.0, abs=1e-9)
    floor = nrv.inlets[0].pressure - nrv.cracking_pressure_bar * 1e5
    assert psv.inlets[0].pressure >= floor - 1.0
    assert psv.inlets[0].pressure > psv.set_pressure_pa


def test_leakage_alone_does_not_open_a_psv_in_the_relief_passes():
    # Leakage behind a closed check valve brings a dead leg to header pressure. A failed PSV (unmitigated) sees
    # that pressure; a working one simmers just below its set pressure: no opening and no ramp at zero flow
    NetworkSolver.clear_warm_start_cache()
    nodes, edges = standby_branch(with_pump=False, psv_set_barg=1.0)
    network = _network(nodes, edges)
    inlet = lambda net: {"psv_inlet": net.nodes["psv"].inlets[0].pressure}
    solver = NetworkSolver(network)
    stats, relieved, unmitigated, _, _ = run_sequential_relief_simulation(network, solver, inlet)
    assert stats["success"], stats.get("error")
    psv = nodes["psv"]
    device = relieved["relief"]["devices"]["psv"]
    assert device["opening_order"] is None and device["opening_ramp_pct"] is None
    assert psv.set_pressure_pa - 200.0 <= relieved["psv_inlet"] < psv.set_pressure_pa
    assert unmitigated["psv_inlet"] == pytest.approx(nodes["nrv"].outlets[0].pressure, abs=1.0)
    assert not solver.held_closed_ids



def _shut_in_behind_check_valve(device):
    """Header (4 bara) -> check valve -> device -> dead end (a tee with nothing connected downstream)."""
    nodes = {"header": PressureSource("Header", source_pressure=HEADER_PA), "nrv": CheckValve("NRV"),
             "device": device, "end": Splitter("Dead end")}
    edges = [{"id": "e_in", "source": "header", "target": "nrv", "pipe": Pipe("header", 1, ID)},
             {"id": "e_nrv", "source": "nrv", "target": "device", "pipe": Pipe("NRV to device", 1, ID)},
             {"id": "e_end", "source": "device", "target": "end", "pipe": Pipe("dead leg", 1, ID)}]
    stats = solve(nodes, edges)
    assert stats["success"], stats.get("error")
    return nodes


def test_deadheaded_pump_in_a_shut_in_section_keeps_its_shutoff_head():
    # Review finding: the stagnant step gave the whole section one pressure, so the pump showed no pressure rise
    pump = CentrifugalPump("Booster", flow_rated=10.0 / 60000.0, head_rated=30.0)
    nodes = _shut_in_behind_check_valve(pump)
    rise = pump.calculate_delta_p(0.0, pump.inlets[0].density)
    assert rise > 1e5
    assert pump.inlets[0].stagnant and pump.outlets[0].stagnant
    assert pump.inlets[0].pressure == pytest.approx(nodes["nrv"].outlets[0].pressure, abs=1.0)
    assert pump.inlets[0].pressure >= nodes["nrv"].inlets[0].pressure - nodes["nrv"].cracking_pressure_bar * 1e5 - 1.0
    assert pump.outlets[0].pressure - pump.inlets[0].pressure == pytest.approx(rise, abs=1.0)
    assert nodes["end"].inlets[0].pressure == pytest.approx(pump.outlets[0].pressure, abs=1.0)


def test_regulator_in_a_shut_in_section_holds_its_set_pressure():
    prv = LinearRegulator("PRV", max_cv=2.0, set_pressure=250_000.0)
    nodes = _shut_in_behind_check_valve(prv)
    assert prv.inlets[0].pressure > 3.5e5
    assert prv.outlets[0].pressure == pytest.approx(prv.set_pressure, abs=1.0)
    assert nodes["end"].inlets[0].pressure == pytest.approx(prv.set_pressure, abs=1.0)


def test_pump_reached_from_its_discharge_keeps_its_pressure_rise():
    # Review finding: a pruned pump seen only from its discharge side got suction equal to discharge
    NetworkSolver.clear_warm_start_cache()
    pump = CentrifugalPump("Booster", flow_rated=10.0 / 60000.0, head_rated=30.0)
    nodes = {"start": Mixer("Dead suction"), "pump": pump}
    edges = [{"id": "e_suction", "source": "start", "target": "pump", "pipe": Pipe("suction", 1, ID)},
             {"id": "e_discharge", "source": "pump", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("discharge", 1, ID)}]
    _header_and_consumer(nodes, edges)
    stats = solve(nodes, edges)
    assert stats["success"], stats.get("error")
    rise = pump.calculate_delta_p(0.0, pump.inlets[0].density)
    assert pump.outlets[0].pressure == pytest.approx(nodes["mix"].inlets[1].pressure, abs=1.0)
    assert pump.outlets[0].pressure - pump.inlets[0].pressure == pytest.approx(rise, abs=1.0)


@pytest.mark.parametrize("method", METHODS)
def test_flow_source_at_zero_flow_is_no_pressure_reference(method):
    # Review finding: a flow source fixes the flow, not the pressure; at zero flow its section is stagnant
    NetworkSolver.clear_warm_start_cache()
    nodes = {"source": FlowSource("Dosing", source_flow=0.0), "nrv": CheckValve("NRV")}
    edges = [{"id": "e_source", "source": "source", "target": "nrv", "pipe": Pipe("dosing line", 1, ID)},
             {"id": "e_nrv", "source": "nrv", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("NRV outlet", 1, ID)}]
    _header_and_consumer(nodes, edges)
    stats = solve(nodes, edges, solver_method=method)
    assert stats["success"], stats.get("error")
    source = nodes["source"].outlets[0]
    assert source.stagnant
    assert source.pressure == pytest.approx(nodes["nrv"].outlets[0].pressure, abs=1.0)


@pytest.mark.parametrize("method", METHODS)
def test_section_behind_a_check_valve_with_orifice_takes_the_header_pressure(method):
    # The bypass orifice always connects both sides: at zero flow it has no pressure drop, so the section
    # between the stopped PD pump and the valve sits at header pressure, not at the pump suction pressure
    NetworkSolver.clear_warm_start_cache()
    pump = VolumetricPump("Standby pump", flow_rated=30.0 / 60000.0, motor_power=3000.0, efficiency=0.85)
    pump.active = False
    nodes = {"suction": Tank("Suction", fluid_level=2.0), "pump": pump,
             "nrv": CheckValveOrifice("NRV", pipe_diameter=ID, orifice_diameter=0.003)}
    edges = [{"id": "e_suction", "source": "suction", "target": "pump", "pipe": Pipe("suction", 1, ID)},
             {"id": "e_discharge", "source": "pump", "target": "nrv", "pipe": Pipe("discharge", 1, ID)},
             {"id": "e_nrv", "source": "nrv", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("NRV outlet", 1, ID)}]
    _header_and_consumer(nodes, edges)
    stats = solve(nodes, edges, solver_method=method)
    assert stats["success"], stats.get("error")
    p_header_side = nodes["nrv"].outlets[0].pressure
    assert p_header_side > nodes["suction"].outlets[0].pressure + 1e5
    for port in (nodes["nrv"].inlets[0], pump.outlets[0]):
        assert port.flow_rate == pytest.approx(0.0, abs=1e-9)
        assert port.pressure == pytest.approx(p_header_side, abs=1.0)


def test_dead_tee_branch_reads_the_static_pressure_of_the_flowing_run():
    # A gauge on a dead branch of a tee reads the run's static pressure, not the total: the dead splitter port,
    # its pipe (both ends) and the node behind it drop by the velocity head, while the total stays reported
    NetworkSolver.clear_warm_start_cache()
    nodes = {"src": PressureSource("Source", source_pressure=6e5), "tee": Splitter("Tee"),
             "sink": Tank("Sink", fluid_level=0.0), "end": Splitter("Dead end")}
    edges = [{"id": "e_in", "source": "src", "target": "tee", "pipe": Pipe("feed", 1, ID)},
             {"id": "e_run", "source": "tee", "target": "sink", "source_port": "outlet-0", "pipe": Pipe("run", 1, ID)},
             {"id": "e_dead", "source": "tee", "target": "end", "source_port": "outlet-1", "pipe": Pipe("dead leg", 1, ID)}]
    stats = solve(nodes, edges)
    assert stats["success"], stats.get("error")
    pipes = {e["id"]: e["pipe"] for e in edges}
    feed = pipes["e_in"].outlets[0]
    velocity = feed.flow_rate / (3.141592653589793 * ID**2 / 4)
    head = feed.density * velocity**2 / 2
    assert velocity > 3.0
    run_static = nodes["tee"].outlets[0].pressure
    dead = nodes["tee"].outlets[1]
    assert dead.flow_rate == pytest.approx(0.0, abs=1e-9)
    for port in (dead, *pipes["e_dead"].inlets, *pipes["e_dead"].outlets, *nodes["end"].inlets):
        assert port.pressure == pytest.approx(run_static, abs=1e-3)
    assert total_of(dead) == pytest.approx(total_of(nodes["tee"].inlets[0]), abs=1e-3)
    assert total_of(dead) == pytest.approx(feed.pressure + head, rel=1e-2 * head / feed.pressure)
    assert total_of(dead) > run_static + 0.5 * head


def test_dead_leg_behind_a_check_valve_takes_the_temperature_of_its_nearest_live_side():
    # A stagnant port has no flow to carry a temperature. Each side of the closed valve takes the temperature of the live end it hangs on: source side from the
    # source, mixer side from the mixer's leaving stream; density and viscosity follow
    K = 273.15
    nodes = {"hot": PressureSource("Hot", 15e5, 60 + K), "cold": PressureSource("Cold", 9e5, 10 + K),
             "nrv": CheckValve("NRV", 1.0), "mix": Mixer("Mixer", 2), "sink": Tank("Sink", fluid_level=1.0, temperature=10 + K)}
    edges = [{"id": "e1", "source": "hot", "target": "mix", "target_port": "inlet-0", "pipe": Pipe("hot", 1, ID)},
             {"id": "e2", "source": "cold", "target": "nrv", "pipe": Pipe("cold side", 1, ID)},
             {"id": "e3", "source": "nrv", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("mixer side", 1, ID)},
             {"id": "e4", "source": "mix", "target": "sink", "pipe": Pipe("out", 50, 0.01)}]
    stats = solve(nodes, edges, fluid="crude_heavy")
    assert stats["success"], stats.get("error")
    pipes = {e["id"]: e["pipe"] for e in edges}
    mixer_side = nodes["mix"].outlets[0].temperature
    assert mixer_side > 50 + K
    source_side = [nodes["nrv"].inlets[0], *pipes["e2"].inlets, *pipes["e2"].outlets]
    live_side = [nodes["nrv"].outlets[0], nodes["mix"].inlets[1], *pipes["e3"].inlets, *pipes["e3"].outlets]
    for ports, expected in ((source_side, 10 + K), (live_side, mixer_side)):
        for port in ports:
            assert abs(port.flow_rate) <= 1e-7
            assert port.temperature == pytest.approx(expected, abs=0.1)
            assert port.density == pytest.approx(FluidProperties.get_density("crude_heavy", expected), rel=1e-3)
