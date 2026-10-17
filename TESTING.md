# Testing Guide

Backend tests live in `backend/tests` and run with `cd backend && python -m pytest`. CI runs the same command (plus frontend `npm run lint` and `npm run build`) on every push to `main`, every pull request, and before any Docker image is published.

## Layout

| Folder | What belongs here |
|---|---|
| `unit/equipment` | One component against an analytic reference (`test_<equipment>.py`) |
| `unit/fluids` | Fluid properties, friction, heat, NPSH |
| `unit/solver` | Solver mechanics: tolerances, warm start, Jacobian, islands |
| `scenarios` | Several components solved together as a network |
| `regression` | Golden examples, shipped-file checks, guards for fixed bugs |
| `api` | HTTP / WebSocket / database behaviour |
| `bench` | Manual timing scripts (`bench_*.py`), not collected by pytest |
| `helpers`, `data` | Shared builders, reference formulas, golden JSON. Tests never import other tests |

The folder sets the layer marker automatically (`pytest -m unit`, `-m scenario`, `-m regression`, `-m api`).

## Rules

1. **Name by subject, not by origin.** `test_regulator_lockup.py`, not `test_f1_37.py`. Names are unique across the tree.
2. **Audit / review IDs are markers.** Add `pytestmark = pytest.mark.audit("F1-24")` at the top of the file (or `@pytest.mark.audit(...)` on a test). Find them with `pytest -m audit` or by searching the ID.
3. **Fix a bug test-first.** Write the failing regression test, then fix it. Put it next to the component's tests; use `regression/` only for cross-cutting guards.
4. **Assert against an independent reference.** Use closed-form values or `helpers/physics_refs.py`, not a copy of the production formula. Avoid bare `dt > 0` checks, and no `print`.
5. **Be deterministic.** No timing assertions, no network, no dependence on other tests or on run order.
6. **Don't touch real data.** `conftest.py` points `DATABASE_PATH` at a temporary DB; never set it in a test file or create `.db` files. Locate shipped files through `helpers/walflow_paths.py`, not `../..`.
7. **Shared setup goes in `helpers/`.** Network builders live in `helpers/networks.py`.
8. **Tests must pass in any order.** `pytest-randomly` shuffles the run in CI. Give every test its own state (a `setUp`/fixture that resets the DB) and never rely on `test_01` having run before `test_02`.

## Golden examples

`regression/test_golden_examples.py` compares every shipped example to `data/golden_examples.json`. After an intended physics change, review the diff, then regenerate with `WALFLOW_UPDATE_GOLDEN=1 python -m pytest tests/regression/test_golden_examples.py` and commit the JSON with an explanation.

## Benchmarks

Run manually from `backend`, e.g. `python -c "import sys;sys.path.insert(0,'tests/helpers');import runpy;runpy.run_path('tests/bench/bench_solver_comparison.py',run_name='__main__')"` (with `PYTHONPATH=.`). Results go to the git-ignored `performance_log.md`.
