---
name: walflow-qa
description: WalFlow test strategy and rules (replaces TESTING.md). Use whenever writing, changing, moving or deleting a test, fixing a bug, adding equipment, or deciding whether a change needs a test, in the backend (pytest, hypothesis) or the frontend (Vitest). Covers the test pyramid, where a test belongs, the bug-fix decision tree, property tests, golden examples and the local release gate.
metadata:
  version: "1.0.0"
---

# WalFlow QA

The goal is **few tests with high value**. A physics engine has strong laws (mass and energy are conserved, a
passive element loses pressure in the flow direction, the Jacobian matches the residual), and one property test
of a law covers every component and every input at once. So before writing an example test, ask whether a law
already covers the change, or should.

Do not add a test per change by reflex. Every test must answer: **which realistic bug fails this, and nothing else
catches it?** A test without an answer is merged into another or deleted.

## The pyramid

From the base (most checks, cheapest) to the top (fewest):

| Layer | What it checks | Where | Tool |
|---|---|---|---|
| 0 Static | Lint, build, shipped-file schema | `npm run lint`, `npm run build`, `regression/test_shipped_files.py` | ESLint, Vite, pytest |
| 1 Contracts | Laws every equipment model keeps, over generated parameters, fluids and flows | `unit/equipment/test_equipment_contracts.py` | hypothesis |
| 2 Reference | One component's numbers against an independent reference (closed form, standard, datasheet) | `unit/equipment/test_<name>.py`, `unit/fluids`, `unit/solver` | pytest parametrize |
| 3 Scenarios | Interactions only a specific topology shows (controllers, relief, islands) | `scenarios/` | pytest |
| 4 Golden | Every shipped example against reviewed results | `regression/test_golden_examples.py` | golden JSON |
| 5 API | HTTP / WebSocket / database behaviour | `api/` | pytest, httpx |
| Frontend | Components with logic (inspectors, panels, conversions) | `frontend/src/**/*.test.jsx` | Vitest |

Push every check as low as it can go. A wrong number for one component is a layer 2 row, not a scenario. A
law that should hold for all components is a layer 1 property, not one assertion per component file.

## When to write a test: the decision tree

For a **bug fix**, work down the list and stop at the first that fits. Write the failing test first, then fix.

1. **A law should have caught it.** Strengthen the property or widen its strategy in `tests/helpers/strategies.py`
   until it fails on the bug. If hypothesis needed a rare input, pin it with `@example(...)` so it is always
   replayed. No new test function.
2. **A wrong number for one component.** Add a row to that component's reference table:
   `pytest.param(..., id="D-09")`, so the audit ID stays searchable. No new test function.
3. **Only a specific topology shows it.** Add a case to an existing scenario module, or a new scenario if no
   module fits.
4. **Nothing above fits.** Add a test function and say in the commit message why 1–3 did not fit.

For a **new feature**: add the strategy entry for new equipment (see below), reference rows for its numbers, and a
scenario only if it interacts with controllers, relief or topology handling. For a **refactor** that keeps
behaviour: no new tests; the existing ones must pass unchanged.

When a new test makes an older one redundant, delete the older one in the same change.

## Layout

All backend tests live in `backend/tests`. The folder sets the layer marker automatically.

| Folder | What belongs here | Marker |
|---|---|---|
| `unit/equipment` | Equipment contracts, and one file per component against its reference (`test_<equipment>.py`) | `unit` |
| `unit/fluids` | Fluid properties, friction, heat, NPSH | `unit` |
| `unit/solver` | Solver mechanics: tolerances, warm start, Jacobian, islands | `unit` |
| `scenarios` | Several components solved together as a network | `scenario` |
| `regression` | Golden examples, shipped-file checks, guards for cross-cutting bugs | `regression` |
| `api` | HTTP / WebSocket / database behaviour | `api` |
| `bench` | Manual timing scripts (`bench_*.py`), not collected by pytest | `bench` |
| `helpers` | Shared builders, strategies, reference formulas. Tests never import other tests | |
| `data` | Golden JSON and fixtures | |

Hypothesis tests also get the `property` marker. Select layers with `pytest -m unit`, `-m property`, etc.

Frontend tests sit next to the component they test: `Component.test.jsx`. Shared fixtures are in `frontend/src/test`.

## Rules

1. **Name by subject, not by origin.** `test_regulator_lockup.py`, not `test_f1_37.py`. Names are unique across the tree.
2. **Audit / review IDs are markers or param IDs.** `pytestmark = pytest.mark.audit("F1-24")` on a file,
   `@pytest.mark.audit(...)` on a test, or `pytest.param(..., id="D-09")` on a table row. Find them with
   `pytest -m audit` or by searching the ID.
3. **Fix a bug test-first.** Follow the decision tree above; the test must fail before the fix.
4. **Assert against an independent reference.** Closed-form values or `helpers/physics_refs.py`, never a copy of
   the production formula. Properties assert laws, not the implementation. No bare `dt > 0` checks, no `print`.
5. **Be deterministic.** No timing assertions, no network, no dependence on other tests or run order. Hypothesis
   runs derandomized by default (see below).
6. **Don't touch real data.** `conftest.py` points `DATABASE_PATH` at a temporary DB; never set it in a test file
   or create `.db` files. Locate shipped files through `helpers/walflow_paths.py`, not `../..`.
7. **Shared setup goes in `helpers/`.** Network builders in `helpers/networks.py`, hypothesis strategies in
   `helpers/strategies.py`, reference formulas in `helpers/physics_refs.py`.
8. **Tests must pass in any order.** `pytest-randomly` shuffles the run. Give every test its own state.
9. **Test what the app uses.** Do not test dead code paths. Example: the solver differentiates most components
   numerically (D-13), so their `calculate_dp_derivative` is not checked; pipe and pump derivatives are.

## Property tests (hypothesis)

Read [references/property-testing.md](references/property-testing.md) before writing or changing one. In short:

- Strategies build equipment from the node `data` a saved file holds, through `GraphParser.create_node`, so the
  parser's defaults, unit conversions and input checks apply.
- Parametrize a property over the equipment type (`@pytest.mark.parametrize("node_type", ...)` plus
  `st.data()`), so every type gets the full example budget and a failure names the component.
- Draw values where behaviour switches: flows relative to the rated flow (`flow_ratios()`), pressures relative
  to a limit. Absolute ranges over many decades rarely reach those branches.
- Profiles: `default` (60 examples, derandomized, used by the gate) and `explore`
  (`HYPOTHESIS_PROFILE=explore`, 2000 random examples) to hunt for new failures after a physics change.

### New equipment

Add the component's node `data` strategy to `RESISTANCE_DATA` (two-port resistance) or `PUMP_DATA` in
`helpers/strategies.py`. The contract suite then checks it automatically. Add a `test_<name>.py` with reference
rows for its own numbers (calibration point, standard, worked example). `test_every_canvas_type_builds_a_specific_model`
fails until the parser builds the new canvas type.

## Golden examples

`regression/test_golden_examples.py` compares every shipped example to `data/golden_examples.json`. After an
intended physics change, review the diff, then regenerate with
`WALFLOW_UPDATE_GOLDEN=1 python -m pytest tests/regression/test_golden_examples.py` and commit the JSON with an
explanation.

## Benchmarks

Run manually from anywhere: `python backend/tests/bench/bench_solver_scaling.py`. Results go to the git-ignored
`performance_log.md`.

## The gate

Run before finishing any change. All of it must pass:

```bash
pip install -r requirements-dev.txt      # once
cd backend && python -m pytest           # backend, ~1.5 min
cd frontend && npm run lint && npm test && npm run build
```

After a physics change, also run `HYPOTHESIS_PROFILE=explore python -m pytest -m property` (a few minutes).

GitHub Actions does not run on pushes. `.github/workflows/ci.yml` runs the same gate only when a release tag
triggers `docker-publish.yml`, and blocks the Docker images if it fails. So a broken `main` is only caught
locally: run the gate before you commit and always before tagging a release.
