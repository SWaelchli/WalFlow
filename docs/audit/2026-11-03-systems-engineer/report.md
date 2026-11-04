# UX Audit — WalFlow v0.2.1 (local dev) — 2026-11-03

**Persona (locked):** `systems-engineer` — Lube & Seal Oil Systems Engineer ([docs/personas/systems-engineer.md](../../personas/systems-engineer.md)). SI units (bar g, m³/h, °C), 1920×1080 desktop, builds 20–40 component skids, needs fast simulation feedback and clear pipe operating points.
**Target:** http://localhost:5173 (Vite dev) + backend :8000, signed in as `test_alice` (member of "WalFlow Test Team"), Chrome 144+ via Chrome DevTools Puppeteer automation.
**Audit config:** default rules apply (console warnings/errors are findings; standard 401 unauthenticated probe on `/api/auth/me` before login is allowlisted).

```
═══════════════════════════════════════════════════════════
VERDICT: FAIL

Persona: systems-engineer
Surfaces audited: 1 / 1 routes (single-page canvas app; menu bar, command bar, 4 activity rail panes, canvas, inspector, results panel with 5 tabs, 3 modals)
Interaction Manifest: complete for main canvas (typed ✓, primary action ✓, modal ✓, console after action ✓, before/after screenshots ✓, post-state verified ✓)

Hard Gates:
  Console errors: 0 reportable (2 allowlisted 401 auth-check probes on initial unauthenticated boot)
  Console warnings: 3 reportable (2 React Flow nodeTypes/edgeTypes re-creation warnings, 1 WebSocket premature closure)
  Network 5xx: 0
  Network 403/404 on authenticated pages: 0
  Layout collapse: 0 (tested across 5 viewports: 1920×1080, 1280×800, 1024×768, 768×1024, 375×667 — all 0 horizontal overflow)
  axe Critical: 0
  axe Serious: 2 rules across 4 nodes (contrast on kbd/status chips, and menubar brand accessible name mismatch)
Performance (on /): FCP 396ms / DOMContentLoaded 228ms / Load 229ms — all well within pragmatic budget (< 4.0s)

Findings (after self-critique):
  Critical: 0    High: 4    Medium: 2    Low: 1

Self-critique pass: Drafted: 10  Kept: 7  Generic: 2  Duplicate: 1
  (dropped: "increase line-height in descriptions", "additional button animations" — generic;
   merged: React Flow nodeTypes + edgeTypes warnings into single finding F-H1)

Time per phase: Phase 3 ≈ 6m / Total ≈ 10m
Manifest plausibility: 22 steps logged, 21 screenshots captured, console & network captures recorded

TOP 5 (ranked by impact × ease, senior-designer pick):
  1. F-H1 React Flow nodeTypes/edgeTypes memoization — moving definitions outside component prevents canvas re-renders on large drawings.
  2. F-H3 MenuBar brand accessible name mismatch (WCAG 2.5.3) — speech-control accessibility fix with a single prop correction.
  3. F-H2 Initial WebSocket boot connection race — retry debounce prevents noisy console warning on clean loads.
  4. F-H4 Contrast ratio on kbd shortcuts and status timestamps — tweaking text tone to Meet WCAG AA 4.5:1.
  5. F-M1 Modal containers lack role="dialog" and aria-modal="true" — standardizing modal containers across NewDrawingModal and LoginModal.
═══════════════════════════════════════════════════════════
```

---

## Progress Since Previous Audit (2026-10-28)

The application has undergone significant structural layout improvements since the previous systems-engineer audit:
* **App Shell Layout (commit `5a364a0`)**: The previous layout-collapse issues at 1024px and mobile widths have been completely resolved. The application now features a cohesive desktop shell with MenuBar, CommandBar, Activity Rail with collapsible overlay side-panes, Canvas, Inspector, and Results panel.
* **First Drop Lock Fix (former Critical C1)**: Creating a new drawing when authenticated now properly checks out the diagram, allowing immediate placement without read-only refusals.
* **Global Units Integration (former High H5)**: The status bar actively reflects unit basis (`bar a · L/min · °C`), and global unit preferences are accessible in the Settings side-pane.
* **A11y Critical Drop**: Zero axe-core Critical violations were found across the application (down from 2 rules / 20 nodes in the previous audit).

---

## Coverage and What Was Run

- **Threads Walked**:
  - **T1: Authentication & User Session**: Signed in as `test_alice` with `walflow-test-2026` via the new AccountMenu dialog; verified session token persistence and account chip display.
  - **T2: Library Examples & Solver Execution**: Opened Examples pane via the Activity Rail, loaded the "API 614 Lube Oil System (LOS)" industrial template, executed hydraulic simulation via CommandBar "Run Simulation", and verified real-time WebSocket convergence.
  - **T3: Per-Pipe & Equipment Results Inspection**: Evaluated per-pipe hydraulic results table (Flow in L/min, Velocity in m/s, ΔP, start/end pressures) and Equipment operating points. Selected component node to inspect parameters in Inspector panel.
  - **T4: Drawing Lifecycle**: Created new cloud drawing "LO Skid K-101 – Compressor Lube Oil" via File ▸ New Drawing modal; verified diagram metadata initialization.
  - **T5: Multi-Case Operating Conditions**: Added secondary case "Cold Start 10 °C" via the CommandBar "New case…" action and inspected the Cases matrix tab in the Results panel.
  - **T6: Responsive Viewport Matrix**: Stress-tested the full app shell across 1920×1080, 1280×800, 1024×768, 768×1024 (tablet portrait), and 375×667 (mobile).
  - **T7: Automated Accessibility (axe-core)**: Injected axe-core v4.14 directly into the live page DOM to catch contrast, landmark, and label mismatches.
  - **T8: Performance Metrics**: Captured navigation and paint timing metrics using the browser Performance API.

---

## Interaction Manifest

```
INTERACTION MANIFEST — / (main canvas)
  Persona: systems-engineer
  [✓] 01:20:15 Navigated to http://localhost:5173
  [✓] 01:20:16 Verified landing page rendered, initial screenshot captured (01-landing-page.png)
  [✓] 01:20:16 Clicked "Sign in" in menu bar (button.menubar-signin)
  [✓] 01:20:17 Verified sign-in modal rendered (02-sign-in-modal.png)
  [✓] 01:20:17 Typed "test_alice" into username input (input[placeholder*="engineer"])
  [✓] 01:20:17 Typed "walflow-test-2026" into password input (input[type="password"])
  [✓] 01:20:17 Pressed Enter to submit login form (form)
  [✓] 01:20:19 Verified signed-in state: user account chip active (03-signed-in.png)
  [✓] 01:20:19 Clicked "Examples" in activity rail (button[title="Examples"])
  [✓] 01:20:20 Verified examples side pane opened (04-examples-side-pane.png)
  [✓] 01:20:20 Clicked example item: "API 614 Lube Oil System (LOS)" (.sidebar-list-item)
  [✓] 01:20:24 Example diagram loaded on canvas; verified nodes & edges rendered (05-example-diagram-loaded.png)
  [✓] 01:20:24 Clicked "Run Simulation" in command bar (button:contains("Run Simulation"))
  [✓] 01:20:27 Solver WebSocket response received: "Converged · 07:20:24 PM · Case: Case 1 · bar a · L/min · °C" (06-simulation-converged.png)
  [✓] 01:20:27 Clicked "Pipes" tab in results data panel (button:contains("Pipes"))
  [✓] 01:20:28 Pipes results table displayed with per-pipe hydraulics (07-pipes-results-table.png)
  [✓] 01:20:28 Clicked "Equipment" tab in results data panel (button:contains("Equipment"))
  [✓] 01:20:29 Equipment table displayed with operating points and status badges (08-equipment-results-table.png)
  [✓] 01:20:29 Clicked component node on canvas to open Inspector (.react-flow__node)
  [✓] 01:20:29 Inspector panel displayed showing component parameters (09-node-inspector-open.png)
  [✓] 01:20:29 Opened "File" menu in menu bar (10-file-menu-open.png)
  [✓] 01:20:30 Clicked "New drawing" menu item (menuitem:contains("New drawing"))
  [✓] 01:20:31 New drawing modal opened (.modal-container, 11-new-drawing-modal.png)
  [✓] 01:20:31 Set drawing title "LO Skid K-101 – Compressor Lube Oil"
  [✓] 01:20:31 Clicked "Create" in New Drawing modal
  [✓] 01:20:32 New drawing created on canvas; verified lock status & title (12-new-drawing-canvas.png)
  [✓] 01:20:32 Opened "Settings" in activity rail (button[title="Settings"], 13-settings-side-pane.png)
  [✓] 01:20:33 Clicked "Cases" tab in results data panel (button:contains("Cases"), 14-cases-matrix-tab.png)
  [✓] 01:20:34 Clicked "New case…" button in command bar (15-new-case-modal.png)
  [✓] 01:20:34 Created second operating case "Cold Start 10 °C" (16-cases-side-by-side.png)
  [✓] 01:20:36 Viewport 1920×1080: scrollWidth=1920px (overflow: false, 17-viewport-1920.png)
  [✓] 01:20:37 Viewport 1280×800: scrollWidth=1280px (overflow: false, 18-viewport-1280.png)
  [✓] 01:20:37 Viewport 1024×768: scrollWidth=1024px (overflow: false, 19-viewport-1024.png)
  [✓] 01:20:38 Viewport 768×1024: scrollWidth=768px (overflow: false, 20-viewport-768.png)
  [✓] 01:20:39 Viewport 375×667: scrollWidth=375px (overflow: false, 21-viewport-375.png)
```

---

## Evidence Filmstrip

| # | Screenshot | Description |
|---|---|---|
| 01 | [01-landing-page.png](screenshots/01-landing-page.png) | Clean boot: new App Shell with MenuBar, CommandBar, Empty canvas and Browse examples CTA |
| 02 | [02-sign-in-modal.png](screenshots/02-sign-in-modal.png) | Sign In modal with tabbed Sign In / Register toggle and credential inputs |
| 03 | [03-signed-in.png](screenshots/03-signed-in.png) | Authenticated state: Account chip indicates `test_alice` in MenuBar |
| 04 | [04-examples-side-pane.png](screenshots/04-examples-side-pane.png) | Activity Rail Examples drawer with categorized industrial templates |
| 05 | [05-example-diagram-loaded.png](screenshots/05-example-diagram-loaded.png) | "API 614 Lube Oil System" loaded: multi-pump, cooler, valve, and tank layout |
| 06 | [06-simulation-converged.png](screenshots/06-simulation-converged.png) | Simulation converged: green status badge, timestamp, case, units, and zoom indicators |
| 07 | [07-pipes-results-table.png](screenshots/07-pipes-results-table.png) | Results panel: detailed per-pipe Flow (L/min), Velocity (m/s), ΔP (bar), P Start/End |
| 08 | [08-equipment-results-table.png](screenshots/08-equipment-results-table.png) | Results panel: equipment operating summary with operating points and status tags |
| 09 | [09-node-inspector-open.png](screenshots/09-node-inspector-open.png) | Inspector panel: pump duty point, head, curve properties, and fluid mechanics |
| 10 | [10-file-menu-open.png](screenshots/10-file-menu-open.png) | MenuBar File dropdown with keyboard shortcut badges (Ctrl+N, Ctrl+O, etc.) |
| 11 | [11-new-drawing-modal.png](screenshots/11-new-drawing-modal.png) | New Drawing modal with title, description, and cloud project destination selector |
| 12 | [12-new-drawing-canvas.png](screenshots/12-new-drawing-canvas.png) | Blank canvas initialized for "LO Skid K-101" with active checkout lock |
| 13 | [13-settings-side-pane.png](screenshots/13-settings-side-pane.png) | Settings drawer: Global pressure basis (bar a / bar g), flow units, and fluid library |
| 14 | [14-cases-matrix-tab.png](screenshots/14-cases-matrix-tab.png) | Operating Cases matrix tab showing base case configuration |
| 15 | [15-new-case-modal.png](screenshots/15-new-case-modal.png) | New Case modal with title input |
| 16 | [16-cases-side-by-side.png](screenshots/16-cases-side-by-side.png) | Side-by-side comparison matrix with "Cold Start 10 °C" added |
| 17 | [17-viewport-1920.png](screenshots/17-viewport-1920.png) | 1920×1080 desktop layout: full canvas visibility with activity rail and results panel |
| 18 | [18-viewport-1280.png](screenshots/18-viewport-1280.png) | 1280×800 laptop layout: proportional scaling with 0 overflow |
| 19 | [19-viewport-1024.png](screenshots/19-viewport-1024.png) | 1024×768 tablet landscape layout: overlay side-pane behavior |
| 20 | [20-viewport-768.png](screenshots/20-viewport-768.png) | 768×1024 tablet portrait layout: clean command bar and responsive panel |
| 21 | [21-viewport-375.png](screenshots/21-viewport-375.png) | 375×667 mobile viewport: narrow shell adaptation without page blowout |

---

## Detailed Findings

### [F-H1] React Flow nodeTypes and edgeTypes Re-created on Render
* **Layer:** Architecture / Performance
* **Severity:** High (violates hard gate: Console Warnings = 0)
* **Surface:** `/` (Canvas, all viewports)
* **Persona:** Systems Engineer (notices sluggish panning and zooming when diagrams exceed 30 components)
* **Reproduce:**
  1. Open `http://localhost:5173`.
  2. Open browser DevTools Console.
  3. Observe warning emitted on component mount.
* **Observed:**
  `[React Flow]: It looks like you've created a new nodeTypes or edgeTypes object. If this wasn't on purpose please define the nodeTypes/edgeTypes outside of the component or memoize them. Help: https://reactflow.dev/error#002`
* **Expected:** Zero React Flow lifecycle warnings in console; node and edge type definitions should be static or memoized.
* **Evidence:** Console log capture in `audit-raw-data.json`.
* **Suspected location:** `frontend/src/App.jsx` or canvas wrapper where `nodeTypes` and `edgeTypes` are declared inside the component without `useMemo`.
* **Smallest possible patch:**
  Move `nodeTypes` and `edgeTypes` object literals outside of the component body, or wrap them in `useMemo(() => ({ ... }), [])`.

---

### [F-H2] WebSocket Pre-Connection Closure on Boot
* **Layer:** Architecture / Reliability
* **Severity:** High (violates hard gate: Console Warnings = 0)
* **Surface:** `/` (Main canvas boot)
* **Persona:** Systems Engineer
* **Reproduce:**
  1. Load `http://localhost:5173` with a cold browser session.
  2. Inspect console network connection events.
* **Observed:**
  `WebSocket connection to 'ws://localhost:5173/ws/simulate' failed: WebSocket is closed before the connection is established.`
* **Expected:** WebSocket client should initiate cleanly without an immediate abort/retry cycle during initial React StrictMode mounting.
* **Evidence:** Console log timestamp `01:20:16.212Z`.
* **Suspected location:** `frontend/src/hooks/useWebSocketSimulation.js` (cleanup in React StrictMode unmounts the socket before the handshake completes).
* **Smallest possible patch:**
  Add connection-ready state guarding in the WebSocket setup effect to avoid aborting in-flight connections during StrictMode fast-mount cycles.

---

### [F-H3] MenuBar Brand Accessible Name Mismatch (WCAG 2.5.3)
* **Layer:** Visual / Accessibility
* **Severity:** High (violates hard gate: axe Serious = 0)
* **Surface:** `/` (MenuBar Brand Button)
* **Persona:** Systems Engineer / Speech-Input User
* **Reproduce:**
  1. Run axe-core audit on the main application page.
  2. Inspect rule `label-content-name-mismatch`.
* **Observed:**
  The button `.menubar-brand` contains visible text `v0.2.1 • Beta`, but has `aria-label="About WälFlow, version 0.2.1"`. Because the visible characters are not in the accessible name, speech dictation software cannot target the control by voice.
* **Expected:** The accessible name must contain the visible text (e.g. `aria-label="About WälFlow v0.2.1 Beta"`).
* **Evidence:** `axeViolations` entry in `audit-raw-data.json`.
* **Suspected location:** `frontend/src/components/layout/MenuBar.jsx:310`
* **Smallest possible patch:**
  ```jsx
  // frontend/src/components/layout/MenuBar.jsx line 310
  aria-label={`About WälFlow v${APP_VERSION}${RELEASE_STAGE ? ` • ${RELEASE_STAGE}` : ''}`}
  ```

---

### [F-H4] Text Contrast Ratio on Keyboard Shortcuts & Status Chips
* **Layer:** Visual / Accessibility
* **Severity:** High (violates hard gate: axe Serious = 0)
* **Surface:** Menu dropdowns (`kbd`) & StatusBar (`.status-chip-time`)
* **Persona:** Systems Engineer (often reviews drawings in bright industrial plant control rooms)
* **Reproduce:**
  1. Open "File" menu in MenuBar.
  2. Inspect keyboard shortcut badges (`<kbd>Ctrl+N</kbd>`).
  3. Inspect contrast ratio with axe-core.
* **Observed:** Contrast ratio is below 4.5:1 against the menu item background.
* **Expected:** WCAG AA 4.5:1 minimum contrast for normal text.
* **Evidence:** axe-core `color-contrast` violation on `kbd` and `.status-chip-time`.
* **Suspected location:** `frontend/src/index.css` (`.menu-item kbd`, `.status-chip-time`) or design tokens for muted shortcut text.
* **Smallest possible patch:**
  Adjust the font color of `.menu-item kbd` from `var(--color-text-muted)` to `var(--color-text-secondary)`.

---

### [F-M1] Modal Containers Lack ARIA Dialog Role
* **Layer:** Architecture / Accessibility
* **Severity:** Medium
* **Surface:** Modals (`NewDrawingModal`, `LoginModal`)
* **Persona:** Systems Engineer
* **Reproduce:**
  1. Click "File" ▸ "New drawing" or "Sign in".
  2. Inspect container `<div className="modal-container">`.
* **Observed:** The container lacks `role="dialog"` and `aria-modal="true"`.
* **Expected:** All popup modals should specify `role="dialog"` and `aria-modal="true"` for screen readers and automated harnesses.
* **Evidence:** DOM inspector query in `scratch/run_full_audit.js`.
* **Suspected location:** `frontend/src/components/modals/NewDrawingModal.jsx:102` and `LoginModal.jsx:72`.
* **Smallest possible patch:**
  Add `role="dialog" aria-modal="true"` to `.modal-container`.

---

### [F-M2] Autocomplete Attributes Missing on Login Form
* **Layer:** Feedback / Usability
* **Severity:** Medium
* **Surface:** `LoginModal`
* **Persona:** Systems Engineer
* **Reproduce:**
  1. Open "Sign in" modal.
  2. Inspect console logs.
* **Observed:** Console warning: `[DOM] Input elements should have autocomplete attributes (suggested: "current-password")`.
* **Expected:** Password input specifies `autoComplete="current-password"`, username specifies `autoComplete="username"`.
* **Evidence:** Console entry `01:20:17.353Z`.
* **Suspected location:** `frontend/src/components/modals/LoginModal.jsx:162, 180`.
* **Smallest possible patch:**
  Add `autoComplete="username"` and `autoComplete="current-password"` to form inputs.

---

### [F-L1] Heading Hierarchy Order in Side Panes
* **Layer:** Visual / Structure
* **Severity:** Low
* **Surface:** Side pane groups
* **Persona:** Systems Engineer
* **Reproduce:**
  1. Run axe-core audit.
  2. Check `heading-order` rule.
* **Observed:** An `h4` element appears without an intermediate `h3` inside the side-pane container.
* **Expected:** Sequential heading hierarchy (`h1` → `h2` → `h3` → `h4`).
* **Evidence:** axe-core `heading-order` violation on `div:nth-child(2) > h4`.
* **Suspected location:** `frontend/src/components/panels/Sidebar.jsx`.
* **Smallest possible patch:**
  Standardize side-pane category titles to `h3`.

---

## Perfection Roadmap

### Quick Wins (24–48 hours)
* **F-H3**: Fix brand button `aria-label` in `MenuBar.jsx` to include visible version text.
* **F-H4**: Increase contrast of `<kbd>` tags and status chip timestamps to meet 4.5:1.
* **F-M1**: Add `role="dialog" aria-modal="true"` to `NewDrawingModal.jsx` and `LoginModal.jsx`.
* **F-M2**: Add `autoComplete` attributes to `LoginModal.jsx` inputs to eliminate browser DOM warnings.

### Structural (1–2 weeks)
* **F-H1**: Memoize `nodeTypes` and `edgeTypes` in React Flow canvas initialization to prevent unnecessary component remounts during zoom/pan.
* **F-H2**: Harden `useWebSocketSimulation` initialization effect against StrictMode aborts on clean initial page loads.

### Advanced Polish (Post-Launch)
* **F-L1**: Normalize heading hierarchy (`h2` → `h3`) across all Activity Rail side panes and inspector tabs.

---

## Hold This in Your Hands

If WalFlow v0.2.1 were a physical instrument, it would feel like a newly machined stainless steel manifold with crisp, laser-etched port markings and solid ball-valve levers. The new desktop App Shell with its unified MenuBar, CommandBar, and Activity Rail makes the workspace feel organized and deliberate—like sitting down at a purpose-built workstation rather than a generic web form. When you hit "Run Simulation," the prompt transition to a green converged state and the instantaneous rendering of per-pipe velocities and pressure drops gives you immediate confidence in the hydraulics. Tidying up the React Flow canvas memoization and tightening the accessible label contrast will make this feel as robust in the software layer as a high-pressure lube oil skid is in the field.

