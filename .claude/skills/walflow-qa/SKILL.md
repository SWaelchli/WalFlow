---
name: walflow-qa
description: WalFlow test strategy and rules (replaces TESTING.md). Use whenever writing, changing, moving or deleting a test, fixing a bug, adding equipment, or deciding whether a change needs a test, in the backend (pytest, hypothesis) or the frontend (Vitest). Covers the test pyramid, where a test belongs, the bug-fix decision tree, property tests, golden examples and the local release gate.
metadata:
  version: "1.1.0"
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
| 3 Networks | Laws every solved network obeys (mass, energy, pressure, order and warm-start independence) on generated networks | `scenarios/test_network_invariants.py` | hypothesis |
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
   `pytest.param(..., id="flow_reversal_heats_inlet")`, with an id that says what the row checks. No new test function.
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
Keep them lean: the physics is tested in the backend, and the gate's `npm run build` is the main frontend check.
Test only logic that can break silently (conversions, file export/import, inspector rules). No end-to-end or
browser tests.

Manual checks in the running app (browser walkthroughs, audits, multi-user or lock checks, API calls with a
login) use the test accounts of the `walflow-test-users` skill
([../walflow-test-users/SKILL.md](../walflow-test-users/SKILL.md)): sign out of the current user first, never test
with a real account.

## Rules

1. **Name by subject, not by origin.** `test_regulator_lockup.py`, not `test_f1_37.py`. Names are unique across the tree.
2. **No finding or audit IDs.** Finding lists (`FINDINGS.md`, audits) are temporary, so test names,
   param ids, markers and comments describe the behaviour, never `D-xx` / `F1-xx`, not even while the finding
   is open (describe the known failure instead).
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
   numerically, so their `calculate_dp_derivative` is not checked; pipe and pump derivatives are.

## Findings list (`FINDINGS.md`)

`FINDINGS.md` in the repo root is a temporary list of open issues (from audits, standard verification, generated
networks the solver cannot solve, physics reviews). Create it when the first finding comes in; delete it when the
last entry is gone. Layout, top to bottom:

1. **Header**: one paragraph on what the list is, the status values and owners used (below), and a pointer to
   these rules.
2. **Overview**: one table with **every** finding, including deferred and rejected ones, sorted by roadmap
   phase and then by severity. It is the only place that holds the status, so a status change is one edit:

   | ID | Severity | Status | Finding | Proposed solution | Owner | Phase | Source |
   |---|---|---|---|---|---|---|---|
   | H1 | High | Open | A failed solve shows raw exception text and names no component. | Two messages by failure kind naming the largest-imbalance component; "Show" selects it. | orch + phys, fe | 6 | UX audit 2026-10-28 |

   - **Finding**: one sentence, the observed behaviour, readable without the details section.
   - **Proposed solution**: one sentence. Mark it `Decided:` once the user has agreed to it; write `To decide`
     while it is open.
   - **Severity**: Critical, High, Medium or Low (as in the source; `—` for a pure check).
   - **Status**: `Open` (agreed, to implement) · `Review` (needs a decision or physics check first) ·
     `In progress` · `Fixed` (remove the entry at commit) · `Deferred` · `Rejected`.
   - **Owner**: `orch` (orchestrator: backend/simulation, API) · `fe` (`walflow-frontend-dev`) ·
     `phys` (`walflow-physics-reviewer` after the change).
   - **Phase**: the roadmap phase, or `—` when unscheduled.
3. **Roadmap** (when there is more than one phase): phase, entries, why this order, exit check.
4. **Details**, one section per source (link to the report and its verdict): a table with ID, Details (the full
   description and decided design where the overview sentence is not enough; empty otherwise), Where (code
   links) and Test (the decision-tree step from above, or "Gate" when lint/build is the check). No status
   column here.

IDs are for this list only (rule 2 above). Delete a finding's overview row and detail row in the same change that
commits its fix; the commit and `CHANGELOG.md` are the record.

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

### Network properties

`helpers/strategies.networks()` generates saved-file graphs: one of three supplies (pressure boundary, tank and
centrifugal pump, or two sources at different temperatures meeting in a junction) feeding a random series-parallel
arrangement of `NETWORK_COMPONENTS` into a tank. Each one has exactly one steady state, so the solver must find it.
`test_network_invariants.py` checks on every solved network: convergence to finite values, mass balance, pressure
continuity and fall along the flow, dissipation never cools, enthalpy balance at junctions, independence of ids and
list order, and warm start equal to cold start.

A component belongs in `NETWORK_COMPONENTS` when its behaviour depends only on its local flow. Controllers,
relief devices and the 3-way TCV have several states or outer loops and stay in their own scenarios. A
generated network the solver cannot solve is a finding: either the solver is wrong, or the generator produced
a case the model does not cover. Then log it in `FINDINGS.md` with the shrunk network, constrain the
generator and say why in a comment.

If a property fails only in the full run, it is still a real case: hypothesis mixes constants from the imported
source into generation, so the full suite draws other examples than one file alone. Reproduce the failing
example from the report, not by re-running the file.

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
`performance_log.md`. Performance work (profiling, result snapshots, accepting a speed-up) follows the
`walflow-performance` skill.

## Mutation testing

Cosmic Ray plants one small bug at a time (`+` to `-`, `>` to `<`, a skipped loop) and runs the tests. A mutant
the tests do not notice ("survived") is a gap. It takes minutes per module and hours for everything, so it is
never part of the gate or CI. When to run it:

- **Mandatory before deleting or merging away a test**: prove the rest of the suite still kills what it killed
  (below). Rewriting tests into a `pytest.param` table needs no proof when every assertion survives.
- **Recommended after new equipment or a larger physics change**: one run on the changed module. Turn the
  survivors that are real gaps into reference rows or property assertions.
- **Optional before a release**: a broad run, for example on a server. The survivors are a to-do list, not a gate.

Otherwise it is the user's call; an agent may suggest a run but does not start one on its own.

Run from `backend/` with `cosmic-ray.toml` (edit `module-path` to the module under test):

```bash
cosmic-ray init cosmic-ray.toml cr.sqlite      # wipes earlier results in cr.sqlite
python cosmic-ray-filter.py cr.sqlite          # skip operator swaps no real bug looks like (~90 % of mutants)
cosmic-ray exec cosmic-ray.toml cr.sqlite      # resumable: only mutants without a result run
cr-report cr.sqlite                            # cr-html cr.sqlite > report.html for the diffs
```

- Mutants are written into the source files in place. Do not edit `simulation/` during a run; after an aborted
  run, `git checkout -- simulation` restores the file left mutated.
- Windows: `test-command` runs without a shell, so put the absolute path of the venv `python.exe` in it.
  Otherwise a system python without pytest makes every mutant look killed within seconds.
- Parallel: one `git worktree add --detach` copy per worker, `cosmic-ray http-worker --port 990N` in each copy's
  `backend/`, and the `http` distributor with their `worker-urls` in the config.

**Deletion proof.** Run 1: `test-command` runs only the tests to delete; its killed mutants are what they guard.
Run 2: on a copy of the session with only those killed results removed, the rest of the suite runs with a
`--deselect` per deleted test. Every run-2 survivor is lost coverage: keep the test or move its assertion
elsewhere before deleting.

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
