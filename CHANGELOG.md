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
- **Reducer / Expander Fitting Component (`ReducerNode`)**: Added dedicated pipe transition fitting supporting both Concentric and Eccentric geometries, Crane TP 410 gradual contraction/diffuser form losses, Bernoulli dynamic pressure conversion, and analytical Jacobian derivatives.
- **Fitting Standards & Pipe Schedules Catalog Database (`FittingStandard`)**: Implemented database model and REST API for ASME B16.9 factory-made wrought reducers (DN 20 to DN 600) and ASME B36.10M / B36.19M pipe schedules (STD, 40, 80, XS, 160).
- **Tabbed Catalog Interface (`/pipes`)**: Added subpage navigation tabs for **Piping Specifications** and **Fitting Standards & Schedules** with full catalog search, filtering, inline size editing, standard cloning, JSON library import/export, and default re-seeding.
- **Localized Surface Roughness**: Removed global canvas roughness; pipe friction factor is now calculated from localized roughness auto-mapped from material groups.
- **Pipe Class & Fitting Library Harmonization**: Full UI/UX harmonization between Piping Specifications and Fitting Standards tabs on `/pipes` (elevated white cards, segmented pills, standardized top bar buttons, SVG icons, animated feedback toasts).
- **Frontend Unit Tests**: Vitest + jsdom + React Testing Library (`npm test`).
- **Pipe Schedule Presets for Custom Lines**: Integrated standard nominal size (DN15–DN600) and schedule (STD, 40, 80, XS, 160) quick-pick selectors with live outer diameter, wall thickness, inner diameter, and flow area previews in both inspector and DataList table.
- **Smart Reducer Connected-Line Auto-Inheritance & Mismatch Detection**: Added 1-click auto-detection of connected pipe sizes and schedules on Reducer nodes, plus real-time mismatch warning alerts in the inspector and on canvas nodes.
- **Multi-Standard Support**: Seeded European DIN EN 10253-2 buttweld reducers alongside ASME B16.9 and mapped TR2000 specifications to their authorized default fitting standard.
- **Enhanced Equipment Categorization**: Reorganized sidebar into dedicated *Piping & Fittings* and *Distribution & Manifolds* sections, and added velocity color-coding in DataList.
- **AI Agent Skill (`.agents/skills/pipe-classes`)**: Added dedicated skill documentation for AI pair programmers and LLM agents.
- **Catalog-Driven Reducer Inspector**: Reducer sizes now come from the fitting standards catalog (incl. DIN EN 10253-2 and custom standards), follow the connected line's pipe class standard and wall thickness, and report missing data inline instead of guessing.
- **Fitting Standard Validation & Restore**: Fitting standard create/update/import is validated (atomic import), deletion is blocked while pipe classes reference a standard, and admins can restore edited built-in standards to factory data.

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
- Fixed reducer gradual-contraction loss coefficients (Crane TP 410 angle ranges were swapped, overstating losses ~57% for standard reducers) and the reducer Jacobian sign under static pressure recovery.
- Pipe classes now reject unknown fitting standard references, and pipe class library import keeps reducer / schedule standard codes.
- TR2000 design-code mapping to DIN EN reducers now matches whole words only; reducer nodes with null geometry no longer crash the graph parser.
- Fixed imperial pipe sizes stored 39× too small, misaligned DataList columns (added sortable Name column), numeric inputs reformatting while typing (now commit on blur/Enter, Esc reverts), cloud-load cancel leaving the wrong diagram active, and examples/files loaded over an open cloud drawing overwriting it.
- New pipes default to DN50 STD; pipes from older files show as Manual with their matching size or custom inner diameter. Undo history resets on load, covers add/connect/delete/paste/rotate, and is blocked on read-only drawings, which also block delete, paste and rotate.
- Centrifugal pumps are rated in head (m) with an efficiency input (pump only, excl. motor); a stopped pump acts as a flow resistance and a running pump resists reverse flow. Older files need the rated head entered once; examples are converted.
- PD pumps get a drive type (fixed speed with motor-overload warning, or VFD power limit) and no longer pass unlimited flow when fed from a pressurised header; pump power KPI now uses actual shaft power.
- Fixed throttling heat missing in valves, check valves and relief devices, TCV pressure drop using water viscosity, and inconsistent results when the control loop hits its iteration limit; physics tests now assert against independent references.
- Pressure regulators and back-pressure valves now settle on their setpoints (also PRV + BPR in series) regardless of settings or run history, close tight (lock-up) when nothing draws flow, and the solver reports unreachable setpoints, non-converged runs, impossible pressures (vacuum) and circuits without a tank or pressure source instead of showing a clean result.
- Solver accuracy: no more phantom flow in low-loss pipes (tolerance setting now takes effect), safe shared warm-start cache, Levenberg–Marquardt option solves all examples. API 682 example uses a centrifugal pump so both regulators work.
- Peak system pressure is now a solved steady state: pumps and sources are ramped until each relief device reaches its set pressure, replacing the old interpolation. The Peak view shows that state, the Relief Analysis Matrix shows per-device status, opening order, load and inlet pressures, and pumps/sources get a "Ramp during relief analysis" option.


---
