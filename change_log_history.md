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

## [0.1.3]
- Fixed vertical panel overlap between Scenario & Case Manager and Property Editor overlays on the right side of the canvas
- Implemented autoScale-aware dynamic top spacing with smooth CSS transitions for all right-hand panel overlays
- Added support for dynamic maxHeight boundaries and vertical scroll bar on Property Editor when pushed down
- Aligned Scenario & Case Manager design layout, typography, and close button with Heatmap Legend
- Compacted Scenario & Case Manager components and moved relief case explanations to tooltips
- Fixed unresponsive Run Simulation button by defaulting secure cookies to false in local development, enabling guest/unauthenticated simulations when running locally, and adding automatic frontend WebSocket reconnection upon login and connection drops
- Blocked backend application startup in production environments if `WALFLOW_SECRET_KEY` is not configured, and replaced the hardcoded secret fallback with an auto-generated random key in development environments (SEC-01)
- Enforced WebSocket simulation authentication requirement by default (`WALFLOW_REQUIRE_WS_AUTH=true`) across all environments to prevent unauthorized compute usage, while still allowing explicit disablement (SEC-02)
- Refactored `useWebSocketSimulation.js` to store active cases, telemetry modes, and callbacks in React refs, eliminating WebSocket connection churn and redundant reconnects when switching cases or toggling telemetry views

## [0.1.2]

- Fixed pipe selection and deletion conflict by migrating ReactFlow edge IDs to unique random UUIDs.
- Implemented dynamic label scanning to assign sequential human-readable labels to newly created and duplicated pipes.
- Implemented case variable base-value equivalence check to automatically clear overrides when matching base case values.
- Implemented automatic version upgrade to current APP_VERSION for cloud diagrams upon opening.
- Added support for fully closed (0%) linear control valves in the UI and implemented a stiff linear resistance model in the backend physics simulation to block flow completely.

## [0.1.1]

### 🛡️ Quality, Stability, Performance & Security
- **Core Physics & Solver Stability**: Segregated fluid properties calculation into an outer loop of the static solver, achieving up to 21x faster convergence; resolved mixing valve direction lockups and popping safety valve hysteresis.
- **Dynamic Port Feedback**: Integrated thermodynamic feedback loops to dynamically recalculate local density and viscosity across all equipment nodes.
- **WebSocket & Auth Hardening**: Isolated multi-connection simulation state by removing globals, and implemented JWT validation checks on WebSocket connections.
- **WebSocket Dev Proxy Fix**: Added a `/ws` proxy rule with WebSocket support enabled (`ws: true`) to the Vite configuration, and updated the frontend WebSocket handler to use relative hosts. This ensures authentication cookies are automatically and securely forwarded to the backend during local development, resolving an issue where the solver would fail to update due to connection rejections.
- **KPI Stats Mapping**: Restored correct mapping of solver iterations and residual values in the simulation KPI payload.
- **UI Performance Optimization**: Hoisted case scaling computations to eliminate $O(N^2)$ render scans, and optimized ReactFlow node drag/select handlers to remove drag latency.

### 🎛️ Scenario & Case Manager
- Implemented **Scenario & Case Manager** floating overlay component (`CaseManager.jsx`) on the canvas:
  - Unified controls for active Operating Case and Relief Case View (vertical segmented cards) with Title Case capitalization.
  - Renamed the active case views to match the Datalist nomenclature: `Relieved system pressure (bara)`, `Peak system pressure (bara)`, and `Unmitigated peak pressure (bara)`.
  - Added visibility toggle button (💼) inside the ReactFlow control panel and `Hide/Show Case Manager` buttons in the DataList tab headers (Operating Cases and Relief tabs).
  - Restructured absolute positioning: the Heatmap Legend remains at `top: 16px` (on top of the stack), while the Case Manager dynamically offsets below it (`top: 190px`) if the Heatmap is active, or sits at `top: 16px` if inactive.
  - Removed the `"Relief Active"` bubble, baseline descriptions, and overrides count text for a cleaner look.
  - Added a close (x) button in the top-right corner of the Case Manager panel to easily dismiss it.
  - Set the default initial state of the Case Manager visibility to hidden (`false`) on app load and refresh.
- Added **Peak System Pressure Telemetry & Heatmap Auto-Scaling**:
  - Implemented automatic telemetry interpolation (`case_resolver.js`) for the new `Peak system pressure (bara)` canvas view.
  - Scales unmitigated node and edge pressures down to the cracking threshold of the first popped relief device, reflecting the peak system state on canvas values.
  - Bound the active `telemetryMode` to heatmap auto-scaling bounds calculations (`App.jsx`), ensuring the canvas heatmap scaling dynamically adjusts when switching between different relief views.
  - Added robust fallback calculations (`getMaxPressure`) to extract peak and unmitigated bounds directly from the telemetry dataset if the KPIs block is unpopulated, along with console debug logs to trace the scaling factor $S$.
- Cleaned up Data Panel (`DataList.jsx`):
  - Renamed the `"Relief & Contingency"` tab to `"Relief Analysis Matrix"`.
  - Removed the `"Relief Operating Statuses"` row from the table body.
  - Removed old case view toggles in the header toolbar, directing the user to the floating overlay panel.
  - Integrated dynamic background highlighting in the Relief contingency table rows to reflect the active telemetry mode.
  - Added active operating case `⚡ Switch` buttons to the Relief Analysis Matrix table headers.
  - Renamed the `➕ Duplicate Case` button to `➕ New Case` and moved the `▶ Batch Solve Matrix` button to the very right of the Operating Cases header toolbar.
  - Removed the redundant floating Case Manager guide text from the Relief tab header.

### 💾 State Management & Persistence
- Implemented **Dual-Mode Session Persistence & Cloud Auto-Sync** (`useAutoSaveSession.js`):
  - **Unlinked Scratchpad Draft Mode**: Canvas state, viewport framing, fluid settings, and operating cases automatically save to browser `localStorage` (debounced 1000ms + `beforeunload`), seamlessly recovering progress on page refresh.
  - **Active Cloud Project Auto-Sync Mode**: Loading or saving a project in `ProjectManagerModal` links it as the `activeProject`, automatically syncing edits to the FastAPI backend database (`PUT /api/diagrams/{id}`).
- Consolidated status pill and Cloud Projects button into a **Unified Cloud & Auto-Save Control Component** in the top Navbar (`Navbar.jsx`), saving horizontal navbar space and providing clear live status indicators (`🟢 Cloud: Title`, `🟠 Saving...`, `🟢 Saved to browser`, `⚠️ Sync Error`).
- Added active project status card in `ProjectManagerModal` with **Detach Cloud Sync** button for unlinking projects.
- Added **`Ctrl + S` Keyboard Shortcut** (`useKeyboardShortcuts.js`) intercepting browser page save prompts to execute instant manual workspace saves, listed in `HelpInfoModal.jsx`.
- Added **Safe Diagram Loading Guard** (`handleLoadDiagramWithCheck`) that prompts confirmation and automatically detaches cloud sync before loading example templates or imported `.wlf` files to prevent overwriting cloud database projects.
- Added session restoration toast notification on boot when a saved draft is hydrated.
- Fixed **Cloud Project `.wlf` File Export Bug** in `ProjectManagerModal.jsx`: fetched full diagram detail payload before creating download blob so exported `.wlf` files contain valid PFD JSON structure instead of `undefined`.

---

### ⚡ Operating Case Manager (Multi-Case Scenario Engine)
- Added **Operating Case Manager** allowing users to create, manage, and compare multiple operating cases (scenarios) on a single hydraulic diagram.
- Implemented **Property Classification Matrix**: separates fixed **Global Hardware Specs** (`🌐 Global`) from dynamic **Case Variables** (`⚡ Case Variable`).
- Added **Case Switcher Bar** in top Navbar with active case selector, `+ New Case` (duplicate active case), rename, and delete controls.
- Added Property Inspector badging (`🌐 Global` / `⚡ Case Variable`), `● Overridden` indicators, and `↺ Reset to Base` buttons across **all** component types (Filters, Pumps, Valves, Heat Exchangers, Regulators, Orifices).
- Added canvas node visual indicators (orange `⚡` lightning SVG badge) for equipment containing active operating case overrides.
- Fixed missing `Optional` import in `backend/simulation/graph_parser.py` causing backend container startup crash.
- Added **Operating Cases Matrix** tab in bottom Data Panel (`DataList.jsx`) with side-by-side KPI comparison matrix, relative delta metrics (`+18.2 bar (+25%)`), and cavitation risk highlights.
- Configured Batch Solver to execute strictly on-demand via the `▶ Batch Solve Matrix` button.
- Configured single-case simulation runs (via top `Run Simulation` button) to immediately update that active case's KPIs in the matrix and auto-recalculate differential delta metrics across all other cases when `Base Case` is run.
- Fixed `Case 1` as the immutable baseline operating case (`Case 1 (Base)`), with newly duplicated cases defaulting to sequential names (`Case 2`, `Case 3`, etc.).
- Renamed matrix first column header to **`Performance Metric`** with fixed `200px` width and single-line `whiteSpace: nowrap` formatting, permanently locking all row heights at 36px.
- Added inline case renaming in the Data Panel matrix table with dynamic input width sizing and single horizontal line layout.
- Added HTML5 drag-and-drop column reordering (`⋮⋮`) and red trash icon delete controls (`🗑️`) to non-base case headers in the Data Panel matrix.
- Removed outer table margins in the Operating Cases Matrix tab for flush alignment with Data Panel borders, matching standard data tables.
- Implemented full-height top-to-bottom vertical column drop line insertion indicator (`borderLeft: 3px solid #FA8507`) across all header and data cells for in-between column reordering.
- Removed lightning icon from the Data Panel tab button label (`Operating Cases Matrix`).
- Streamlined the top Navbar case section to feature exclusively the Case Switcher Dropdown and `+ New Case` button.
- Implemented backend REST endpoint (`POST /api/simulation/batch`) and `GraphParser` case override resolution engine.

### 🔩 Equipment & Simulation
- Fixed **Linear Regulator Position Display Bug**: Updated `LinearRegulatorNode.jsx` and `ValveDetails.jsx` to correctly extract the valve opening percentage from simulated `telemetry.opening_pct` rather than falling back to the default `node.data.opening` (which rendered as 100% on the canvas).
- Added active/inactive status as a case variable to pumps and coolers:
  - Centrifugal pumps when inactive produce 0 pressure boost but allow flow.
  - Volumetric (positive displacement) pumps when inactive block flow using a high-resistance model.
  - Heat Exchangers (coolers) when inactive bypass heat transfer calculations (inlet temperature propagates directly to outlet).
  - Added "Operating Status" select dropdown to Property Editor.
  - Added a red `OFF` badge to inactive nodes on the canvas.
- Fixed **Relief & Contingency Matrix Overrides**: Changing relief modes (`Auto`, `Forced Closed`, `Forced Open`) for any case in the matrix now correctly updates target case overrides and immediately triggers batch re-simulation across all cases.
- Fixed **Unmitigated Peak Pressure** calculation in Data Panel Relief & Contingency tab to resolve peak pressure from unmitigated node telemetry, and updated telemetry mode toggle buttons to `🟢 Normal Relief (Mitigated)` and `🔴 All Relief Devices Closed (Unmitigated)`.
- Added **Pressure Safety Relief Valve (`PSV` / `PRV`) & Emergency Relief Analysis**:
  - Implemented `PressureSafetyValve` equipment supporting **Pop Action** (snap-open with blowdown reset), **Modulating** (proportional lift), and **Rupture Disc** (burst diaphragm) relief modes.
  - Implemented **Dual-Pass Hydraulic Solver** engine in backend (`solver.py` & `main.py`) with unmitigated-first warm-starting optimization, automatically calculating both normal relief operation and worst-case unmitigated baseline overpressure.
  - Added **Global Telemetry Mode Switcher** pill in top Navbar (`[ 🟢 Mitigated ]` vs `[ 🔴 Unmitigated ]`) that globally switches telemetry across canvas lines, heatmaps, inspector panels, and bottom Data Panel tables.
- Added **Rupture Disc (`RuptureDisc` / `rupture_disc`)** safety equipment component:
  - Supports **Full Bore** ($C_v$ governed) and **Reduced Bore** (Bernoulli Orifice equation $Q = C_d A \sqrt{2 \Delta P / \rho}$ based on `orifice_diameter_mm`).
  - Evaluates as intact at the start of each simulation run ($P_{\text{in}} < P_{\text{burst}}$); bursts 100% open if burst pressure is reached.
  - Added mechanical diaphragm SVG symbol (`RuptureDiscNode.jsx`), inspector Safety Assessment Card (`RuptureDiscDetails.jsx`), Property Editor controls, and registered item under `Pressure & Flow Control` in Sidebar.
- Audited and sanitized all 10 pre-built `.wlf` example PFD files, removing redundant `pipe_diameter` JSON attributes from orifice-like nodes (`Orifice`, `CheckValveOrifice`, `RuptureDisc`).
- Implemented automated **ID Deduplication & Sanitization Guard** inside `loadData()` in `App.jsx` to resolve non-unique or duplicate node/edge IDs on-the-fly upon diagram loading/importing.
- Fixed lube oil Vogel viscosity calculation formula in `FluidProperties` to accurately compute dynamic viscosity across temperature ranges (e.g., ISO VG 46 cold start at 10 °C evaluating to ~215 mPa·s / 240 cSt).
- Implemented dynamic Reynolds number ($Re$) dependent viscosity corrections across `Orifice`, `CheckValveOrifice`, `LinearControlValve`, `RemoteControlValve`, `CheckValve`, `LinearRegulator`, `Filter`, and `HeatExchanger` equipment nodes, capturing low-$Re$ viscous friction losses under cold-start conditions.
- Added **Check Valve (Non-Return Valve)** equipment with configurable flow coefficient ($C_v$), cracking pressure, backflow prevention, SVG symbol, and property editor integration.
- Added **Check Valve with Orifice** equipment combining non-return check valve seat logic with Bernoulli bypass orifice restriction math from `Orifice` equipment for controlled sub-cracking and reverse bypass flow.
- Fixed **3-Way TCV (Temperature Control Valve)** network residual pressure coupling and telemetry propagation in the solver.

### 🎨 Visualizations & Heatmaps
- Separated Volume Flow (`l/min`) and Velocity (`m/s`) into dedicated heatmaps with individual auto-scaling and custom range controls.
- Added **Global vs. Case-Specific Auto-Scaling** toggle (`Global` check mark box) in the Heatmap Legend, defaulting to global auto-scaling across all operating cases.
- Fixed Heatmap pipe stroke rendering by removing CSS `!important` overrides, enabling vibrant HSL pressure, temperature, flow, and velocity gradient displays across all pipes.
- Implemented per-case telemetry storage and switching, dynamically updating canvas line flow metrics, Data Panel process values, and Heatmaps when switching active operating cases.

### 🔐 Admin Hub & Registration Backlog
- Added **First-Time Admin Setup** modal on launch when no admin user exists in the database.
- Added **Registration Approval Backlog** for admins to approve or reject self-registered user accounts before login.
- Added **User Management** panel to view registered users, update roles (`user` / `admin`), and delete accounts.
- Added **Database Inspector & Diagram Manager**:
  - Open any user diagram directly onto the active canvas.
  - Reassign diagram ownership between users via inline dropdowns.
  - Duplicate, rename, export `.wlf` files, and delete diagrams with popup confirmation.

### 🎨 UI & Layout Polish
- Updated static pressure column headers in Data Panel table and CSV export to specify absolute pressure engineering units (`P Start (bara)` and `P End (bara)`).
- Reorganized UI layout: full vertical height Sidebar (`100vh`) with WälFlow logo top header, left-aligned **Run Simulation** button and Case Selector in Navbar without lightning icon, vertical divider grouping, and standardized controls.
- Standardized top Navbar typography (`Inter` font family, `12px` font size, `600` font weight across all buttons and `<select>` dropdowns) and updated auth controls to pair `🔒 Sign In` and `🔓 Sign Out` with clean text-only username display.
- Added configurable `RELEASE_STAGE` (`Beta`) constant in `constants.js` and rendered clean baseline-aligned version text (`v0.1.1 • Beta`) matching the `#395253` brand dark letter color next to the WälFlow logo in the top Navbar.
- Introduced **Top Navbar** (`Navbar.jsx`) housing WälFlow logo, primary **Run Simulation** action, canvas file operations (**Export**, **Import**, **Clear Canvas**), **Cloud Projects**, **Admin Hub**, and user auth status.
- Refactored **Sidebar** (`Sidebar.jsx`) to focus strictly on component drag & drop, global settings, and stats diagnostics, with unified tab styling (`#395253` dark teal active state).
- Added `# Design & Styling Philosophy` reference section in `GEMINI.md` defining color tokens, button state rules, and component guidelines.
- Redesigned sidebar header with WälFlow logo and sleeker user account pill bar.
- Clicking WälFlow logo opens the Help & Info modal directly to the "About & Copyright" tab.
- Reordered Help & Info modal tabs: **Keyboard Shortcuts**, **User Guide**, and **About & Copyright**.
- Unified design system and styling across all modals (`LoginModal`, `AdminSetupModal`, `AdminHubModal`, `ProjectManagerModal`, `HelpInfoModal`) using dark teal glassmorphism theme and custom gradients.

### 📚 Documentation & Examples
- Standardized equipment, tag, junction, and pipe naming in the example **API 614 Lube Oil System** diagram (`Example_API_614_LOS.wlf`) according to API 614 standard practices (replacing project-specific tags like `FO-3041A` and frame codes `RB35`/`RB28`).
- Added **Greeting Canvas** as the default initial application view featuring a centerpiece "WELCOME TO WALFLOW" introductory note and a ready-to-run demo hydraulic circuit.
- Added informative canvas note callout bubbles to all pre-configured example hydraulic diagrams to explain diagram context and hydraulic principles.

### ⚙️ System & Proxy Fixes
- Added backend retry logic during frontend startup for server connection stability.
- Migrated FastAPI startup handlers to modern `lifespan` context manager.
- Fixed Vite proxy configuration targeting `127.0.0.1:8000` to prevent IPv6 `ECONNREFUSED` connection issues.
