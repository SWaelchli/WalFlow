"""
Independent reference calculations for the physics tests (F1-41 / F0-05).

These are written from the textbook formulas, not imported from the
simulation package, so a test fails when the code's physics is wrong.
Fluid properties are taken from FluidProperties (checked separately in B1d).
"""
import math
import os

from walflow_paths import EXAMPLES_DIR
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

G = 9.80665  # standard gravity, m/s²


def darcy_friction(re: float, rel_rough: float) -> float:
    """Darcy friction factor: 64/Re (laminar), Colebrook-White (turbulent), linear blend 2000–4000."""
    def colebrook(r):
        f = 0.02
        for _ in range(100):
            f = (-2.0 * math.log10(rel_rough / 3.7 + 2.51 / (r * math.sqrt(f)))) ** -2
        return f
    if re < 2000.0:
        return 64.0 / re
    if re > 4000.0:
        return colebrook(re)
    w = (re - 2000.0) / 2000.0
    return (1 - w) * 64.0 / 2000.0 + w * colebrook(4000.0)


def pipe_dp(q: float, length: float, d: float, rough: float, rho: float, mu: float) -> float:
    """Darcy–Weisbach pressure loss (Pa) for volumetric flow q (m³/s)."""
    area = math.pi * d ** 2 / 4.0
    v = abs(q) / area
    re = rho * v * d / mu
    return darcy_friction(re, rough / d) * length / d * rho * v ** 2 / 2.0


def pipe_flow(dp: float, length: float, d: float, rough: float, rho: float, mu: float) -> float:
    """Flow (m³/s) that makes pipe_dp equal dp (bisection)."""
    lo, hi = 0.0, 10.0
    for _ in range(200):
        mid = (lo + hi) / 2.0
        if pipe_dp(mid, length, d, rough, rho, mu) < dp:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def throttling_dt(dp: float, rho: float, cp: float) -> float:
    """Adiabatic throttling of an incompressible liquid: all lost pressure becomes heat."""
    return dp / (rho * cp)


def solve(nodes: dict, edges: list, fluid: str = "water", **settings):
    """Build and solve a network; the system fluid is set in GlobalSettings like the app does."""
    gs = GlobalSettings(fluid_type=fluid, **settings)
    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    stats = NetworkSolver(network).solve()
    return stats


def water_head(dp_pa: float, temp_k: float = 293.15) -> float:
    """Head (m) that gives dp_pa with water at temp_k (pumps are rated in head since B1a, D1)."""
    from simulation.fluid_utils import FluidProperties
    return dp_pa / (FluidProperties.get_density("water", temp_k) * 9.81)


def solve_example(name: str, case_prefix: str = None, **settings):
    """Solve a shipped example diagram (optionally one operating case) with extra global settings; returns (network, stats)."""
    import contextlib
    import io
    import json
    from simulation.schemas import ReactFlowGraph
    from simulation.graph_parser import GraphParser

    path = os.path.join(EXAMPLES_DIR, f"{name}.wlf")
    data = json.load(open(path, encoding="utf-8"))
    data["globalSettings"] = {**data.get("globalSettings", {}), **settings}
    if case_prefix:
        data["active_case_id"] = next(c["id"] for c in data["cases"] if c["name"].startswith(case_prefix))
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(ReactFlowGraph(**data))
        stats = NetworkSolver(network).solve()
    return network, stats


def node_named(network, name: str):
    return next(n for n in network.nodes.values() if n.name == name)
