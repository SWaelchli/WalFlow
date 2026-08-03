# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.1.4]

- Added analytical sparse Jacobian calculations across all equipment model equations.
- Switched to custom sparse Newton-Raphson solver with backtracking line search for faster execution on large networks.
- Implemented warm-start cache caching converged state vectors to speed up operating case and slider adjustments.
- Added "Sparse Newton" option to frontend settings side panel and set it as the default solver.
- Optimized 3-Way TCV control updates with pressure correction and unreachable setpoint checks to eliminate oscillations.
- Implemented control settled early-exit checks to speed up convergence on saturated control networks.

