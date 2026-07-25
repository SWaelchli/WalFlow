# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.1.1]

### 🔩 Equipment & Simulation
- Added **Check Valve (Non-Return Valve)** equipment with configurable flow coefficient ($C_v$), cracking pressure, backflow prevention, SVG symbol, and property editor integration.
- Added **Check Valve with Orifice** equipment combining non-return check valve seat logic with Bernoulli bypass orifice restriction math from `Orifice` equipment for controlled sub-cracking and reverse bypass flow.
- Fixed **3-Way TCV (Temperature Control Valve)** network residual pressure coupling and telemetry propagation in the solver.

### 🎨 Visualizations & Heatmaps
- Separated Volume Flow (`l/min`) and Velocity (`m/s`) into dedicated heatmaps with individual auto-scaling and custom range controls.

### 🔐 Admin Hub & Registration Backlog
- Added **First-Time Admin Setup** modal on launch when no admin user exists in the database.
- Added **Registration Approval Backlog** for admins to approve or reject self-registered user accounts before login.
- Added **User Management** panel to view registered users, update roles (`user` / `admin`), and delete accounts.
- Added **Database Inspector & Diagram Manager**:
  - Open any user diagram directly onto the active canvas.
  - Reassign diagram ownership between users via inline dropdowns.
  - Duplicate, rename, export `.wlf` files, and delete diagrams with popup confirmation.

### 🎨 UI & Layout Polish
- Introduced **Top Navbar** (`Navbar.jsx`) housing WälFlow logo, primary **Run Simulation** action, canvas file operations (**Export**, **Import**, **Clear Canvas**), **Cloud Projects**, **Admin Hub**, and user auth status.
- Refactored **Sidebar** (`Sidebar.jsx`) to focus strictly on component drag & drop, global settings, and stats diagnostics, with unified tab styling (`#395253` dark teal active state).
- Added `# Design & Styling Philosophy` reference section in `GEMINI.md` defining color tokens, button state rules, and component guidelines.
- Redesigned sidebar header with WälFlow logo and sleeker user account pill bar.
- Clicking WälFlow logo opens the Help & Info modal directly to the "About & Copyright" tab.
- Reordered Help & Info modal tabs: **Keyboard Shortcuts**, **User Guide**, and **About & Copyright**.
- Unified design system and styling across all modals (`LoginModal`, `AdminSetupModal`, `AdminHubModal`, `ProjectManagerModal`, `HelpInfoModal`) using dark teal glassmorphism theme and custom gradients.

### 📚 Documentation & Examples
- Added **Greeting Canvas** as the default initial application view featuring a centerpiece "WELCOME TO WALFLOW" introductory note and a ready-to-run demo hydraulic circuit.
- Added informative canvas note callout bubbles to all pre-configured example hydraulic diagrams to explain diagram context and hydraulic principles.

### ⚙️ System & Proxy Fixes
- Added backend retry logic during frontend startup for server connection stability.
- Migrated FastAPI startup handlers to modern `lifespan` context manager.
- Fixed Vite proxy configuration targeting `127.0.0.1:8000` to prevent IPv6 `ECONNREFUSED` connection issues.
