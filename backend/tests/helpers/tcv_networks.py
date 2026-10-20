"""3-way TCV scenario networks (ROADMAP "Thermal Control Valve Loop"), built as ReactFlow graphs so they
take the same parser path as the app. Used by the TCV loop scenario tests and bench_tcv_loop.py."""
from simulation.schemas import GlobalSettings, ReactFlowGraph

PIPE = {"length_m": 3.0, "diameter_m": 0.05}


class _Graph:
    def __init__(self, fluid):
        self.nodes, self.edges = [], []
        self.fluid = fluid

    def node(self, node_id, node_type, **data):
        self.nodes.append({"id": node_id, "type": node_type, "position": {"x": 0, "y": 0},
                           "data": {"label": node_id, **data}})
        return node_id

    def pipe(self, src, tgt, src_port=0, tgt_port=0, data=None):
        self.edges.append({"id": f"e{len(self.edges)}", "source": src, "target": tgt,
                           "sourceHandle": f"outlet-{src_port}", "targetHandle": f"inlet-{tgt_port}",
                           "data": {**PIPE, **(data or {})}})

    def graph(self):
        return ReactFlowGraph(nodes=self.nodes, edges=self.edges,
                              global_settings=GlobalSettings(fluid_type=self.fluid, solver_method="sparse_newton"))


def mixing_graph(t_hot_c=80.0, t_cold_c=20.0, set_c=40.0, fluid="water", max_cv=10.0, hot_port_idx=0,
                 p_hot_bara=3.0, p_cold_bara=3.0, load_cv=5.0, load_opening=100.0, hot_pipe=None, cold_pipe=None,
                 cold_check_valve=False, prv_bara=None):
    """Two pressure sources at fixed temperatures mix in one TCV, then a load valve to a 1 bar(a) sink.
    The port designated hot (hot_port_idx) is fed from the source at t_hot_c."""
    g = _Graph(fluid)
    g.node("hot", "pressure_source", source_pressure_bara=p_hot_bara, temperature_k=t_hot_c + 273.15)
    g.node("cold", "pressure_source", source_pressure_bara=p_cold_bara, temperature_k=t_cold_c + 273.15)
    g.node("tcv", "three_way_tcv", max_cv=max_cv, set_temperature_c=set_c, hot_port_idx=hot_port_idx)
    g.node("load", "linear_control_valve", max_cv=load_cv, opening_pct=load_opening)
    g.node("sink", "pressure_source", source_pressure_bara=1.0, temperature_k=293.15)
    g.pipe("hot", "tcv", tgt_port=hot_port_idx, data=hot_pipe)
    if cold_check_valve:
        g.node("cv_cold", "check_valve", cv=15.0, cracking_pressure_bar=0.1)
        g.pipe("cold", "cv_cold")
        g.pipe("cv_cold", "tcv", tgt_port=1 - hot_port_idx, data=cold_pipe)
    else:
        g.pipe("cold", "tcv", tgt_port=1 - hot_port_idx, data=cold_pipe)
    if prv_bara is not None:
        g.node("prv", "linear_regulator", max_cv=10.0, set_pressure_pa=prv_bara * 1e5, backpressure=False)
        g.pipe("tcv", "prv")
        g.pipe("prv", "load")
    else:
        g.pipe("tcv", "load")
    g.pipe("load", "sink")
    return g.graph()


def series_graph(set1_c=50.0, set2_c=35.0, fluid="water"):
    """TCV 1 mixes 80 / 20 degC, TCV 2 mixes its outlet (hot port) with a third 10 degC source."""
    g = _Graph(fluid)
    g.node("hot", "pressure_source", source_pressure_bara=4.0, temperature_k=353.15)
    g.node("cold", "pressure_source", source_pressure_bara=4.0, temperature_k=293.15)
    g.node("chill", "pressure_source", source_pressure_bara=3.5, temperature_k=283.15)
    g.node("tcv1", "three_way_tcv", max_cv=10.0, set_temperature_c=set1_c, hot_port_idx=0)
    g.node("tcv2", "three_way_tcv", max_cv=10.0, set_temperature_c=set2_c, hot_port_idx=0)
    g.node("load", "linear_control_valve", max_cv=5.0, opening_pct=100.0)
    g.node("sink", "pressure_source", source_pressure_bara=1.0, temperature_k=293.15)
    g.pipe("hot", "tcv1", tgt_port=0)
    g.pipe("cold", "tcv1", tgt_port=1)
    g.pipe("tcv1", "tcv2", tgt_port=0)
    g.pipe("chill", "tcv2", tgt_port=1)
    g.pipe("tcv2", "load")
    g.pipe("load", "sink")
    return g.graph()


def parallel_graph(set_a_c=40.0, set_b_c=60.0, fluid="water"):
    """Two TCVs fed from one hot and one cold header, outlets joined in a mixer before the load."""
    g = _Graph(fluid)
    g.node("hot", "pressure_source", source_pressure_bara=3.0, temperature_k=353.15)
    g.node("cold", "pressure_source", source_pressure_bara=3.0, temperature_k=293.15)
    g.node("sh", "splitter")
    g.node("sc", "splitter")
    g.node("tcv_a", "three_way_tcv", max_cv=10.0, set_temperature_c=set_a_c, hot_port_idx=0)
    g.node("tcv_b", "three_way_tcv", max_cv=10.0, set_temperature_c=set_b_c, hot_port_idx=1)
    g.node("mix", "mixer")
    g.node("load", "linear_control_valve", max_cv=8.0, opening_pct=100.0)
    g.node("sink", "pressure_source", source_pressure_bara=1.0, temperature_k=293.15)
    g.pipe("hot", "sh")
    g.pipe("cold", "sc")
    g.pipe("sh", "tcv_a", src_port=0, tgt_port=0)
    g.pipe("sh", "tcv_b", src_port=1, tgt_port=1)
    g.pipe("sc", "tcv_a", src_port=0, tgt_port=1)
    g.pipe("sc", "tcv_b", src_port=1, tgt_port=0)
    g.pipe("tcv_a", "mix", tgt_port=0)
    g.pipe("tcv_b", "mix", tgt_port=1)
    g.pipe("mix", "load")
    g.pipe("load", "sink")
    return g.graph()


def cooler_loop_graph(t_supply_c=55.0, set_c=45.0, fluid="iso_vg_46", max_cv=25.0, hot_port_idx=1,
                      cooling_kw=120.0, medium_c=20.0, load_cv=15.0, load_opening=70.0,
                      bpr_bara=None, prv_bara=None, psv_barg=None):
    """Lube-oil style loop: pump from a reservoir, split to cooler and bypass, the TCV mixes cooled and
    bypass oil (hot port = bypass), then a load valve to the return reservoir. The cooler outlet depends on
    its flow, so the TCV inlet temperatures move with the mix ratio. Optional spill-back BPR on the pump
    discharge, PRV after the TCV and a PSV on the pump discharge."""
    g = _Graph(fluid)
    g.node("supply", "tank", level_m=2.0, elevation_m=0.0, temperature_k=t_supply_c + 273.15)
    g.node("pump", "centrifugal_pump", flow_rated_lmin=200.0, head_rated_m=72.0, rise_to_shutoff_pct=20.0)
    g.node("split", "splitter")
    g.node("cooler", "heat_exchanger", rated_cooling_kw=cooling_kw, rated_flow_lmin=200.0,
           design_inlet_temp_c=55.0, medium_temp_c=medium_c, rated_dp_bar=0.5)
    g.node("tcv", "three_way_tcv", max_cv=max_cv, set_temperature_c=set_c, hot_port_idx=hot_port_idx)
    g.node("load", "linear_control_valve", max_cv=load_cv, opening_pct=load_opening)
    g.node("ret", "tank", level_m=1.0, elevation_m=0.0, temperature_k=318.15)
    pipe = {"diameter_m": 0.035}
    g.pipe("supply", "pump", data=pipe)
    head = "pump"
    if bpr_bara is not None or psv_barg is not None:
        g.node("hdr", "splitter")
        g.pipe("pump", "hdr", data=pipe)
        head = "hdr"
        if bpr_bara is not None:
            g.node("bpr", "linear_regulator", max_cv=4.0, set_pressure_pa=bpr_bara * 1e5, backpressure=True)
            g.node("spill", "tank", level_m=1.0, elevation_m=0.0, temperature_k=318.15)
            g.pipe("hdr", "bpr", src_port=1, data=pipe)
            g.pipe("bpr", "spill", data=pipe)
        else:
            g.node("psv", "pressure_safety_valve", cv=2.0, action_mode="modulating", set_pressure_barg=psv_barg)
            g.node("relief", "tank", level_m=1.0, elevation_m=0.0, temperature_k=318.15)
            g.pipe("hdr", "psv", src_port=1, data=pipe)
            g.pipe("psv", "relief", data=pipe)
    g.pipe(head, "split", data=pipe)
    g.pipe("split", "cooler", src_port=0, data=pipe)
    g.pipe("split", "tcv", src_port=1, tgt_port=hot_port_idx, data=pipe)
    g.pipe("cooler", "tcv", tgt_port=1 - hot_port_idx, data=pipe)
    if prv_bara is not None:
        g.node("prv", "linear_regulator", max_cv=15.0, set_pressure_pa=prv_bara * 1e5, backpressure=False)
        g.pipe("tcv", "prv", data=pipe)
        g.pipe("prv", "load", data=pipe)
    else:
        g.pipe("tcv", "load", data=pipe)
    g.pipe("load", "ret", data=pipe)
    return g.graph()


def tcv_scenarios():
    """(name, graph) pairs covering the ranges listed in the ROADMAP evaluation plan."""
    s = []
    # Setpoint position within the 20..80 degC span, and close to either inlet
    for set_c in (26.0, 50.0, 74.0, 20.4, 79.6):
        s.append((f"mix/set {set_c:g}C", mixing_graph(set_c=set_c)))
    # Setpoint out of reach: above the hot inlet, below the cold inlet
    s.append(("mix/set above hot", mixing_graph(set_c=90.0)))
    s.append(("mix/set below cold", mixing_graph(set_c=10.0)))
    # Small inlet temperature difference (around the 0.5 K fallback threshold)
    for dt in (0.4, 0.6, 1.0, 3.0):
        s.append((f"mix/dT {dt:g}K", mixing_graph(t_hot_c=40.0 + dt / 2, t_cold_c=40.0 - dt / 2, set_c=40.0 + dt / 10)))
    # Port role and inversion
    s.append(("mix/hot port 1", mixing_graph(hot_port_idx=1)))
    s.append(("mix/inversion", mixing_graph(t_hot_c=20.0, t_cold_c=80.0)))
    # Valve authority and branch resistance
    s.append(("mix/oversized cv", mixing_graph(max_cv=200.0)))
    s.append(("mix/undersized cv", mixing_graph(max_cv=1.0)))
    s.append(("mix/long cold branch", mixing_graph(cold_pipe={"length_m": 200.0, "diameter_m": 0.025})))
    s.append(("mix/unequal pressures", mixing_graph(p_hot_bara=6.0, p_cold_bara=2.0)))
    s.append(("mix/low flow", mixing_graph(load_cv=0.2, load_opening=20.0)))
    # Fluids
    for fluid in ("glycol_50", "iso_vg_46", "iso_vg_220"):
        s.append((f"mix/{fluid}", mixing_graph(fluid=fluid)))
    # Degenerate flow: the cold branch is blocked by its check valve (cold source below the TCV inlet)
    s.append(("mix/cold branch blocked", mixing_graph(p_cold_bara=1.2, p_hot_bara=4.0, cold_check_valve=True)))
    # Interaction with a pressure controller
    s.append(("mix/with PRV", mixing_graph(p_hot_bara=6.0, p_cold_bara=6.0, prv_bara=3.0)))
    # Several TCVs
    s.append(("series/2 TCVs", series_graph()))
    s.append(("parallel/2 TCVs", parallel_graph()))
    # Cooler loop (temperature-coupled inlets)
    s.append(("loop/base", cooler_loop_graph()))
    s.append(("loop/hot oil 70C", cooler_loop_graph(t_supply_c=70.0)))
    s.append(("loop/cold start 15C", cooler_loop_graph(t_supply_c=15.0)))
    s.append(("loop/set 30C (cooler too small)", cooler_loop_graph(set_c=30.0, cooling_kw=40.0)))
    s.append(("loop/water", cooler_loop_graph(fluid="water", t_supply_c=60.0, set_c=40.0)))
    s.append(("loop/iso_vg_220", cooler_loop_graph(fluid="iso_vg_220", t_supply_c=60.0)))
    s.append(("loop/hot port 0", cooler_loop_graph(hot_port_idx=0)))
    s.append(("loop/with BPR", cooler_loop_graph(bpr_bara=6.0)))
    s.append(("loop/with PRV", cooler_loop_graph(prv_bara=3.0)))
    s.append(("loop/with PSV opening", cooler_loop_graph(psv_barg=4.0)))
    return s
