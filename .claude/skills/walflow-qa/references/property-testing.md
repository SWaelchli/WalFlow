# Property Testing in WalFlow

Hypothesis generates inputs, checks a property on each, and on failure shrinks to the smallest failing input.

## Anatomy of a contract test

```python
two_port_types = pytest.mark.parametrize("node_type", TWO_PORT_TYPES)

@two_port_types
@given(data=st.data(), q=flows())
def test_resistance_opposes_the_flow(node_type, data, q):
    """Second law: a passive element loses total pressure in the direction of flow."""
    node, (_, _, rho, mu) = data.draw(two_ports(node_type))
    assert loss_drop(node_type, node, q, rho, mu) * q >= 0.0
```

- `parametrize` over the type, `st.data()` to draw the node inside: each type gets its own budget and test ID.
  Do not `sampled_from` the type; hypothesis spreads examples very unevenly over it.
- The docstring states the law, not the implementation.
- The assertion is a physical law or a solver requirement, never a re-computation of the production formula.

## What makes a good property

| Kind | Example in WalFlow |
|---|---|
| Conservation | Mass balance at every node, enthalpy balance at a junction |
| Sign / second law | Passive element loses total pressure in the flow direction; throttling never cools |
| Monotonicity | More flow never loses less pressure; a pump never rises more at higher flow |
| Consistency | Analytic slope lies between the one-sided difference quotients (`assert_slope_between_one_sided_differences`) |
| Purity | Evaluating dP twice gives the same value and changes no public state |
| Invariance | Renaming or reordering nodes does not change the result |
| Boundary | Zero flow gives zero drop; the parser builds every canvas type |

Avoid properties that only hold for the current implementation (exact float equality between two code paths,
internal attribute values).

## Strategies (`tests/helpers/strategies.py`)

- `fluid_states()`: (fluid id, T, density, viscosity) inside the fluid's correlation range.
- `flows()`: signed absolute flow over 0.006 to 12 000 L/min. `flow_ratios()`: signed multiple of a rated flow.
- `two_ports(node_type)`, `pumps(node_type)`: equipment built from node `data` through the parser.
- `RESISTANCE_DATA`, `PUMP_DATA`: per-type node `data` strategies. Ranges cover plausible user input; widen a
  range when a bug shows it was too narrow, and never narrow one to make a test pass.

Use `log_uniform(lo, hi)` for quantities spanning decades (Cv, flow, length). Build dependent values with
`flatmap` (terminal ΔP above clean ΔP, inlet above outlet pressure) instead of `assume`, which discards examples.

## Profiles and determinism

`backend/tests/conftest.py` registers:

- `default`: `max_examples=60`, `derandomize=True`. The same examples on every run and machine, so the gate
  never flakes. Hypothesis derives the seed from the test, so renaming a test changes its examples.
- `explore`: `max_examples=2000`, random. Run after physics changes:
  `HYPOTHESIS_PROFILE=explore python -m pytest -m property`.

## When a property fails

1. Read the shrunk example in the failure output (`Falsifying example: ...`).
2. Decide whether the code or the property is wrong. A property that is wrong is fixed with a reason; a property
   is never weakened only to get green.
3. If the code is wrong: pin the input with `@example(...)` above `@given` (or a reference row), confirm it
   fails, fix the code, confirm it passes.
4. To replay an `explore` failure exactly, use the `@reproduce_failure(...)` line hypothesis prints
   (`print_blob=True`), then replace it with an `@example` before committing.

## Checking that a property bites

A property that never fails is worthless. When adding one, inject a plausible bug by hand (drop an `abs()`,
flip a sign, skip a branch), confirm the property fails, then revert. Draw inputs where branches switch
(relative to ratings and limits), or the bug in that branch will never be reached.
