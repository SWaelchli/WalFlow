# Solver Stability & Newton-Raphson Guidelines

WalFlow utilizes a high-speed sparse Newton-Raphson matrix solver with line-search backtracking. To ensure robust, sub-millisecond convergence across arbitrary networks, all equipment models must follow these mathematical guidelines.

---

## 1. Smooth Continuity ($C^0$ and $C^1$)

The Newton-Raphson solver computes step updates $\Delta x = -J^{-1} F(x)$. Discontinuities in $F(x)$ ($C^0$ violation) or step jumps in derivatives $\frac{\partial F}{\partial x}$ ($C^1$ violation) cause solver oscillations, cycling, or line-search failure.

### ❌ What NOT to do:
```python
# BAD: Hard cutoff creates sharp derivative discontinuity at Re = 2000
if Re < 2000:
    visc_factor = 64.0 / Re
else:
    visc_factor = 1.0
```

### ✅ What to do:
Blend transitions smoothly over a transitional window (e.g., $\text{Re} \in [2000, 4000]$):
```python
if re_val < 2000.0:
    visc_factor = factor_lam
elif re_val > 4000.0:
    visc_factor = factor_turb
else:
    # Smooth linear or cubic hermite blend
    w = (re_val - 2000.0) / 2000.0
    visc_factor = (1.0 - w) * factor_lam + w * factor_turb
```

---

## 2. Laminar Viscosity Derivatives

When a component includes a laminar viscous correction $(1 + C / \text{Re})$, the pressure drop formula contains both quadratic and linear terms:
$$\Delta P = K \rho Q |Q| \left(1 + \frac{C}{\text{Re}}\right) = K \rho Q |Q| + K' \mu Q$$

The exact derivative with respect to flow rate $Q$ is:
$$\frac{\partial \Delta P}{\partial Q} = 2 K \rho |Q| + K' \mu$$
*(Notice the linear viscous term has coefficient $1$, **not** $2$)*.

---

## 3. Uncapped & Recoverable Curves

During intermediate Newton iterations, trial flow rates may momentarily overshoot or become negative.
- **Never cap pressure drop with `max(0.0, dp)` or `min(...)` without smoothing.**
- **Never set derivatives to zero:** Zero derivatives create singular or rank-deficient Jacobian matrices.
- The derivative must remain active, positive, and continuous across all flow values so the solver can naturally guide itself back to the valid physical domain.

---

## 4. Fischer-Burmeister MCP for Closed / Switching Valves

For components that open/close dynamically (such as **Check Valves**, **Relief Valves (PSV)**, and **Rupture Discs**), do **NOT** use artificial extreme resistances (e.g. $R = 10^{10}$). High artificial resistances create ill-conditioned matrices ($10^{15}$ condition numbers).

Instead, use the Mixed Complementarity Problem (MCP) formulation:

### Implementation:
1. In `__init__`, set:
   ```python
   self.use_mcp_formulation = True
   ```
2. Compute the fully open pressure drop as a value only: a Cv seat uses `open_seat_dp(cv, flow_rate, density, viscosity)` from `check_valve.py`; a relief device implements `open_dp(flow_rate, density, viscosity)`. No derivative is needed; the solver differentiates the row numerically.
3. In `calculate_delta_p(...)`, evaluate the smooth Fischer-Burmeister C-function when node pressures are provided:
   $$\Phi(a, b) = \sqrt{a^2 + b^2 + \epsilon^2} - (a + b) = 0$$
   where:
   $$a = \frac{Q}{Q_{\text{scale}}}, \quad b = \frac{P_{\text{cracking}} + \Delta P_{\text{friction}} - \Delta P_{\text{valve}}}{P_{\text{scale}}}$$

```python
def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001,
                      p_in_pa: float = None, p_out_pa: float = None, update_state: bool = True) -> float:
    if p_in_pa is not None and p_out_pa is not None:
        p_scale = 100000.0  # 1 bar scale
        q_scale = 0.001     # 1 L/s scale
        epsilon = 1e-4
        
        cracking_pa = self.cracking_pressure_bar * 100000.0
        dp_valve = p_in_pa - p_out_pa
        dp_friction = open_seat_dp(self.cv, flow_rate, density, viscosity)
        
        a = flow_rate / q_scale
        b = (cracking_pa + dp_friction - dp_valve) / p_scale
        
        phi = math.sqrt(a**2 + b**2 + epsilon**2) - (a + b)
        return dp_valve - p_scale * phi

    # Fallback when solving without MCP node pressures (e.g. standalone test)
    # Use hyperbolic tangent smoothing:
    scale = 1e-5
    dp_friction = open_seat_dp(self.cv, flow_rate, density, viscosity)
    return self.cracking_pressure_bar * 1e5 * math.tanh(flow_rate / scale) + dp_friction
```

**Open flow coefficient when closed:** while closed, the Fischer-Burmeister function evaluates the drop with the open friction characteristic. Use the fully open flow coefficient (e.g. `self.cv`), not a state-dependent effective one, or the derivative becomes extremely stiff while the device is closed.

---

## 5. Dynamic Topology Reduction (`blocks_flow_on_shutdown`)

Components that block fluid flow completely when turned off (such as positive displacement volumetric pumps or shut-off valves) can isolate sections of a network.

Set:
```python
self.blocks_flow_on_shutdown = True
```
When `self.active = False`, the solver's DFS reachability pre-processor will automatically isolate and prune dead-end inactive subgraphs, preventing singular matrices and numerical collinearity.

---

## 6. Solver Classification Attributes Summary

| Attribute | Type | Default | Set `True` When... |
| :--- | :--- | :--- | :--- |
| `is_pressure_boundary` | `bool` | `False` | Component imposes a fixed pressure boundary (e.g. `Tank`, pressure boundary). |
| `blocks_flow_on_shutdown` | `bool` | `False` | Component completely stops all flow through its ports when `self.active == False`. |
| `use_mcp_formulation` | `bool` | `False` | Component switches states dynamically between closed/cracking/open using complementarity equations. |
| `is_relief_driver` | `bool` | `False` | Component drives the system pressure (pump, source). See below. |

**Relief drivers:** the relief analysis ramps every relief driver with a factor λ (0 = at rest, 1 = case value) to find the steady state at which each relief device reaches its set pressure. Implement `apply_relief_ramp(lam)` (scale the driving parameters, keep the case values) and `reset_relief_ramp()` (restore them), and add the type to `RELIEF_DRIVER_TYPES` in `frontend/src/constants/case_constants.js` so the "Ramp during relief analysis" option (`relief_ramp_enabled`) appears in the setup panel.

---

## 7. Jacobian Integrity During Solver Iterations

When the solver runs iterations, it calls `calculate_delta_p(..., update_state=False)`.
- **Do NOT mutate internal status flags (like bursting a rupture disc or locking a latch) when `update_state=False`.**
- Do not check dynamic thresholds (e.g. pressure above set pressure) during iterations; use static state flags (`_was_open`, `is_burst`) so the Jacobian stays smooth and continuous.
- Only update dynamic state variables (e.g., `self.is_burst = True`) when `update_state=True` (which occurs during post-solve telemetry generation).

---

## 8. Sign Convention of `calculate_delta_p`

Pressure drop must be an odd function of flow: use `q * abs(q)`, never `q**2`. An even function makes a branch with reversed flow act as a pressure source and breaks the Jacobian (its derivative `2*c*|q|` is even, so the function must be odd). Test it with `calculate_delta_p(+q) == -calculate_delta_p(-q)`.

---

## 9. Solver Internals Equipment Must Respect

These describe solver behaviour in `solver.py`; the full contract is in `backend/simulation/equipment/base_node.md`.

- **Fallback solvers:** when falling back to SciPy's dense solvers (`root` with `method='lm'` or `'hybr'`), pass a dense-wrapped analytical Jacobian (`jac=lambda x: calculate_jacobian(x).toarray()`). Finite differences there are slow (fallback solves should stay under ~600 ms on large systems).
- **Backtracking depth:** highly non-linear networks need at least 25 line-search backtracking steps to pass through high-resistance transitions.
- **Pruned node pressures:** `_fill_pruned_pressures` carries the solved pressures at zero flow into the nodes left out of the solve, side by side (each node has an inlet and an outlet side). `_carry_at_rest` does the carrying for both this step and the stagnant step: unchanged along a pipe, across a device by its zero-flow rise or drop in either direction (`_get_node_p_out`, inverted by `_p_in_at_rest`). Device state is refreshed once from the final pressures. Blocking devices (`blocks_at_rest`: closed relief devices, stopped PD pumps) pass no pressure from one side to the other, so each side takes its own neighbour's pressure; the outlet of a closed relief device takes its downstream pressure. `is_pressure_reference` is the test for a node that fixes a circuit (pruning, islands); the stagnant step anchors only on pressure boundaries and flowing edges, since a flow source at zero flow fixes no pressure.
- **Stagnant sections:** a section shut in by blocking devices (stopped PD pump, check valve without flow, closed relief device) has no pressure in the equations. `_assign_stagnant_pressures` sets it from the strongest leak path (stopped pump to its suction, then check valve, then relief seat; highest pressure on a tie), carries it through the section with `_carry_at_rest` (a running pump keeps its shutoff head) and shifts it so that no check valve opens and no relief device lifts, and flags the ports `stagnant`. Leakage never lifts an 'auto' relief device (also while the relief passes hold it closed, `NetworkSolver.held_closed_ids`); in the unmitigated pass the device has failed and the section takes the full leak-path pressure. If a check valve pushes a section above a set pressure, the check valve wins so the breach stays visible. A new check valve type goes into `CHECK_VALVE_TYPES` in `solver.py` and needs `cracking_pressure_bar`.
- **Restore mutated state:** `run_sequential_relief_simulation` changes `forced_state` of relief devices during its passes and restores it in a `finally`. Any new analysis that temporarily mutates shared node state must do the same, because the WebSocket reuses the network between runs.
