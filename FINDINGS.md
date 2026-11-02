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
