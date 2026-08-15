# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.2.0]

### Added

- **Imperial / US Customary Unit System**: Full bidirectional unit conversions across the entire application supporting standard engineering units (Pressure: `psi(a)` / `psi(d)`, Flow: `gpm`, Temperature: `°F`, Power: `HP`, Length: `ft`, Pipe Roughness & Diameter: `in`, Velocity: `ft/s`).
- **Global Unit System Selector**: Modern toggle switch in Sidebar Settings allowing seamless switching between Metric (SI) and Imperial (US Customary) unit systems, with persistence to localStorage and saved diagram files.
- **Pressure and Flow Sources** (`PressureSource` / `FlowSource`): Split the universal source into two separate components: a Constant Pressure Source (1 inlet + 1 outlet, solid concentric circle symbol) and a Constant Flow Source (1 outlet only, wave symbol), styled in dark theme colors.
- **Piping Specifications & Classes Catalog (`/pipes`)**: Replaced generic pipes with an industrial pipe classes architecture. Includes 4 standard built-in example specifications (`CS01`, `SS01`, `LT01`, `DX01`), size grids ($DN/NPS \to OD, WT, ID$), P-T ratings, and custom class CRUD management for `admin` and `pipe_manager` roles.
- **Direct Inline Pipe Spec Editing**: In-place inline page editing on the `/pipes` catalog page with live P-T rating point adjustments and dynamic internal diameter calculations, plus mini-dialog creation for new specifications.
- **Pipe Class Library Import/Export & Seed Management**: Full JSON library import and export for pipe class catalogs with duplicate conflict detection and optional example database seeding/deletion.
- **Project-Level Pipe Specification Management & Search**: Real-time text search filter for project specifications, direct navigation to project settings via the sidebar gear (⚙️) icon, and project-level "Allow Manual / Custom Dimensions" Yes/No policy selector.
- **Manual Pipe Design Parameters**: Dedicated "Inner Diameter" field with explicit Design Temperature and Design Pressure inputs for custom non-catalog pipes in the setup inspector.
- **Equinor TR2000 Multi-Spec Batch Importer**: Checkbox selection, Select All/Unselect All quick actions, solid sticky table header, live batch progress, and interactive duplicate conflict resolution dialog (Update, Import as Copy `(1)`, Skip, or Abort).
- **Localized Surface Roughness**: Removed global canvas roughness; pipe friction factor is now calculated from localized roughness auto-mapped from material groups.
- **AI Agent Skill (`.agents/skills/pipe-classes`)**: Added dedicated skill documentation for AI pair programmers and LLM agents.




### Changed

- DataList matrix table now allows direct selection of Piping Specifications rather than pipe schedules.
- Added global Enter key handler to automatically blur/deselect text or numeric input fields on keypress, triggering validation and committing app updates.
- Redesigned all modal overlay dialogs (Login, Save As, New Drawing, Help & Shortcuts, Project Manager, Admin Setup, and Admin Hub) to use the global light theme tokens and generic classes defined in `index.css`.
- Batch solve matrix no longer uses a hardcoded `localhost` backend URL; it now uses the relative `/api/simulation/batch` endpoint, fixing the CORS / `ERR_FAILED` error when deployed behind a reverse proxy (e.g. Cloudflare).
- Fixed canvas loading overlay race conditions on synchronous example diagrams (e.g., API 614) by deferring heavy state updates to the next event loop tick.
- Implemented immediate modal closure and canvas loading overlay display during database fetches, enabling smooth wave animations on the compositor during network idle times.
- Realigned `FlowDropMark` SVG structure to nest flow lines within the pulsating container, and toggled SVG animations when hidden to save CPU.
- Configured correct `pointerEvents` on `CanvasLoadingOverlay` to block mouse clicks during canvas loads.
- Implemented ISO 5167-2:2022 orifice pressure-drop calculation with a selectable calculation standard (Reader-Harris/Gallagher meter coefficient with §5.4 Formula (7) permanent pressure loss, plus the legacy `classic_cd` model), including a standard selector in the setup panel and a matching physics preview in the orifice detail panel.
- Improved orifice detail-panel chart to use dynamic axis scaling for both X and Y axes, ensuring the chart remains usable for small values.

- Fixed Equinor TR2000 REST API client response parsing to properly unwrap dictionary envelopes (`getPlant`, `getPCS`, `getPipeSize`, `getTempPressure`), restoring live plant querying, spec search, and specification synchronization.
- Fixed project specification filter reset bug where re-enabling all specifications failed to clear restrictions in the database.

- Fixed active project context synchronization ensuring project-level specification restrictions immediately take effect on the canvas edge inspector and DataList matrix table.
- Orifice detail-panel pressure-loss curve now matches the solver by reporting the solver-effective connected-pipe diameter and calculation standard in simulation telemetry, so the chart curve, beta ratio, and operating point all use the same geometry.
- Resolved canvas state recovery loss and database synchronization detachment on page refresh.
- Resolved development-only empty canvas bug where React StrictMode unmount cleared the hydration timeout without rescheduling it.
- Refactored local session draft validation to use the dynamic `FILE_FORMAT_VERSION` constant rather than a hardcoded string.
- Fixed `PressureSource` solver calculation return value to correctly initialize the Dirichlet pressure boundary.
- Fixed solver dead-end leaf pruning and DFS reachability to correctly handle `FlowSource` boundary nodes.
- Fixed solver warm-start cache lookup collisions by incorporating active node pressure-boundary states into the topology key.
- Fixed solver pressure drop evaluation and mass-balance constraints for 2-port inline nodes (such as flow sources and pumps) when their inlet ports are unconnected.


---
