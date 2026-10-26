---
name: walflow-performance
description: Find, assess and implement performance improvements in the WalFlow backend solver (backend/simulation - solver, graph parser, equipment, fluids). Use whenever the user asks to make the simulation faster, profile or benchmark the solver, reduce solve time, memory or iterations, review code for performance, or when a change is motivated by speed. Every finding must prove it is faster and that the physics is unchanged.
metadata:
  version: "1.0.0"
---

# WalFlow Performance

Speed is worth nothing if the answer changes. A user runs WalFlow to size equipment: a faster wrong pressure is a
defect, not an improvement. So every finding is judged by two rules, in this order, and both need evidence.

## The two rules

1. **It must be faster.** The improvement is measured, not argued. A change that is not clearly faster than
   run-to-run noise is reverted, even if it "should" help.
2. **The physics must not get worse.** No loss of accuracy, of scope (equipment, regimes, fluids, boundary modes,
   warnings, diagnostics) or of the physical model. A finding that needs any of these to pay off is rejected, no
   matter how large the gain.

Rule 2 wins every conflict. When in doubt, the finding is rejected.

## Scope

`backend/simulation/` only: `solver.py`, `graph_parser.py`, `fluid_utils.py`, `limits.py`, `schemas.py`,
`equipment/`. The API, WebSocket payload and frontend are out of scope. Changes there are a separate request.

## Forbidden, whatever the gain

These break rule 2 by definition. Do not propose them, not even as an "option":

- Loosening any tolerance: residual `tol`, `step_tol`, `CONTROL_TOL_BAR`, `PROP_FLOW_TOL`, `STILL_TOTAL_TOL`, the
  property-loop or relief convergence criteria, or the golden-test tolerances.
- Lowering `max_iter`, outer-loop or property-loop limits, or stopping a loop before its convergence test passes.
- Replacing an exact correlation (fluid properties, friction factor, valve or pump curves) with a table, a
  polynomial fit, a coarser interpolation or a "good enough" shortcut.
- Lower precision: float32, rounding intermediate values, dropping terms "too small to matter".
- Skipping a check that is there for physics: physical-validity checks, cavitation and relief detection, stagnant-section
  handling, bottleneck diagnostics, controller saturation, island detection.
- Removing or merging equipment features, regimes or boundary modes, or special-casing an example to make it fast.
- A cache whose key does not capture every input that changes the result (topology, parameters, case, fluid,
  boundary modes). The warm-start cache key in `NetworkSolver` shows the standard.
- Regenerating `golden_examples.json` (`WALFLOW_UPDATE_GOLDEN=1`) as part of a performance change.
- Anything time-dependent. WalFlow is steady state (see AGENTS.md); there is no "fewer time steps" lever.

## Risk classes

Every finding is put into one class before it is implemented. The class decides the proof rule 2 needs.

| Class | What changes | Examples | Rule 2 proof |
|---|---|---|---|
| **A Mechanical** | Nothing numeric: same operations on the same numbers in the same order | Hoist invariant work out of a loop, avoid repeated allocation or `deepcopy`, build an index once, cache a pure function with a complete key, cheaper data structure | Snapshot **bit-identical**, same iteration counts |
| **B Reordering** | Same mathematics, floating-point rounding may differ | Vectorise a Python loop with NumPy, reorder a sum, `np.dot` instead of a loop, sparse assembly instead of dense | Snapshot max relative difference **<= 1e-12**, same iteration counts, same success/status flags |
| **C Algorithmic** | The path to the solution changes, the solution it converges to does not | Exact analytic Jacobian or better sparsity, better initial guess, smarter warm start, reusing a factorisation while it is still exact, a cheaper equation ordering | All of: golden test passes **unchanged**; network invariants and equipment contracts pass; every case keeps its `success`, `error_kind`, `controls_converged`, statuses and warnings; `max_residual` per case is **not larger** than before; snapshot differences reported and within the solver tolerance; `walflow-physics-reviewer` approves |

If a change does not fit a class, it is not a performance finding. Ask the user.

## Workflow

### 1. Detect: profile, do not guess

Use the helper `backend/tests/bench/profile_solver.py`. Run it from anywhere.

| Command | What it does |
|---|---|
| `python backend/tests/bench/profile_solver.py profile [--top N]` | cProfile over stress networks and all shipped examples. Prints the top hotspots inside `backend/simulation/` |
| `python backend/tests/bench/profile_solver.py time [--repeats N]` | Best-of-N cold wall time per shipped example case and stress size, no profiler overhead |
| `python backend/tests/bench/profile_solver.py snapshot <name>` | Full-precision results and solver stats of every case to `bench/perf_snapshots/<name>.json` |
| `python backend/tests/bench/profile_solver.py compare <before> <after>` | Differences between two snapshots, iteration and residual changes, and the class A/B/C verdict |

Also existing: `bench_solver_scaling.py` (time vs. network size, both solver methods, appends to
`performance_log.md`) and `bench_tcv_loop.py` (controller loop iterations). All outputs are git-ignored.

Look for, in order of usual payoff: work repeated per iteration that only depends on topology; Python loops over
edges or nodes inside the residual or Jacobian; repeated fluid-property calls with the same arguments; dense
matrices where the structure is sparse; outer loops (property, control, relief) that rebuild things the inner solve
already has; iterations spent from a poor initial guess.

A hotspot below about 5 % of total time is not worth the risk. Leave it.

### 2. Assess: write a finding card

Record each candidate in the temporary findings file `backend/tests/bench/performance_findings.md`
(git-ignored). Create it at the start of a campaign and delete it when the campaign ends. Finding IDs (`P-01`, ...)
live **only** in that file. Never put them in code, comments, tests, commits, docs or the changelog.

```markdown
## P-01 <short title>
- Hotspot: <file:function>, <x % of total> in <profile command>
- Idea: <what changes, one or two sentences>
- Class: A | B | C, because <reason>
- Expected gain: <estimate and why>
- Physics risk: <what could change in the results, or "none: class A">
- Proof needed: <from the class table>
- Status: proposed | accepted | implemented | rejected (<reason>)
- Result: <before -> after timing, snapshot verdict>
```

Show the user the cards, ranked by expected gain per risk, and get confirmation before implementing (AGENTS.md:
clarify first). Reject a card at this stage if it touches the forbidden list.

### 3. Baseline

On a clean tree, before any edit:

1. `profile_solver.py snapshot before`
2. `profile_solver.py time` **twice**. The spread between the two runs is the noise floor for this machine.
3. `bench_solver_scaling.py` once (appends a baseline row to `performance_log.md`).

Same machine, same Python and library versions, no other heavy load, for before and after.

### 4. Implement one finding at a time

One finding per change, so a gain or a regression is attributable. The orchestrator implements changes in
`backend/simulation/` (see the delegation protocol). Keep the code readable. A small gain that makes the
physics hard to review is not worth it. Rule 2 also covers future correctness.

### 5. Prove both rules

**Rule 1, faster:**
- `profile_solver.py time` after the change. Accepted when total time improves by **at least 5 %** and by more
  than **3x the noise floor**, and **no** example case or stress size is slower by more than the noise floor.
- Iteration counts (inner, outer, property) are not higher for any case. Fewer is fine for class C only.
- Run `bench_solver_scaling.py` again: a new row, compared with the baseline row.

**Rule 2, physics unchanged:**
- `profile_solver.py snapshot after`, then `compare before after`. The verdict must meet the claimed class.
  A class A claim that comes out B is fine if B is acceptable for the change and the card is updated. A result
  outside the claimed class is a failure, not a reclassification to C after the fact.
- Class C additionally: `walflow-physics-reviewer` reviews the diff against the steady-state rules and the
  equipment docs.
- Every class: the full gate through `walflow-gate-runner`. Golden examples, network invariants, equipment contracts
  and the warm-start iteration regression must pass **without** regenerating any reference data.

### 6. Decide

- Both rules met: status `implemented`, record before -> after on the card, add a brief CHANGELOG line
  ("Faster X solve" style, no finding ID).
- Either rule missed: **revert the change** and mark the card `rejected` with the reason. Do not tune the change
  until a test passes, and never relax a test or tolerance to let it through.

### 7. Report and close

Report to the user per finding: class, time before -> after (total and worst case), iteration change, snapshot
verdict, reviewer and gate result. When the campaign ends, delete `performance_findings.md` and
`perf_snapshots/`.

## Tests

A performance change normally needs **no new test**. The snapshot comparison and the existing laws are the proof.
Follow `walflow-qa` for any exception: when a class C change opens a path that existing tests do not reach (for
example a new warm-start branch or a factorisation-reuse condition), `walflow-test-author` adds a property or a
reference row that would fail if that path returned a different answer. Timing assertions never go into the
pytest gate. They are machine-dependent and belong in `bench/`.

## Delegation

| Step | Who |
|---|---|
| Locate code across many files | `walflow-scout` |
| Profile, time, snapshot, compare (read-only runs) | orchestrator, or `walflow-gate-runner` for long runs |
| Change `backend/simulation/` | orchestrator |
| Review a class C change | `walflow-physics-reviewer` |
| Change bench scripts or add a test | `walflow-test-author` |
| Full gate | `walflow-gate-runner` |
