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
2. Implement `calculate_open_friction_and_deriv(flow_rate, density, viscosity)` to compute the fully open pressure drop and its derivative.
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
        dp_friction, _ = self.calculate_open_friction_and_deriv(flow_rate, density, viscosity)
        
        a = flow_rate / q_scale
        b = (cracking_pa + dp_friction - dp_valve) / p_scale
        
        phi = math.sqrt(a**2 + b**2 + epsilon**2) - (a + b)
        return dp_valve - p_scale * phi

    # Fallback when solving without MCP node pressures (e.g. standalone test)
    # Use hyperbolic tangent smoothing:
    scale = 1e-5
    s = 0.5 * (1.0 + math.tanh(flow_rate / scale))
    dp_friction, _ = self.calculate_open_friction_and_deriv(flow_rate, density, viscosity)
    return self.cracking_pressure_bar * 1e5 * math.tanh(flow_rate / scale) + dp_friction
```

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
| `is_pressure_boundary` | `bool` | `False` | Component imposes a fixed pressure boundary (e.g. `Tank`, constant pressure source). |
| `is_flow_boundary` | `bool` | `False` | Component imposes a fixed volumetric flow boundary into the network. |
| `blocks_flow_on_shutdown` | `bool` | `False` | Component completely stops all flow through its ports when `self.active == False`. |
| `use_mcp_formulation` | `bool` | `False` | Component switches states dynamically between closed/cracking/open using complementarity equations. |

---

## 7. Jacobian Integrity During Solver Iterations

When the solver runs iterations, it calls `calculate_delta_p(..., update_state=False)`.
- **Do NOT mutate internal status flags (like bursting a rupture disc or locking a latch) when `update_state=False`.**
- Only update dynamic state variables (e.g., `self.is_burst = True`) when `update_state=True` (which occurs during post-solve telemetry generation).
