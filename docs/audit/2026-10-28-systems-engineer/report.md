# UX Audit — WalFlow v0.2.0 (local dev) — 2026-10-28

**Persona (locked):** `systems-engineer` — Lube & Seal Oil Systems Engineer ([docs/personas/systems-engineer.md](../../personas/systems-engineer.md)). SI units (bar g, m³/h, °C), 1920×1080 desktop, builds 20–40 component skids, design review Friday.
**Target:** http://localhost:5173 (Vite dev, StrictMode) + backend :8000, signed in as `admin`, Chrome via Claude in Chrome.
**Audit config:** none found → every console error/warning counts.

```
═══════════════════════════════════════════════════════════
VERDICT: FAIL

Persona: systems-engineer
Surfaces audited: 1 / 1 routes (single-page app; 5 sidebar tabs, 5 data-panel tabs, inspector, 4 modals)
Interaction Manifest: complete for the main route (typed ✓, primary action ✓, modal ✓, console after action ✓, before/after screenshots ✓, post-state verified ✓)

Hard Gates: console errors [1 distinct, every load], warnings [2 distinct: 2 per load + 6 Recharts], network 5xx [0], 403/404 [0],
            layout-collapse [2 widths: 1024, ≤500], axe Critical [2 rules / 20 nodes], axe Serious [2 rules / 12 nodes]
            (no allowlist; 6 extra WebSocket errors at 14:29 came from the audit's own iframes and are excluded)
Performance (on /): LCP 1.02s / CLS 0.006 / INP 464ms (worst event) — thresholds 4.0s / 0.25 / 500ms → green, INP near limit

Findings (after self-critique):
  Critical: 2    High: 6    Medium: 6    Low: 6

Self-critique pass (sub-agent): Drafted: 24  Kept: 20  Generic: 2  Duplicate: 2
  (dropped: 12-hour clock, "hover states/radius" — generic; merged: reload lock loss → C1, React Flow warning → C2)

Time per phase: Phase 3 ≈ 11m (19:20:42 → 19:31:29 UTC) / Total ≈ 14m
Manifest plausibility: 48 entries, median gap ≈ 9s, 51 screenshots, 30+ console reads

TOP 5 (impact × ease):
  1. C1 New drawing is read-only — one effect in useAutoSaveSession unblocks every new user on their first drag.
  2. H1 "math domain error" — the persona's #1 close-the-tab trigger; a reworded solver message plus clearing stale readouts is small.
  3. H6 Stale inspector after loading a drawing — two setState calls; prevents an engineer reading the wrong pipe size into a design review.
  4. M4 CSV export — BOM + quoting + case name is ~5 lines and turns the export into something pasteable into the report.
  5. H5 Units — m³/h and bar g are how this persona reads every number; a flow-unit and gauge toggle removes constant mental conversion.
═══════════════════════════════════════════════════════════
```

## Coverage and what was NOT run

- **Threads walked:** T1 build a skid from a blank cloud drawing (6 components, 5 pipes, VG 46 oil); T2 run and read duty point / per-pipe P-Q-v; T3 two operating cases (cold start 10 °C vs base) side by side; T4 keyboard copy/paste/delete/undo/redo; T5 results export (code-inspected, file not downloaded); T6 reload mid-work.
- **Scenarios run:** 1 First contact, 2 Interrupted workflow (reload), 3 Wrong turn (non-converging model → recovery), 4 Returning user (reload + re-checkout), 5 Keyboard only (Tab order, focus ring, Escape), 6 Heavy data (54 nodes / 57 pipes, 1.8 s solve), 7 Destructive confidence (load-diagram confirm; drawing delete **not** exercised), 10 Round-trip (case create → matrix → inspector override → solve all).
- **Not run:** 8 Second user / role (needs a second account — you offered to approve one), 9 Lifecycle position, 11 Data seasoning, slow-network / offline / i18n / print / forced-colors recipes. Export CSV was not downloaded (asks permission per download); findings come from [DataList.jsx:491-503](../../../frontend/src/components/panels/DataList.jsx#L491-L503).
- **Element coverage (main route):** ≈ 41 of ≈ 60 distinct controls exercised (top bar 7/9, sidebar tabs 4/4, palette search + 6 cards, canvas toolbar 4/7, data-panel tabs 4/5, inspector tabs 2/2, modals 4).

## Interaction Manifest (excerpt, UTC)

```
INTERACTION MANIFEST — / (main canvas)
  Persona: systems-engineer
  [✓] 19:20:42 Clicked Run Simulation on starter (button[aria-label="Run hydraulic simulation…"]) → pill "Converged · 02:20:46 PM", console clean
  [✓] 19:21:10 File ▸ New drawing → modal opened (dialog)
  [✓] 19:21:42 Typed title "LO Skid K-101 – Compressor's lube oil (VG 46 @ 50 °C)" + description with "—" and "Müller"; Create → POST /api/diagrams 201, toast, special chars preserved
  [✗] 19:21:52 Dragged Tank + Pump onto canvas → 0 nodes, toast "This drawing is read-only…" (C1)
  [✓] 19:22:10 Workspace tab → "Available (read-only)" + "Check out to edit"
  [✓] 19:22:23 Check out → POST …/checkout 200; drag Tank + Pump → 2 nodes
  [✓] 19:22:35 Connected tank → pump suction (1 edge); port titles "Suction"/"Discharge"
  [✓] 19:22:44 Typed "filter" in equipment search → 1 result; dragged → 3 nodes
  [✓] 19:22:54 Typed "cooler" → Cooler; typed "PCV" → "No components match" (M5)
  [✓] 19:23:06 Typed "pressure" → Pressure Boundary, Safety Relief Valve, Pressure Regulator
  [✓] 19:23:27 Wired pump→filter→cooler→regulator→boundary → 5 edges, badge cleared
  [✓] 19:23:48 Settings: fluid → ISO VG 46 Oil, ambient → 35 °C; Global: units Metric only (H5)
  [✓] 19:24:05 Run → "Failed", banner "math domain error", readouts −194.9 L/min (H1)
  [✓] 19:24:13 Clicked banner "Show" → no selection, no inspector (H1)
  [✓] 19:24:46 Clicked pump → inspector Setup (rated flow L/min, head m, no curve table — M1)
  [✓] 19:25:29 Boundary 6 → 2 bar(a), Run → "Converged, 1 warning", banner names Pressure Regulator 1
  [✓] 19:25:42 Expanded data panel → per-pipe Flow/Velocity/ΔP/P/T table read
  [✓] 19:25:59 Regulator ▸ Results → SATURATED badge, envelope chart
  [✓] 19:26:13 Ctrl+C / Ctrl+V on Filter 1 → 7 nodes ("Filter 1_copy"), pill "Results out of date"
  [✓] 19:26:14 Ctrl+Z → 6 nodes
  [✓] 19:26:26 Delete Cooler → 5 nodes / 3 edges; Ctrl+Z → 6/5; Ctrl+Y → 5/3; Ctrl+Z → 6/5
  [✓] 19:26:38 Canvas "Case manager" popover → no add-case control (M6)
  [✓] 19:27:05 Operating Cases Matrix ▸ New case → typed "Cold start 10 °C" ▸ Enter → case active, matrix 2 columns
  [✓] 19:27:30 Tank temp override 10 °C ("Overridden · Reset"); Solve all cases → POST /api/simulation/batch 200, Δ +0.03 bar shown
  [✓] 19:27:39 Measurements tab → instructive empty state
  [✓] 19:28:03 Reload → 6 nodes, 2 cases, override kept; toast "Restored unsaved drawing" (L3); lock lost (C1)
  [✓] 19:28:31 axe-core 4.10.2 on main route → 8 rules (2 critical, 2 serious)
  [✓] 19:28:47 Performance capture after reload + 2 interactions
  [✓] 19:29:40 Width matrix via iframes 1440/1280/1024/768/375; 19:29:47–57 confirmed with real window 1280 / 1024 / 500
  [✓] 19:30:09 Tab ×14 → all stops show focus ring, logical order
  [✓] 19:30:30 Help → dialog, focus inside; Escape → closed
  [✓] 19:31:14 Library ▸ Large Reference Network ▸ confirm Load → 54 nodes / 57 edges; Run → Converged in 1785 ms
  [✓] 19:31:29 Inspector still shows old drawing's Pipe 102 (H6)
  [✓] Console read after every primary action; network inventoried (0 × 5xx, 0 × 4xx)
```

Screenshots: [screenshots/](screenshots/): 17 frames cited by the findings, out of 51 taken during the audit.

| # | Screenshot | Shows |
|---|---|---|
| 01 | [first-load-starter-circuit](screenshots/01-first-load-starter-circuit.jpg) | First run: welcome note, starter half under the data bar (L4) |
| 02 | [new-drawing-created](screenshots/02-new-drawing-created.jpg) | "New cloud drawing created" next to "Saved in this browser" (C1, L3) |
| 03 | [drop-refused-read-only](screenshots/03-C1-drop-refused-read-only.jpg) | First drop refused: read-only toast (C1) |
| 04 | [checkout-hidden-in-workspace](screenshots/04-C1-checkout-hidden-in-workspace.jpg) | Only Check-out control, in Workspace tab (C1) |
| 05 | [math-domain-error](screenshots/05-H1-math-domain-error.jpg) | Failed run, raw error, stale −194.9 L/min (H1) |
| 06 | [converged-warning-names-regulator](screenshots/06-converged-warning-names-regulator.jpg) | Good: warning names the component and cause |
| 07 | [pipe-results-table](screenshots/07-pipe-results-table.jpg) | Per-pipe P/Q/v/T table; L/min and bar(a) units (H5) |
| 08 | [regulator-results-saturated](screenshots/08-regulator-results-saturated.jpg) | Good: SATURATED badge and envelope chart |
| 09 | [paste-overlaps-original](screenshots/09-L1-paste-overlaps-original.jpg) | "Filter 1_copy" pasted over the original label (L1) |
| 10 | [never-run-case-shows-normal](screenshots/10-M2-never-run-case-shows-normal.jpg) | Never-run case shows "✓ Normal"; stale pill (M2) |
| 11 | [solve-all-cases-delta](screenshots/11-solve-all-cases-delta.jpg) | Good: side-by-side cases with Δ vs base; few KPIs (M3) |
| 12 | [restored-unsaved-toast](screenshots/12-L3-restored-unsaved-toast.jpg) | "Restored unsaved drawing" after a saved reload (L3) |
| 13 | [layout-1280](screenshots/13-H4-layout-1280.jpg) | Top-bar actions cut off, tabs wrap (H4) |
| 14 | [layout-1024](screenshots/14-H4-layout-1024.jpg) | Canvas 368×236 with panes open (H4) |
| 15 | [layout-500](screenshots/15-H4-layout-500.jpg) | Canvas width 0 (H4) |
| 16 | [load-diagram-confirm](screenshots/16-load-diagram-confirm.jpg) | Good copy; no role="dialog" (L6) |
| 17 | [stale-inspector-after-load](screenshots/17-H6-stale-inspector-after-load.jpg) | Old Pipe 102 (DN50, 25 m) shown after load (H6) |

---

## Findings

### C1 — New cloud drawing opens read-only; lock silently lost on every reload
- **Layer:** Architecture · **Severity:** Critical · **Surface:** / @1920×1080, any panes · **Persona:** systems-engineer
- **Reproduce:** 1. File ▸ New drawing ▸ title ▸ Create Drawing. 2. Drag a Tank from the Library onto the canvas. 3. (Later) Workspace ▸ Check out, reload the page, drag again.
- **Observed:** Step 2 drops nothing; toast "This drawing is read-only. Please check out the drawing to edit." with no button. The only Check-out control is in Sidebar ▸ Workspace. Top bar says "Saved in this browser", never "read-only". After a reload the drawing is "Available (read-only)" again.
- **Expected:** The creator of a new drawing can draw immediately; after reload, an uncontested lock is re-acquired; read-only state is visible in the top bar with a one-click Check out.
- **Evidence:** [created](screenshots/02-new-drawing-created.jpg), [drop refused](screenshots/03-C1-drop-refused-read-only.jpg), [checkout in Workspace](screenshots/04-C1-checkout-hidden-in-workspace.jpg); network POST /api/diagrams 201, no /checkout until manual click; zoom after reload "Available (read-only)".
- **Suspected location:** [App.jsx:1307-1330](../../../frontend/src/App.jsx#L1307-L1330) (create, no checkout); [useAutoSaveSession.js:250-276](../../../frontend/src/hooks/useAutoSaveSession.js#L250-L276) (lock-status effect never acquires); [main.py:278](../../../backend/main.py#L278) releases on disconnect.
- **Smallest patch:** in `useAutoSaveSession.js` lock-status `.then`, replace `else { setLockInfo(null); }` with `else { setLockInfo(null); if (isAuthenticated) checkoutDiagram(); }` (add `isAuthenticated, checkoutDiagram` to deps). Plus, in the read-only toast (App.jsx:395 and the 6 copies), pass an action `{ label: 'Check out', onClick: checkoutDiagram }`.

### C2 — Console error "WebSocket Error: Event" on every page load
- **Layer:** Feedback · **Severity:** Critical (hard gate) · **Surface:** / any width
- **Reproduce:** 1. Load http://localhost:5173. 2. Read console.
- **Observed:** `[ERROR] useWebSocketSimulation.js:74 WebSocket Error: Event` once per load; the socket then connects (runs work).
- **Expected:** No console error when the connection succeeds.
- **Evidence:** console reads 19:20:19, 19:27:59, 19:28:43.
- **Suspected location:** [useWebSocketSimulation.js:74-78](../../../frontend/src/hooks/useWebSocketSimulation.js#L74-L78) — StrictMode's first mount is cleaned up while the socket is CONNECTING, which fires `error`.
- **Smallest patch:** `socket.onerror = (error) => { if (isCleanClose) return; console.error('WebSocket Error:', error); … }` (cleanup already sets `isCleanClose`).
- **Same root cause (merged):** `[React Flow]: It looks like you've created a new nodeTypes or edgeTypes object` ×2 per load, although both are module-level ([App.jsx:116](../../../frontend/src/App.jsx#L116)). StrictMode dev double-mount; confirm absent on `npm run build && npm run preview`, then allowlist it for dev in an audit-config.

### H1 — Solver failure shows raw "math domain error", names no component; "Show" does nothing; stale numbers stay on canvas
- **Layer:** Feedback · **Severity:** High · **Surface:** / 1920×1080 · **Persona pain trigger #1**
- **Reproduce:** 1. Tank → Centrifugal pump (defaults) → Filter → Cooler → Pressure Regulator (5 bar(a)) → Pressure Boundary (6 bar(a)). 2. Fluid ISO VG 46. 3. Run Simulation. 4. Click "Show" in the banner.
- **Observed:** Pill "Failed"; banner "math domain error"; "Show" selects nothing (no `.selected` node, no inspector); canvas shows pump ΔP 8.38 bar and −194.9 L/min, filter ΔP 0.93 bar, regulator Pos 0.1 %.
- **Expected:** A message naming the component and cause ("Pressure Boundary 1 (6.0 bar(a)) is above what Centrifugal Pump 1 can deliver…" or at minimum "no physical solution — check boundary pressures vs pump head"); "Show" selects that component; readouts blanked when the run failed.
- **Evidence:** [failed run](screenshots/05-H1-math-domain-error.jpg); JS: selected nodes `[]` after Show.
- **Suspected location:** [solver.py:791-793](../../../backend/simulation/solver.py#L791-L793) (`state["error"] = str(e)`); [RunBanners.jsx:62-65](../../../frontend/src/components/overlays/RunBanners.jsx#L62-L65) (Show target).
- **Smallest patch:** solver.py:793 → `state["error"] = f"No physical solution found ({e}). Usually a boundary pressure is higher than the pumps can deliver, or a regulator cannot reach its set point."`; and in RunBanners only render Show when `onSelect` can resolve `it.target` to an existing node id. (Physics-side change → physics-reviewer.)

### H2 — Console warning: Recharts width(-1)/height(-1) ×6 on inspector Results charts
- **Layer:** Feedback · **Severity:** High (hard gate)
- **Reproduce:** select Pressure Regulator or Filter ▸ Results tab.
- **Observed:** `The width(-1) and height(-1) of chart should be greater than 0` ×6 at 14:25:57 and 14:26:11.
- **Suspected location:** [ValveDetails.jsx:119](../../../frontend/src/components/details/ValveDetails.jsx#L119), [FilterDetails.jsx:71](../../../frontend/src/components/details/FilterDetails.jsx#L71), [PumpDetails.jsx:159](../../../frontend/src/components/details/PumpDetails.jsx#L159), [JunctionDetails.jsx:150](../../../frontend/src/components/details/JunctionDetails.jsx#L150).
- **Smallest patch:** `<ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>` in the four files.

### H3 — axe-core Critical/Serious on the Pipe Network List and canvas
- **Layer:** Interaction · **Severity:** High (hard gate: 2 critical + 2 serious rules)
- **Observed:** `label` (critical, 10: Name and Length inputs e.g. `input[value="Pipe 100"]`), `select-name` (critical, 10: NPS / Schedule selects), `label-title-only` (serious, 5: Pipe Class selects), `nested-interactive` (serious, 7: `div[role="button"]` palette/node cards with inner buttons). Also moderate: landmark-one-main, page-has-heading-one, region (64).
- **Suspected location:** [DataList.jsx:923, 1209, 1238, 1266](../../../frontend/src/components/panels/DataList.jsx#L1209) and the row name/length `<input>`s.
- **Smallest patch:** add `aria-label={`${i.label} name`}`, `aria-label={`${i.label} length`}`, `aria-label={`${i.label} nominal size`}`, `aria-label={`${i.label} schedule`}`, `aria-label={`${i.label} pipe class`}` to the respective controls.

### H4 — Layout collapse below 1280 px with inspector + data panel open
- **Layer:** Visual · **Severity:** High (hard gate)
- **Reproduce:** select any component (inspector open), data panel expanded; resize window to 1280, 1024, 500.
- **Observed:** 1280 (viewport 1264×715): Help, Admin Hub, Sign out off-screen right; data-panel tabs wrap to 3–4 lines. 1024: canvas 368×236 px; status pill, Catalogue, Help, Sign out off-screen. 500: canvas width 0, page scrolls horizontally.
- **Expected:** Top-bar actions stay reachable (overflow menu); canvas keeps a usable minimum (inspector overlays or collapses automatically).
- **Evidence:** [1280](screenshots/13-H4-layout-1280.jpg), [1024](screenshots/14-H4-layout-1024.jpg), [500](screenshots/15-H4-layout-500.jpg); layout JS `canvasW` 624 / 368 / 0.
- **Suspected location:** `frontend/src/components/layout/Navbar.jsx` (right action group), inspector panel width in App.jsx layout.
- **Smallest patch:** on the Navbar drawing-title block add `minWidth: 0, flex: '1 1 auto', overflow: 'hidden'` and on the right action group `flexShrink: 0`; auto-collapse the inspector (`setInspectorCollapsed(true)`) when `window.innerWidth < 1200`.

### H5 — No m³/h or bar g: flow fixed to L/min, pressures mixed bar(a)/bar g
- **Layer:** Architecture · **Severity:** High (persona) · **Surface:** every readout
- **Observed:** Settings ▸ Global offers only Metric/Imperial; Metric = "bar, L/min, °C, m/mm". Regulator and boundaries are bar(a), PSV fields are bar g ([UnitContext.jsx:157-182](../../../frontend/src/context/UnitContext.jsx#L157-L182)). Persona must convert every flow (÷16.67) and every pressure (−1.013).
- **Expected:** Flow unit choice (L/min, m³/h) and a pressure basis choice (bar g / bar a) shown next to every number.
- **Smallest patch:** add `flowUnit` ('L/min' | 'm³/h') to Global settings and apply it in `formatFlow*` / `toDisplayValue` flow cases (`/ 16.6667`); label `L/min` → `labels.flow`.

### H6 — Inspector keeps the previous drawing's selection after loading another drawing
- **Layer:** Interaction · **Severity:** High (wrong engineering data on screen)
- **Reproduce:** 1. Select Pipe 102 in your drawing. 2. Library & Examples ▸ Large Reference Network ▸ Load.
- **Observed:** Inspector still shows "Pipe 102 · 2" (DN50) · 25 m"; the loaded drawing's Pipe 102 is 3" (DN80), 0.5 m; no element selected on canvas.
- **Expected:** Inspector closes (or shows the new element) on load.
- **Evidence:** [stale inspector](screenshots/17-H6-stale-inspector-after-load.jpg); JS at 19:31:29.
- **Suspected location:** [App.jsx:791-799](../../../frontend/src/App.jsx#L791-L799).
- **Smallest patch:** after `resetRunState();` add `setSelectedNode(null); setSelectedEdge(null);`.

### M1 — No multi-point pump curve entry
- **Layer:** Architecture · **Severity:** Medium · Persona pain trigger.
- **Observed:** Centrifugal pump inspector has Rated Flow, Rated Head, Rise to Shut-off %, Efficiency, NPSHr only. A 6-point datasheet curve cannot be entered or pasted.
- **Smallest patch:** structural — add a "Curve points" table (Q, H) with a "Paste from clipboard" button that parses tab-separated rows; feed the backend a fitted quadratic. (Backend + equipment .md; roadmap item.)

### M2 — Never-run case shows "Cavitation ✓ Normal"; status pill not tied to the active case
- **Layer:** Feedback · **Severity:** Medium
- **Observed:** New case "Cold start 10 °C" shows Cavitation Risk Status ✓ Normal while all other rows are "—"; top-bar pill keeps "Converged, 1 warning · 02:25:26 PM" after switching to that case and after Solve all cases.
- **Suspected location:** Operating Cases Matrix renderer in [DataList.jsx](../../../frontend/src/components/panels/DataList.jsx) (cavitation cell default); status derivation [App.jsx:386](../../../frontend/src/App.jsx#L386).
- **Smallest patch:** render "—" for the cavitation cell when that case has no telemetry; derive the pill from the active case's stored result (`cases[active].telemetry`), not the last WS run.

### M3 — Case matrix cannot compare per-point values (bearing header pressure, PCV opening)
- **Layer:** Architecture · **Severity:** Medium
- **Observed:** Only 5 system KPIs. The persona's cold-start vs normal question (header pressure at each bearing, PCV/TCV opening) needs switching cases and reading the canvas.
- **Smallest patch:** add one matrix row per instrument in the Measurements tab (they already exist as a concept): `measurements.map(m => row(m.label, caseTelemetry[m.id]))`.

### M4 — CSV export: unquoted, no BOM, no case identity
- **Layer:** Feedback · **Severity:** Medium · Persona win "paste straight into report".
- **Suspected location:** [DataList.jsx:491-503](../../../frontend/src/components/panels/DataList.jsx#L491-L503)
- **Smallest patch:** `const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;` and join with `row.map(q).join(',')`; Blob content `'\uFEFF' + …`; filename `` `${title}_${activeCaseName}_${activeTab}.csv` `` (sanitized).

### M5 — Equipment search ignores tag abbreviations (PCV, TCV, PSV, PRV, FCV)
- **Layer:** Interaction · **Severity:** Medium
- **Suspected location:** [Sidebar.jsx:1093-1095](../../../frontend/src/components/panels/Sidebar.jsx#L1093-L1095)
- **Smallest patch:** add `keywords: ['pcv','prv','bpr']` etc. to palette items and `|| item.keywords?.some(k => k.includes(query))`.

### M6 — Case wayfinding: "Case manager" can't add cases; collapsed tab click doesn't expand
- **Layer:** Architecture · **Severity:** Medium
- **Observed:** Canvas toolbar "Case manager" popover = case dropdown + relief view only; adding cases lives in Operating Cases Matrix (hint only in the Case select's tooltip). Clicking "Operating Cases Matrix" while the data panel is collapsed switches the tab but leaves it collapsed.
- **Smallest patch:** add a "+ New case" button to the popover calling `onAddCase`; in the data-panel tab click handler `if (panel.collapsed) expand()`.

### L1 — Paste overlaps original and is named "Filter 1_copy"
- **Smallest patch:** paste offset `+40, +40` px and name via the existing auto-tag util (`autoTag.js`) → "Filter 2".

### L2 — Drop point is the node's top-left corner
- **Smallest patch:** in onDrop subtract half the default node size from the projected position.

### L3 — "Restored unsaved drawing" after a reload that had saved everything
- **Observed:** all edits PUT 200 before reload; toast says unsaved; status "Saved in this browser" with a cloud icon.
- **Smallest patch:** compare draft `updated_at` with server `updated_at`; only show the toast when the draft is newer; status text "Saved to cloud HH:MM" for cloud drawings.

### L4 — First run doesn't lead this persona to the API 614 example
- **Observed:** welcome note fills the top half; starter circuit half under the data bar; "API 614 Lube Oil System (LOS)" sits in a collapsed Library & Examples list.
- **Smallest patch:** EmptyCanvasHint: add "Start from an example: API 614 Lube Oil System" link that calls the existing example loader.

### L5 — Port direction by colour only
- **Observed:** suction blue / discharge red; names only in native `title` tooltip after hover delay; filter ports both grey.
- **Smallest patch:** show a small "IN"/"OUT" label next to handles while a connection drag is active.

### L6 — "Load diagram?" confirm has no role="dialog"
- **Observed:** `document.querySelector('[role=dialog]')` is null while the confirm is open; the Help modal does have the role.
- **Smallest patch:** add `role="alertdialog" aria-modal="true" aria-labelledby` to the confirm container in `utils/dialogs` (the `confirmDialog` renderer).

---

## Observations for the physics reviewer (not UX findings)
- Pressure Regulator 1 reported "wide open (100 %)" yet carried 4.22 bar ΔP at 0.8 L/min (pipe 103 6.22 → pipe 104 2.00 bar(a)); pump at 5.13 bar / 0.9 L/min ≈ shut-off. Check regulator default Cv / wide-open ΔP.
- Flow shown 0.9 → 0.8 L/min across the cooler at 1 dp looks like mass imbalance to an engineer; consider 2 dp below 10 L/min.

## Perfection roadmap
- **Quick wins (24–48 h):** C1 patch, C2, H2b, H3 aria-labels, H6, M2 cavitation "—", M4, M5, M6, L1, L2, L3.
- **Structural (1–2 weeks):** H1 component-aware solver errors, H4 responsive top bar + inspector auto-collapse, H5 unit preferences, M3 measurement rows in case matrix.
- **Advanced polish:** M1 multi-point pump curves with paste, L4 persona-aware first-run, L5 port labels.

## Hold this in your hands
WalFlow feels like a well-machined instrument with a sticky lock on the case. Once you are past the door (find Workspace, check out, guess why the first run failed) the core loop is solid: drag, wire, run, and a warning that names Pressure Regulator 1 and says why; undo that brings back the pipes too; a cases matrix that shows +0.03 bar against the base without switching back and forth. The parts an engineer touches every minute are honest and quick, and a 57-pipe network solves in under two seconds. What makes this persona hesitate is not the physics but the doorway and the dialect: a new drawing that refuses the first drop, a Python error in place of an engineering sentence, and numbers in L/min and bar(a) that need converting before they go into Friday's review. Fix those three and this is a tool you would keep open next to the vendor datasheet.
