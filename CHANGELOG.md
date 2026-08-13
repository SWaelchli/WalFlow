# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.2.0]

### Added

- **Universal Fluid Source** (`FluidSource`): new boundary-condition component supporting two modes — *Constant Pressure* (Dirichlet pressure BC, stamped in bara) and *Constant Flow* (high-stiffness spring formulation in L/min). Includes injected fluid temperature, live telemetry footer on canvas, P/Q mode badge, and per-scenario case variable overrides for `source_pressure_bara` and `source_flow_lmin`.

### Changed

- Added global Enter key handler to automatically blur/deselect text or numeric input fields on keypress, triggering validation and committing app updates.
- Redesigned all modal overlay dialogs (Login, Save As, New Drawing, Help & Shortcuts, Project Manager, Admin Setup, and Admin Hub) to use the global light theme tokens and generic classes defined in `index.css`.
- Batch solve matrix no longer uses a hardcoded `localhost` backend URL; it now uses the relative `/api/simulation/batch` endpoint, fixing the CORS / `ERR_FAILED` error when deployed behind a reverse proxy (e.g. Cloudflare).
- Fixed canvas loading overlay race conditions on synchronous example diagrams (e.g., API 614) by deferring heavy state updates to the next event loop tick.
- Implemented immediate modal closure and canvas loading overlay display during database fetches, enabling smooth wave animations on the compositor during network idle times.
- Realigned `FlowDropMark` SVG structure to nest flow lines within the pulsating container, and toggled SVG animations when hidden to save CPU.
- Configured correct `pointerEvents` on `CanvasLoadingOverlay` to block mouse clicks during canvas loads.
- Implemented ISO 5167-2:2022 orifice pressure-drop calculation with a selectable calculation standard (Reader-Harris/Gallagher meter coefficient with §5.4 Formula (7) permanent pressure loss, plus the legacy `classic_cd` model), including a standard selector in the setup panel and a matching physics preview in the orifice detail panel.
- Improved orifice detail-panel chart to use dynamic axis scaling for both X and Y axes, ensuring the chart remains usable for small values.

### Fixed

- Orifice detail-panel pressure-loss curve now matches the solver by reporting the solver-effective connected-pipe diameter and calculation standard in simulation telemetry, so the chart curve, beta ratio, and operating point all use the same geometry.
- Resolved canvas state recovery loss and database synchronization detachment on page refresh.
- Resolved development-only empty canvas bug where React StrictMode unmount cleared the hydration timeout without rescheduling it.
- Refactored local session draft validation to use the dynamic `FILE_FORMAT_VERSION` constant rather than a hardcoded string.
- Fixed `FluidSource` constant pressure mode where target pressure was not stamped correctly in solver boundary conditions.
- Fixed solver dead-end leaf pruning and DFS reachability to correctly handle flow-mode boundary sources with a degree of 1.
- Fixed solver warm-start cache lookup collisions by incorporating active node pressure-boundary states into the topology key.
- Fixed solver pressure drop evaluation and mass-balance constraints for 2-port inline nodes (such as fluid sources and pumps) when their inlet ports are unconnected.

---
