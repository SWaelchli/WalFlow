# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.1.1]

### 💾 State Management & Persistence
- Implemented **Dual-Mode Session Persistence & Cloud Auto-Sync** (`useAutoSaveSession.js`):
  - **Unlinked Scratchpad Draft Mode**: Canvas state, viewport framing, fluid settings, and operating cases automatically save to browser `localStorage` (debounced 1000ms + `beforeunload`), seamlessly recovering progress on page refresh.
  - **Active Cloud Project Auto-Sync Mode**: Loading or saving a project in `ProjectManagerModal` links it as the `activeProject`, automatically syncing edits to the FastAPI backend database (`PUT /api/diagrams/{id}`).
- Consolidated status pill and Cloud Projects button into a **Unified Cloud & Auto-Save Control Component** in the top Navbar (`Navbar.jsx`), saving horizontal navbar space and providing clear live status indicators (`🟢 Cloud: Title`, `🟠 Saving...`, `🟢 Saved to browser`, `⚠️ Sync Error`).
- Added active project status card in `ProjectManagerModal` with **Detach Cloud Sync** button for unlinking projects.
- Added **`Ctrl + S` Keyboard Shortcut** (`useKeyboardShortcuts.js`) intercepting browser page save prompts to execute instant manual workspace saves, listed in `HelpInfoModal.jsx`.
- Added **Safe Diagram Loading Guard** (`handleLoadDiagramWithCheck`) that prompts confirmation and automatically detaches cloud sync before loading example templates or imported `.wlf` files to prevent overwriting cloud database projects.
- Added session restoration toast notification on boot when a saved draft is hydrated.

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
