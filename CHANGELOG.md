# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.1.4]

- **Major Solver Performance & Stability Upgrade**: Introduced a custom sparse Newton-Raphson solver yielding up to **$22\times$ faster** execution on large networks (~100ms) and **$9\times$ faster** batch matrix solves.
- Added analytical sparse Jacobian calculations across all equipment model equations.
- Implemented warm-start cache caching converged state vectors to speed up operating case and slider adjustments.
- Added "Sparse Newton" option to frontend settings side panel and set it as the default solver.
- Optimized 3-Way TCV control updates with pressure correction and unreachable setpoint checks to eliminate oscillations.
- Implemented control settled early-exit checks to speed up convergence on saturated control networks.
- Corrected analytical derivatives of filter, orifice, and heat exchanger pressure drops in transitional/laminar regimes.
- Implemented smooth transition blending between laminar and turbulent pipe friction factor regimes to avoid discontinuities.
- Damped control valve outer loop relaxation factors to stabilize convergence on highly viscous systems.

