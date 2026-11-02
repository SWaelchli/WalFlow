# Findings

Open issues to implement or review. This list is temporary: delete a finding's overview row and detail row in the
same change that commits its fix (the commit and `CHANGELOG.md` are the record). Layout and rules: `walflow-qa`
skill, "Findings list".

- IDs are for this list only. Never put them in code, test names, param ids or comments; describe the behaviour.
- Fix test-first where a test has value; the **Test** column follows the bug-fix decision tree
  (law → reference row → scenario → new test). "Gate" means lint/build is the check and no new test is added.
- Run the gate (`walflow-gate-runner`) before marking a finding fixed.

Status: `Open` (agreed, to implement) · `Review` (needs a decision or a physics check first) · `In progress` · `Fixed` (remove at commit) · `Deferred` · `Rejected`

Owner: `orch` (orchestrator: backend/simulation, API) · `fe` (`walflow-frontend-dev`) · `phys` (`walflow-physics-reviewer` after the change)

## Overview

The only place that holds the status.

| ID | Severity | Status | Finding | Proposed solution | Owner | Phase | Source |
|---|---|---|---|---|---|---|---|
| DL1 | Medium | Open | The results panel toolbar repeats menu commands (Export CSV, Solve all cases twice, Case manager three times, New case) and wires them straight to handlers; Solve all is a second orange primary button. | Decided: toolbar keeps only view controls of the active tab (filter, auto sort); the commands live in their menus. | fe | 3 | Layout review 2026-10-30 |
| DL2 | Low | Open | The active case is switched and marked in the Cases, Relief and Measurements tabs (Switch buttons, Active badge) on top of the command bar, Simulation menu, status bar and case manager. | Decided: remove Switch buttons and the Active badge; a column highlight marks the active case. | fe | 3 | Layout review 2026-10-30 |
| DL3 | Low | Open | Information repeats inside the results panel: unit in row label and every cell, relief opening stated three times, a second case-name header row, "Run the simulation for results" per device cell. | Decided: unit once in the row label; each fact once. | fe | 3 | Layout review 2026-10-30 |
| DL4 | Low | Open | The Equipment tab lists every pipe again (filter type `all`). | Decided: the Equipment tab shows equipment only (CSV report rework is on ROADMAP.md). | fe | 3 | Layout review 2026-10-30 |
| DL5 | Low | Open | The case manager overlay repeats the case selector and New case; the canvas control strip has Case manager and Help buttons the skill does not list; the relief view can only be chosen in the overlay. | Decided: rename to "Relief scenario manager" holding only the relief view; View › Relief scenario ▸ submenu; "+" New case button beside the command bar case selector; remove the two extra canvas control buttons. | fe | 3 | Layout review 2026-10-30 |
| DL6 | — | Open | Two deliberate double homes are undocumented: pipe properties edited in the Pipes table, relief forced state edited in the Relief case matrix and in the inspector. | Decided: keep both, documented as exceptions in `walflow-ui-layout`. | orch | 3 | Layout review 2026-10-30 |
| CT1 | Medium | Open | `/catalogue` renders outside the app shell with its own 56 px inline-styled header (old navbar copy), inline tab pills and inline modals. | Decided: a page mode of the app shell (same menu bar, page tab strip in the command bar row, list in the pane column, details in the main area, page status bar). | fe, orch | 4 | Layout review 2026-10-30 |
| CT2 | Low | Open | `--color-surface-light` is used but never defined (catalogue, fitting standards, editor pipe selector), so those backgrounds fall back to transparent. | Decided: replace with `--color-surface-muted`. | fe | 4 | Layout review 2026-10-30 |
| EX1 | Medium | Open | The example drawings are not neat: readouts and badges run into symbols, signal lines cross text, pipes bend or cross where they need not. | Some equipment names are meaningless, such as `TANK_985_copy_copy_copy` in the Large Reference Network. Decided: re-lay out and rename across all 13 examples to the rules in the details below, without changing any parameter or result. | orch, fe | 5 | User request 2026-11-02 |
| EX2 | Low | Open | An example loaded after another one keeps the previous zoom and pan, so it can open cut off until fit-view is pressed. | Decided: fit the view when a drawing is opened. | fe | 5 | Browser check 2026-11-02 |
| EX3 | — | Open | Nothing keeps future examples neat. | Decided: the layout and naming rules go in the `walflow-ui-layout` skill, and `equipment-creation` points to them for its example. | orch | 5 | User request 2026-11-02 |
| DR1 | Medium | Review | A new tab showed "Restored unsaved drawing" with an empty canvas and "1 problem" in the status bar. It is unknown whether an empty draft was saved or a real one failed to load, so it could mean lost work. | Find the cause first, then decide. | fe | — | Browser check 2026-11-02 |
| PF1 | Low | Review | A fresh load of the Large Reference Network blocks the page for about 2.2 s on the dev server (a repeat load was fast). One load during a gate run froze the tab for about 30 s and showed "Solver not connected" until it reconnected. | Measure on a production build first, under the `walflow-performance` skill rules where they apply. | fe | — | Browser check 2026-11-02 |

## Roadmap

| Phase | Entries | Why this order | Exit check |
|---|---|---|---|
| 3 | DL1–DL6 | Independent of 1–2; small, touches the results panel, command bar and status bar only. | Gate green; results panel toolbar shows view controls only; skill updated with the two exceptions; docs sync test green. |
| 4 | CT1, CT2 | Largest change; needs the shell to grow a page mode. | Gate green; browser check signed in as `test_pipes`, `test_admin` and `test_alice` (see CT1). |
| 5 | EX1, EX2, EX3 | Last step before the v0.2.0 release. Starts only when phases 1–4 and every other branch are on main, because symbol sizes and node footers set the layout. | Gate green with `golden_examples.json` unchanged; browser check of all 13 examples against the layout and naming rules; user sign-off of each drawing. |

The layout work is committed (5a364a0). Commit each phase only when the user asks.


## Details: Example drawings

Phase 5 is a release gate for v0.2.0. **Start condition:** phases 1–4 are done and no branch with work is left
unmerged (none on 2026-11-02). Re-check with `git branch -a --no-merged main`.

Layout rules, highest first. A lower rule gives way to a higher one:

1. **Nothing overlaps:** no text on a symbol, on other text or under a note, and no pipe or signal line through text.
2. **Pipes do not cross,** unless the network's topology forces it.
3. **Pipes run straight:** connected ports are aligned on the grid so the run has no bend, whenever possible.
4. **Rotation serves the run:** rotate a component to give the shortest pipe run that does not collide.
5. **The process reads left to right,** supply on the left and return on the right, with notes beside the drawing,
   not inside it.
6. **It fits and stays legible:** the drawing fits the canvas at fit-view in a 1512 × 800 window with the results
   panel open.

Naming rule: every equipment and pipe name is meaningful and says what the item is or does in that process, for example
"Cooling Water Tank" or "Pump A Discharge". No copy suffixes and no generated names: the Large Reference Network has
`TANK_985_copy_copy_copy_copy_copy` and `BRANCH_770_copy_copy`. Names are unique within a drawing. A benchmark that
follows a published figure keeps that figure's numbering.

Limits: only names (labels), node positions, rotation, note position and size, and edge handles may change. Parameters,
pipe lengths, connections and internal IDs stay as they are, so the results stay the same. A benchmark that follows a
published figure keeps that figure's arrangement.

| ID | Details | Where | Test |
|---|---|---|---|
| EX1 | Before starting, list what each example breaks, for user review. Then do one example at a time, with a screenshot for sign-off: Welcome canvas, API 614 LOS, API 682 seal flush, chilled water, Large Reference Network, pressure regulation, thermal and 3-way TCV, centrifugal vs volumetric, remote control and interlocks, parallel pumping, Multi-PSV and rupture disc, Jeppson 7-pipe, Jeppson 48-pipe. Known today: LOS "0.00 L/min" on Main Tank Return; Multi-PSV PIT 101 covers the RELIEF_BRANCH_1 value and its signal line crosses the RD-101 readout; FIT 103 "27.3 L/min" on Process Tap. The Large Reference Network opens with its heat exchanger already selected, and clicking another item then showed "2 selected"; clear any saved selection if the file holds one. Measure overlaps in the browser (readout, badge and symbol rectangles of neighbouring nodes), with results showing, because readouts are taller after a run. | `frontend/src/data/examples/*.wlf` | Existing golden test must pass with the JSON unchanged; no new test. |
| EX2 | Opening a drawing keeps the previous viewport. Seen by loading Thermal, then Pressure Regulation. Check it again after `perf/optimize-performance` merges, as that changes the loading path. | `frontend/src/App.jsx` | Browser check; component test if the logic is testable. |
| EX3 | Copy the layout and naming rules above into `walflow-ui-layout` as "Example drawings" when phase 5 ends, so they outlive this temporary list. | `.claude/skills/walflow-ui-layout/SKILL.md`, `.claude/skills/equipment-creation/SKILL.md` | Gate. |

## Details: Layout review 2026-10-30

Source: user review of the new app shell before committing it (2026-10-30), with read-only scout audits of the
data list, canvas values, results views and catalogue. No published report. Line numbers are from the uncommitted
working tree of 2026-10-30; re-check them before editing.

Read before any change: `frontend/AGENTS.md`, `design-system/walflow/MASTER.md`, `.claude/skills/walflow-ui-layout/SKILL.md`,
`.claude/skills/ui-ux-pro-max/SKILL.md`, and `walflow-qa` for tests. Frontend code goes through `walflow-frontend-dev`,
tests through `walflow-test-author`, the gate through `walflow-gate-runner`.

| ID | Details | Where | Test |
|---|---|---|---|
| DR1 | Seen after signing in on a new tab with several `walflow_draft_*` keys in `localStorage`; the last drawing in the previous tab was a loaded example. Trace which draft the restore picks and why it was empty. | `frontend/src/hooks/useAutoSaveSession.js` | Hook test if a bug is confirmed. |
| PF1 | Long-task timing from the Multi-PSV example to the large one: one task of 2185 ms. | `frontend/src/App.jsx`, example loading path | None unless a fix follows. |
| DL1 | Toolbar per tab today (`DataList.jsx:588-667`): Cases: New case (592-598), Case manager toggle (600-606), Solve all cases as `btn-primary` (607-613). Measurements: Case manager (617-623), Solve all (624-630). Relief: Case manager (633-639). Pipes/Equipment: Filter (642-652), Auto sort (653-658), Export CSV (659-664). Menu homes: `file.export-csv`, `simulation.solve-all`, `view.case-manager`, `simulation.new-case` (`commands/commandList.js:77-83,172-173,181-187,194-195`). Remove New case, Case manager, Solve all and Export CSV from the toolbar; keep Filter and Auto sort (view controls of the tab). Keep the `getResults()` handle API (`exportCsv`, `solveAll`, `canExportCsv`, `isBatchLoading`, `DataList.jsx:~530-540`) because the menu commands use it. Fix the outdated reason text in `file.export-csv` ("Open the Pipe Network List or Full Equipment tab" → the current tab names Pipes / Equipment). Fix the command bar case selector tooltip "Add cases in the Operating cases tab below the canvas" (`CommandBar.jsx:67`) → "Simulation › New case…". Remove now-unused props (`onAddCase`, `onToggleCaseManager`, `showCaseManager`) from DataList and its call in `App.jsx:~2190-2200`. Rename and delete case stay in the Cases tab column header: it is their only home (the case manager cannot rename or delete). | `components/panels/DataList.jsx:194-205,516-540,588-667`, `commands/commandList.js:77-83`, `components/layout/CommandBar.jsx:63-78`, `App.jsx:2171-2200` | Vitest: update `DataList.test.jsx` (toolbar per tab shows only filter/auto sort); `commandList` test for the reason text if one exists. |
| DL2 | Switch buttons per case column in Cases (`DataList.jsx:~738-744`) and Relief (`~909`) and Measurements (`MeasurementsTable.jsx:~116`); Active badge (`~762`, `~912`). Other homes of the active case: command bar selector, Simulation › Active case, status bar Case slot, case manager selector. Remove Switch and the Active badge; keep a column highlight (tokenised background) on the active case, with `aria-current="true"` on its header so it is not colour alone. The per-case "Out of date" badge stays: it says which case is stale, which no other place shows. | `components/panels/DataList.jsx:~738-765,~905-915`, `components/panels/MeasurementsTable.jsx:~110-125` | Vitest: `DataList.test.jsx` / `MeasurementsTable` test: no Switch button, active header has `aria-current`. |
| DL3 | Units: row label "(bara)" plus the unit in every value cell (`DataList.jsx:~775-799,~1010-1062`) → unit only in the row label (or column header in Pipes/Equipment). Relief: "At opening of X · n % load" in the Peak row (`~1039`) repeats the "First relief opening" row (`~1081`) and the "at n % load" in each device badge (`~155`) → state it once, in the "First relief opening" row. Relief summary header row (`~993-997`) repeats the case header row → remove. "Run the simulation for results" printed per device cell (`~139`) → one message for the tab when there are no results. ΔP and velocity stay (engineers read them directly). The batch error block appears once per tab (Cases `~680`, Relief `~867`), which is fine. | `components/panels/DataList.jsx:~130-175,~770-800,~990-1085` | Vitest: `DataList.test.jsx` cases for unit placement and the single no-results message. |
| DL4 | Equipment tab uses filter type `all` (`DataList.jsx:~436`), so all pipes appear in both the Pipes and Equipment tabs. Decided: the Equipment tab lists equipment only (no pipes); Export CSV on that tab then exports equipment only. A rework of the CSV export (scope settings, more lists) is a separate item on ROADMAP.md, "Rework of CSV Reports"; not part of this work. | `components/panels/DataList.jsx:~436,516-540` | Vitest: `DataList.test.jsx`: Equipment tab has no pipe rows. |
| DL5 | Today: the case manager overlay (`components/overlays/CaseManager.jsx`, title "Scenario & Case Manager") has an "Operating case" selector (127-147), New case (148-157) and the "Relief case view" choice (160+: `mitigated` "Relieved system pressure", `peak` "Peak system pressure", `unmitigated_global` "Unmitigated peak pressure", state `telemetryMode` / `onToggleTelemetryMode` in `App.jsx`); its colours are hex (`#10B981`, `#ECFDF5`, `#065F46`, `#DC2626`, `#FEF2F2`, `#991B1B`, 24-45). Canvas control strip (`App.jsx:1937-1963`): Heatmap, Case manager, Help; all call setters directly. Decided by the user: (1) Rename the overlay to **"Relief scenario manager"** (title, component name e.g. `ReliefScenarioManager.jsx`, command `view.case-manager` → `view.relief-scenarios` labelled "Relief scenario manager", tooltips, help text, skill and MASTER mentions; grep "case manager" / `CaseManager` / `case-manager` in `frontend/src`, `.claude/skills/walflow-ui-layout/SKILL.md`, `design-system/walflow/MASTER.md`; leave `CHANGELOG.md`, `docs/change_log_history.md` and `docs/audit/` as history). (2) It holds only the relief scenario choice: drop its case selector and New case button (and the `cases`, `activeCaseId`, `onSelectCase`, `onAddCase` props); colours → tokens. (3) New View menu entry **"Relief scenario ▸"**: a radio submenu with the three scenarios (`children(ctx)` like Heatmap, `checked` = current `telemetryMode`), in the `overlays` group next to Heatmap and the manager toggle; `ctx` gets `telemetryMode` and an action to set it. (4) A **"+" icon button right of the case selector in the command bar** (`CommandBar.jsx:63-78`) that runs `simulation.new-case` through `runCommand` (accessible name "New case", tooltip "New case…", disabled with the reason when read-only); the Simulation menu entry stays as its menu home. (5) Remove the Case manager and Help buttons from the canvas control strip; the Heatmap button stays (skill canvas table) but runs `view.heatmap` through `runCommand`. (6) Status bar Case slot (`StatusBar.jsx:35-41`) opens the case manager today; since the overlay is no longer about cases, the slot becomes static text (no click), like the Selection slot. (7) Update the skill: View menu row, canvas table ("Top right: heatmap legend, relief scenario manager"), placement table example, command bar line ("Case selector, New case"), status bar table Case click "—"; docs sync test must stay green. | `components/overlays/CaseManager.jsx`, `App.jsx:1937-1963,2126-2135` (and the `telemetryMode` state), `commands/commandList.js:166-173,188-195`, `components/layout/CommandBar.jsx:31-78`, `components/layout/StatusBar.jsx:35-41`, `hooks/useOperatingCases.js`, `test/commandCtx.js`, `.claude/skills/walflow-ui-layout/SKILL.md:45,60,82,109-110,140` | Vitest: overlay test (title, three choices, no case selector); `commandList` test for the relief submenu (radio, checked); `CommandBar` test for the "+" button (runs the command, disabled read-only); `StatusBar.test.jsx` Case slot static; docs sync test. |
| DL6 | Document in `walflow-ui-layout` skill, "Results panel" section, as deliberate exceptions to "a property of the selected item → Inspector": (a) the Pipes table edits pipe name, NPS, schedule, pipe class and length for many pipes at once (bulk edit; same data changes as the inspector, `DataList.jsx:~1160-1331`); (b) relief forced state (`forced_state`: auto / forced closed / forced open) is edited per device and case in the Relief case matrix (`DataList.jsx:~945-971`) and per device in the inspector Setup tab "Contingency Test Mode" (`SetupPanel.jsx:1222,1299`); both write the same field and case override (`utils/case_resolver.js:232-234`). Rule to add: a results-panel table may edit a property only when it edits many items or many cases at once, and must use the same data change as the inspector. | `.claude/skills/walflow-ui-layout/SKILL.md:124-131` | Gate (docs sync test). |
| CT1 | Today: no router; `App.jsx:228-249` reads `window.location.pathname` (`/pipes` → `/catalogue`); `App.jsx:1697-1731` renders only `LazyPage > CataloguePage` plus Login, Admin hub and Help modals, no `AppShell`. `pages/CataloguePage.jsx`: own `<header>` 751-986 (56px, `#FFFFFF`, logo + version, Back to drawing 795-812 with `confirmDiscard`, three tab pills 825-893, Admin hub button 899-921 for admins, sign-in box 924-984); body: `FittingStandardsTab` for two tabs (989-993), otherwise `<aside>` 999-1119 (320px: search, source filter) and `<main>` 1122+ (explainer, spec card, tables ~1522 and ~1732, edit form); inline `.modal-overlay` markup at ~1820, ~1891, ~2218 (`zIndex 20000` inline), ~2381; hex at 754, 928-929, 941. Roles: `canManage` = admin or pipe_manager (`CataloguePage.jsx:108`) gates Clone/Edit (1157-1173) and the fitting standards editing. Shell today assumes a canvas: `AppShell.jsx:70-94` (props header, rail, pane, canvas, results, inspector, status; `<main class="shell-canvas">`), `useOverlayPaneDismiss` keys on `.shell-canvas` (3-49); `MenuBar.jsx:107-117` props are drawing-bound; `StatusBar.jsx` reads canvas zoom (`useStore`, needs ReactFlow provider). Fix: see "Catalogue page mode" design below. Browser check (see `walflow-test-users` skill): `test_pipes` (pipe_manager: clone, edit, fitting standards, save, discard confirm), `test_admin` (everything plus Tools › Admin hub from the page), `test_alice` (read-only: no edit controls); at widths 1440, 1100 and 900; sign out afterwards and tell the user. | `App.jsx:228-249,1674,1697-1731`, `pages/CataloguePage.jsx`, `components/piping/FittingStandardsTab.jsx`, `components/piping/LibraryActions.jsx`, `components/layout/AppShell.jsx`, `MenuBar.jsx`, `StatusBar.jsx`, `commands/commandList.js:198-205`, `index.css:403-551,890-961,1177-1500`, `components/common/LazyModal.jsx:11,30` | Vitest: `AppShell` page-mode test (no canvas region, pane and main render, dismiss logic does not break); `CataloguePage` tests updated (tabs, back to drawing runs the command, role gating per role); `commandList` test for drawing-bound commands disabled on the page; docs sync test for the menu table. |
| CT2 | `--color-surface-light` has no definition (MASTER has `--color-surface-muted` / `--color-surface-hover`). Used at `CataloguePage.jsx:1029,1475,1522,1732,1790,1965`, `FittingStandardsTab.jsx:169,777,801,1049`, `components/piping/PipeSelector.jsx:120-307` (editor inspector). Replace with `--color-surface-muted`; check PipeSelector in the editor visually after. | files listed | Gate; the RL1 guard may also reject `--color-` names that `index.css` does not define. |

### Decided design: Canvas values

- One shared component in `frontend/src/nodes/` (e.g. `NodeReadout`, used through `BaseNode`'s `footer`), rendering
  rows of `{ label?, value, unit? }` plus an optional `status` badge. Nodes pass data; they never style text.
- Canvas text tokens in MASTER.md (canvas zooms, so px tokens are allowed there, but as tokens): node name, value,
  secondary line, badge. Values use `font-variant-numeric: tabular-nums`, one weight, one colour
  (`--color-brand-dark`); secondary lines `--color-text-secondary`. The pipe hover label uses the same value token
  (keeps its halo).
- A number never carries colour, whatever its sign or state. Colour is allowed only on a state mark: the shared
  status badge (kinds: neutral, success, warning, danger, info) or the BaseNode warning icon, always with words or
  an icon (never colour alone), and only from tokens. Heatmap colours on pipes are the one exception (legend).
- Equipment-specific marks (e.g. a port letter) use tokens and the readout's slots; no hex literals in nodes.

### Decided design: Results display (RD1, RD2)

Shared blocks in `frontend/src/components/details/` (names indicative), styled by classes in `index.css` built from
MASTER tokens, no inline style objects:

| Block | Use | Style |
|---|---|---|
| `ResultSection` | Every group of results, title plus content | The one section header (fs-xs, weight 700, uppercase, 3px primary left border), replaces the 9 copies |
| `ResultTable` / `ResultRow` | Every key/value result; optional extra columns (ports, cases) | Label left, secondary colour, weight 500, no colon; value right-aligned, `--font-mono`, tabular, weight 600, primary text; unit after the value, fs-xs, secondary; `—` for no value |
| `StatusBadge` | Any state (open/closed, intact/burst, OFF, alarm) | Same component as on the canvas |
| `ResultCallout` | Warnings and errors (cavitation, overload, no results) | Info-bar style, warning / danger tokens, icon plus words |
| `ResultChart` | Every chart frame | Chart font sizes and colours from tokens (no `fontSize={10}`) |

- Every results view = a list of `ResultSection`s. Equipment-specific content (pump curves, PSV scale, mixing
  balance, port table) goes inside a section as its own child; it may have its own layout but uses the blocks for
  any label/value, badge or warning it shows.
- All numbers through `UnitContext` formatters or the shared dimensionless formatter; no `toFixed` in views.
- Equipment without a dedicated view gets the generic view, which is itself built from these blocks.
- The results panel tables (`DataList.jsx`) use the same value cell style; their table layout stays.

### Decided design: Catalogue page mode (CT1)

- `AppShell` gets a page mode (prop such as `mode="page"`): same grid and classes; no rail, no inspector, no results
  panel; the pane column holds the page's list (same pane styles and width token, same overlay behaviour below
  1008 px); the main area holds the details and scrolls; overlay-dismiss logic must not assume `.shell-canvas`.
- Row 1: the same `MenuBar` with the same menus and account area (the page's own sign-in box and Admin hub button
  go away; Admin hub is Tools › Admin hub…). Centre shows the page name ("Catalogue") instead of
  `Project / Drawing`; save state and lock chip hidden.
- Commands that need the drawing (save, edit, canvas view, panels, simulation) return a reason from `isEnabled`
  while on the page ("Go back to the drawing first"), so they show disabled with a tooltip; keyboard shortcuts for
  them do nothing on the page. `ctx` carries the current page.
- Row 2 (command bar row): a page tab strip: "← Back to drawing" then the catalogue tabs (same tab classes as the
  results panel tabs). Back to drawing must be a command: make `tools.catalogue` a checked toggle (checked on the
  page; running it on the page goes back, still through `confirmDiscard` when there are unsaved catalogue edits).
  Update the menu table in the skill (docs sync test).
- Status bar on the page: page slots (entry count of the current list, source filter, "Read-only" or "Can edit" for
  the user's role). It must not use ReactFlow's store outside a provider.
- Inline modals in `CataloguePage.jsx` → the shared modal component / `utils/dialogs.js`, layers from tokens (no
  `zIndex 20000`). Inline header and tab-pill styles deleted; hex → tokens.
- `walflow-ui-layout` "Pages" section and MASTER.md "App Shell & Layout" rewritten to describe page mode, so a
  future page follows the same pattern. Admin hub and Project manager stay dialogs.
