"""The warm-start cache is safe under concurrent solves and never decides the answer."""


import threading


from physics_refs import solve
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.solver import NetworkSolver


def _small_network(level):
    nodes = {"t1": Tank("A", fluid_level=level), "t2": Tank("B", fluid_level=0.0)}
    return nodes, [{"source": "t1", "target": "t2", "pipe": Pipe("p", 10.0, 0.05)}]


def test_concurrent_solves_do_not_corrupt_the_cache():
    # Solves run in worker threads; unlocked iteration/eviction used to raise "dictionary changed size"
    NetworkSolver.clear_warm_start_cache()
    errors = []
    old_limit = NetworkSolver._MAX_WARM_START_ENTRIES
    NetworkSolver._MAX_WARM_START_ENTRIES = 4          # force constant eviction

    def worker(seed):
        try:
            for k in range(15):
                nodes, edges = _small_network(2.0 + 0.1 * ((seed + k) % 7))
                # different node ids per thread give different topology keys
                nodes = {f"{key}{seed}": v for key, v in nodes.items()}
                edges = [{"source": f"t1{seed}", "target": f"t2{seed}", "pipe": edges[0]["pipe"]}]
                assert solve(nodes, edges)["success"]
        except Exception as e:      # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
    try:
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    finally:
        NetworkSolver._MAX_WARM_START_ENTRIES = old_limit
    assert not errors, errors[0]


def test_cache_holds_only_the_final_solution_of_a_solve():
    NetworkSolver.clear_warm_start_cache()
    nodes, edges = _small_network(5.0)
    solve(nodes, edges)
    assert len(NetworkSolver._warm_start_cache) == 1
