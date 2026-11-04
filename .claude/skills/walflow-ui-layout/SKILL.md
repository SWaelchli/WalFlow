---
name: walflow-ui-layout
description: Where things go in the WalFlow user interface - the app shell regions (menu bar, command bar, activity rail and side pane, canvas, inspector, results panel, status bar, pages, dialogs), the placement rule for new features, the command list and menu structure, responsive behaviour, and the layout checklist and verification. Use whenever adding or moving a button, menu item, panel, tab, overlay, dialog, toast or status display, adding a feature that needs UI, or reviewing the layout.
metadata:
  version: "1.0.0"
---

# WalFlow UI Layout

Every kind of control has one home. A user who knows where actions, properties, results and status live in one
part of WalFlow finds them in the same place everywhere, and a developer adding a feature knows where it goes
before writing code. The layout follows the conventions of Windows desktop apps and of the hydraulic tools
engineers already use (EPANET, FluidFlow, Pipe Flow Expert: menu bar, palette, canvas, property editor, results
tables, status bar).

**A layout change moves controls; it never changes what they do.** Same commands, same inputs, same results, same
permissions. If a layout idea needs a behaviour change, it is a separate request: ask the user.

## Sources, in order of authority

| What | Where |
|---|---|
| How it looks: tokens, type, components, shell sizes, breakpoints, layers | [`design-system/walflow/MASTER.md`](../../../design-system/walflow/MASTER.md) |
| Where it goes and how it behaves in the shell | this skill |
| Generic desktop UI and UX rules, searches | `ui-ux-pro-max` skill |
| Background | [Windows app design guidelines](https://learn.microsoft.com/en-us/windows/apps/design/guidelines-overview): [commanding](https://learn.microsoft.com/en-us/windows/apps/design/basics/commanding-basics), [menus](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus), [command bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar), [navigation view](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/navigationview), [breakpoints](https://learn.microsoft.com/en-us/windows/apps/design/layout/screen-sizes-and-breakpoints-for-responsive-design), [dialogs](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/dialogs-and-flyouts/), [info bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/infobar) |

## The placement rule

Before building any UI, decide what the thing **is**. The answer picks the region. Do not invent a new region; if
nothing fits, ask the user.

| It is... | Goes in | Examples |
|---|---|---|
| An action on the drawing or the app | **Command list**, shown in a menu bar menu. Frequent: also the command bar. About the item under the pointer: also its context menu. | Save, Undo, Run, Insert measurement tap |
| A property of the selected item | **Inspector**, Setup tab | Pump rated head, pipe size |
| A result of the selected item | **Inspector**, Results tab | Pump curve, NPSHa |
| A result over the whole drawing | **Results panel**, a tab | Pipe list, case matrix |
| A place to browse, pick or configure beside the canvas | **Side pane**, one rail item | Components, Drawings, Settings |
| A state the user should always be able to see | **Status bar** slot; document state in the **menu bar** next to the drawing name | Run result, units, zoom; saved, locked |
| A state that needs attention or action | **Info bar** at the top of the canvas | Run failed, read-only drawing, results out of date |
| A short confirmation of something that just happened | **Toast** | "Saved to cloud" |
| A decision the user must make before going on | **Dialog** | Unsaved changes, permanent delete |
| A large management task that replaces the editor | **Page** | Catalogue |
| A visual layer over the diagram | **Canvas overlay**, in its corner | Heatmap legend, relief scenario manager |

## Regions

Geometry (sizes, tokens, breakpoints, layers) is in MASTER.md, "App Shell & Layout". Content and rules:

### Menu bar (row 1)

Left: logo (opens About), then the menus. Centre: `Project / Drawing` name (`Project / Local draft` when no drawing is
open; the project name is a button running `file.open`), save state, lock chip. Right: account
(Sign in button, or user name menu with Sign out).

Each page has its own menus and keys (see "The command list"). Tools and Help are shared by all pages.

### Drawing menus

| Menu | Items (current command → place) |
|---|---|
| **File** | New drawing… · Open… (Drawings pane) · Save `Ctrl+S` · Save as… · — · Import .wlf file… · Export .wlf file · Export table as CSV |
| **Edit** | Undo `Ctrl+Z` · Redo `Ctrl+Y` · — · Copy `Ctrl+C` · Paste `Ctrl+V` · Duplicate `Ctrl+D` · Delete `Del` · — · Select all `Ctrl+A` · Rotate `R` · — · Add instrument · Insert measurement tap |
| **View** | Components · Examples · Drawings · Settings (side panes) · Inspector · Results panel · — · Zoom in · Zoom out · Fit view · Lock canvas · — · Heatmap ▸ · Relief scenario ▸ |
| **Simulation** | Run simulation `Ctrl+Enter` · Solve all cases · — · Active case ▸ (radio list) · New case… |
| **Tools** | Catalogue · Manage projects… · Admin hub… (admins only) |
| **Help** | User guide · Keyboard shortcuts `?` · Model & limits · About WalFlow |

### Catalogue menus

| Menu | Items (current command → place) |
|---|---|
| **File** | New entry… (label follows the tab) `N` · — · Save changes `Ctrl+S` · — · Import from TR2000… (pipe classes tab only) · Import library… · Export library · — · Back to drawing |
| **Edit** | Edit selected `E` · Clone selected `Ctrl+D` · Delete selected `Del` · — · Discard changes `Esc` · Restore defaults… |
| **View** | Pipe classes `Alt+1` · Fitting standards `Alt+2` · Control valve styles `Alt+3` · — · Show list · Search the list `/` · — · Previous entry `Up` · Next entry `Down` |
| **Tools** | Catalogue · Admin hub… (admins only) |
| **Help** | User guide · Keyboard shortcuts `?` · Model & limits · About WalFlow |

Rules:
- Menu order is fixed for each page: File, Edit, View, Simulation (drawing only), Tools, Help. A new menu needs the
  user's approval. A page never shows the drawing's commands greyed out; it lists only what works there. A menu with no
  visible item is hidden.
- Every command appears in exactly one menu. Group with separators; at most about 12 items per menu, use a
  submenu (`▸`) beyond that.
- Labels: sentence case, verb first, `…` when more input follows before the action runs. Shortcut shown right.
- Unavailable now (nothing selected, read-only drawing, signed out): **disabled**, with the reason in a tooltip.
  Not allowed for this user (role): **hidden**.
- Checkable items (`checked`) are `menuitemcheckbox` with a check in the icon slot; choices in a submenu (Active
  case, Heatmap, Relief scenario) are `menuitemradio`. A submenu can end with a separator and a toggle: Relief
  scenario ends with Relief scenario manager, a `menuitemcheckbox`. Tools › Catalogue is checkable: checked on the
  Catalogue page, and running it there goes back to the drawing.
- Keyboard: one tab stop on the bar (roving focus); Left/Right moves between menus and wraps; Down, Enter or Space
  opens; Up/Down moves inside; Right/Left opens and closes a submenu; Esc closes and returns focus to the trigger.
  With one menu open, hovering another menu opens it. A click outside closes.
- Account (right): the user name with a caret opens a menu with Sign out; signed out, a Sign in button. The centre
  shows "Local draft" when no cloud drawing is open.

### Command bar (row 2)

Left to right: Undo, Redo │ **Run Simulation** │ Case selector, New case │ (room for frequent commands) — right: panel toggles
(side pane, results panel, inspector).

- Run Simulation is the only primary (orange) button in the shell.
- Only commands used many times per session go here, in order of importance, at most 8 besides the panel toggles.
  Everything here is also in a menu.
- No status, no file commands, no navigation to pages.
- Icon buttons (`.icon-btn`) have an accessible name and a tooltip with the shortcut; panel toggles use
  `aria-pressed`. Every button runs its command through `runCommand(id, ctx)`.

### Activity rail and side pane (left)

Rail items, top to bottom: **Components** (equipment palette and search), **Examples** (templates), **Drawings**
(projects and drawings, Manage projects link), **Settings** (Drawing / Project / Global).

- One job per pane. The pane has a header (title, optional pane actions) and scrolls on its own.
- Tabs at most two levels deep: rail item → tabs inside the pane (Settings uses this). Never a third level.
- Clicking the active rail item collapses the pane; the rail stays. Links into a pane from elsewhere (empty-canvas
  hint, status bar) run the pane command with `{ open: true, tab }`, which opens and never collapses.
- No duplicate commands in panes: New, Save as, Import, Export live in the File menu only.
- A new rail item needs the user's approval; keep the rail at 6 items or fewer.

### Canvas

| Position | Holds |
|---|---|
| Top edge, full width | Info bars (`.canvas-infobars`: run failed, graph error, stale results), stacked above `.canvas-viewport`, which shrinks; never over the diagram |
| Top right, one column with a gap | Heatmap legend, relief scenario manager (`.canvas-overlays`, cards `.canvas-overlay-card`). Stack with flex, never computed offsets |
| Bottom left | Canvas controls: zoom in, zoom out, fit view, lock, heatmap, relief scenario manager. Each has `aria-label` and a tooltip with its shortcut |
| Bottom right | Reserved (minimap) |
| Centre | Empty-canvas hint (with a "Browse examples" button that opens the Examples list), loading overlay, file-drop target |

Only view controls belong on the canvas. Commands that change the drawing go through the command list.

### Inspector (right, full height)

- Opens when something is selected, hidden when nothing is, so the canvas takes the space. View › Inspector (and
  its command bar toggle) collapses it; it stays collapsed across selections until shown again.
- Header: item name, type, Delete (danger ghost), Collapse inspector (same as View › Inspector). Tabs: Setup,
  Results. No further tab level.
- Equipment fields are added in `SetupPanel.jsx` / `details/*` per the `equipment-creation` skill. The shell does not change.
- What the Results tab shows and how it looks: MASTER.md "Results display" (shared results blocks).

### Results panel (under the canvas)

- Tabs: Pipes, Equipment, Cases, Relief, Measurements (short labels; the full title is the tooltip). Labels never
  wrap; at narrow widths the tab strip scrolls.
- Toolbar on the right holds only view controls of the active tab (filter, auto sort); commands live in their menus.
  When it does not fit beside the tabs it wraps onto its own row, never clipped. Hidden while the panel is collapsed.
- Collapsible to its tab strip; size and collapsed state are remembered (`usePanelHeight`). Its height is clamped
  so the canvas keeps its minimum height.
- A results-panel table may edit a property only when it edits many items or many cases at once, and it must use the
  same data change as the inspector. Two deliberate exceptions to "a property of the selected item goes in the
  Inspector" follow this rule:
  - The Pipes table edits pipe name, NPS, schedule, pipe class and length for many pipes at once.
  - The Relief case matrix edits the forced state per device and case; the inspector Setup tab edits it per device.
    Both write the same field and case override.

### Status bar (bottom)

Fixed slots, left to right:

| Slot | Shows | Click |
|---|---|---|
| Run result | Not run yet / Converged · time / Failed / Out of date, with icon | Flyout: solver statistics and run messages |
| Case | Active case name | — |
| Warnings | Count of model errors and warnings, hidden when zero | The run result flyout with the list |
| Units (right) | Pressure basis, flow unit and temperature unit | Settings pane, Global tab (`view.settings` with `{ open: true, tab: 'global' }`) |
| Selection (right) | `n selected`, hidden when zero | — |
| Zoom (right) | `85 %` | Fit view |

- A new state gets a slot here instead of a new chip elsewhere. Slots never wrap; at medium width hide in this
  order: zoom, selection, units.
- Status text uses words and an icon, never colour alone.

### Pages

The Catalogue is a page: a page mode of the app shell (`AppShell mode="page"`), not a separate layout. A new large
management screen is a page in the same pattern. Admin hub and Project manager stay dialogs until the user decides
otherwise.

- **Menu bar:** the page's own menus (Catalogue: see "Catalogue menus"), and the same account area. The centre shows
  the page name instead of `Project / Drawing`; save state and lock chip are hidden. A page has no sign-in box or Admin
  hub button of its own.
- **Command bar row:** a page tab strip: "← Back to drawing", then the page's tabs (results panel tab classes). A list
  toggle at the right of the strip shows or hides the list.
- **Pane column:** the page's list, with the side pane's styles and width, and its overlay behaviour below 1008 px.
  No activity rail. The page's main action (New) sits at the top of the list. An empty library shows New and the
  import commands in the list; a filter with no match shows only its message.
- **Main area:** the details; it scrolls. No canvas, inspector or results panel. Actions on the selected entry (Clone,
  Edit, Delete) sit at the top of the details as well as in the menu. Actions on the whole library (import, export,
  restore) are in the menu only. While editing, Save and Cancel stick to the top of the details so they stay reachable
  in a long entry.
- **Status bar:** page slots (`PageStatusBar`): entry count of the current list, source filter, and "Read-only" or
  "Can edit" for the user's role.
- **Commands:** `ctx.page` carries the current page, and each page has one definition file in `commands/pages/` (see
  "The command list"). No drawing command runs on a page. Ctrl+S never reaches the browser's Save dialog, even with
  nothing to save; other keys the page does not use stay with the browser (copy, select all, ...).
- **Live state:** the page registers its tab, selection, edit state and handlers with `usePageState`, read as
  `ctx.pageState`; the state stays in the page.
- **Back to the drawing** is the page's toggle command (Tools › Catalogue, checked on the page), and is also in File.
  It goes through `confirmDiscard` when the page has unsaved edits.
- **Unsaved edits:** Cancel, Discard changes, switching tab or entry and New all ask first when there are changes, and
  do not ask when there are none.

To add a page: one definition file (`{ id, name, menuOrder, commands, keyOnlyCommands, hideShared }`), one entry in
`PAGES` (`commandList.js`), one "<Page> menus" table above, and the page registers its state.

### Dialogs, info bars and toasts

| Use | When | Never for |
|---|---|---|
| **Dialog** (`confirmDialog`, `confirmDiscard`, `askName` in `utils/dialogs.js`, or a modal) | Unsaved work would be lost; permanent delete of a stored item (drawing, project, user, catalogue entry); overwriting a newer version; input needed before an action | Reversible canvas edits (undo exists); loading an example onto an empty or unedited canvas (`useCanvasHistory().hasEdits()`); information only |
| **Info bar** | A state that lasts and may need action. Closable once the state is resolved | Confirmations of a user action |
| **Toast** | A short confirmation or a background event finished | Errors the user must act on; anything the user needs later |

Dialog buttons: secondary left, primary right (WalFlow convention, MASTER.md modal footer). Esc and Cancel never
change anything. Focus returns to the control that opened the dialog.

Every dialog takes these keys, and only the top dialog reacts:
- **Esc** does what its Cancel or Close button does. It does nothing while the dialog's action runs (`aria-busy` on the
  dialog) or when the dialog has no way to close (first-admin setup).
- **Enter** runs the primary action, with the same validation as clicking it; a disabled primary does nothing. It also
  confirms Delete and Discard: `confirmDialog` starts with focus on the confirm button (`data-autofocus`). A textarea
  keeps Enter for a new line, and a focused button or link runs itself. A dialog with no single primary action (Help,
  Admin hub, Project manager) has no Enter action of its own.
- Prefer a real `<form onSubmit>`; otherwise use `useEscapeKey` and `useEnterKey`. The key that closes a dialog must not
  also run a page or canvas command.

## The command list

All user commands are defined once: the drawing's in `frontend/src/commands/commandList.js`, Tools and Help in
`commands/sharedCommands.js`, a page's in `commands/pages/<page>.js`. `getPageDefinition(page)` is the one lookup.
Entries have: `id` (`<menu>.<name>`, e.g. `edit.duplicate`), `label` (`getLabel(ctx)` when it changes with the state),
`menu` and `group` (separators), `icon`, `shortcut`, `firesInInputs` (Save only), `radio` (a choice among items of the
menu), `contexts` (`node`, `edge`, `pane`: which context menus show it), `isEnabled(ctx)` returning `true` or the
reason it is unavailable, `isVisible(ctx)`, `run(ctx)`, and for submenus `children(ctx)`. `ctx` is built once per
render in `App.jsx` from the existing handlers and state. The menu bar, command bar, context menus, keyboard shortcuts
(`hooks/useKeyboardShortcuts.js`) and the Help shortcut list all read these lists.
`listCommandsByMenu(page)` returns a page's menus in order; the docs sync test compares it with the menu tables above.

- Add a command once. Never wire a handler straight into a button, menu item or key listener.
- Every command has a menu entry. A context menu or command bar entry is an extra way in, never the only one.
- Read-only drawings disable edit commands through `isEnabled`, so every surface agrees.
- Esc (clear selection, close the top layer) is a key-only command (`KEY_ONLY_COMMANDS`), not in a menu.
- Shortcuts: one per command, unique within a page. The same action keeps the same key on every page (`Ctrl+D`,
  `Del`, `Ctrl+S`). Single keys (`R`, `Del`, `?`, `N`, `E`) only act outside inputs, never while typing, and not with
  a menu or dialog open. Do not take browser-reserved keys: `Ctrl+N/T/W`, `Ctrl+Shift+N/T/W`, `Ctrl+Tab`, `Ctrl+L`,
  `Ctrl+R`, `F5`, `F6`, `F10`, `Alt+letter`.

## Responsive behaviour

Breakpoints and the canvas minimum are in MASTER.md. When the window narrows, give up space in this order:

1. Status bar: hide zoom, selection, units.
2. Command bar: labels become icons with tooltips (Run keeps its label).
3. Side pane: overlays the canvas instead of docking.
4. Inspector: overlays the canvas instead of docking.
5. Results panel: starts collapsed.
6. Drawing name: the project path hides, then the name truncates with an ellipsis; full "Project / Drawing" in a
   tooltip. The lock chip shortens to a lock icon plus the holder's name, "Editing" or "Other tab" (full label in
   its tooltip and accessible name).

Never: controls clipped or pushed off-screen, wrapped tab labels, a canvas below its minimum while a pane is docked,
horizontal page scroll. Menus do not collapse.

## Accessibility

- Landmarks: one `header` holding the menu bar (`role="menubar"`) and the command bar (`role="toolbar"`) (menus `menu`, items `menuitem` / `menuitemcheckbox` /
  `menuitemradio`, arrow-key navigation); rail `nav` (`aria-label="Side panes"`, items `aria-pressed`); canvas
  `main`; inspector `aside` (`aria-label="Inspector"`); results panel `section` with a label; status bar `footer`,
  run result `role="status"`.
- Esc closes the top layer only: menu, then flyout, then overlay pane, then dialog. An overlay side pane also
  closes on a click outside it; a click on the canvas that closes it is consumed (Windows light dismiss), so it does
  not select or pan. An overlay inspector closes when the selection is cleared.
- Splitters are focusable `role="separator"` with `aria-valuenow`, arrow keys resize.

## Checklist for a new feature or a layout change

1. Classify it with the placement rule. Name the region in the brief.
2. A user action? Add a command to the command list and place it in a menu.
3. Follow the region's rules above (limits, order, no duplicates).
4. Style with MASTER.md tokens and classes; no new hex, px sizes or z-index numbers. Move static inline styles of
   any file you touch to classes.
5. Check every breakpoint in the responsive order above.
6. Update `components/modals/helpContent.jsx` if the user guide describes the moved or new control.
7. Tests per `walflow-qa`: query by role and accessible name, not by position or class, so a move does not break them.
8. Keep the docs true, in the same change: a new or changed region, menu, menu item, rail item, status slot,
   overlay corner or rule goes into this skill; a new or changed token, size, breakpoint or component spec goes
   into MASTER.md (then `index.css`). If unsure, ask the user.
9. Verify in the browser (below) and run the gate.

## Keeping this skill and MASTER.md true

| Guard | Keeps in sync |
|---|---|
| **Generated surfaces:** menus, command bar, context menus, shortcuts and the Help shortcut list are built from the command list, never written by hand | Menus and shortcuts vs. code |
| **Docs sync test in the gate** (`frontend/src/test/designDocs.test.js`): the `:root` tokens in MASTER.md and `index.css` match in name and value; the menu table in this skill lists exactly the commands in the command list, in the same menus | Tokens; this skill's menu table |
| **Checklist step 8** above, and the "Doc updates" line in the `walflow-frontend-dev` report, which the orchestrator applies before the change is done | Rules the tests cannot see |

When the docs sync test fails, fix the doc or the code so they agree; never loosen the test.

## Verification

- **Gate:** through `walflow-gate-runner` (`walflow-qa` skill).
- **Browser:** sign in with a test account (`walflow-test-users` skill). Load an example, run it, select a
  component. Check at 1920, 1440, 1280, 1024 and 768 px wide, at 900 and 720 px high, with the inspector and the
  results panel open. Repeat signed out, as `test_admin` (Tools › Admin hub) and as `test_bob` on a drawing locked
  by `test_alice` (read-only state).
- **Measure, don't eyeball:**
  `document.querySelector('.react-flow').getBoundingClientRect()` meets the canvas minimum when panes are docked;
  `document.documentElement.scrollWidth === innerWidth`; every control of the menu bar, command bar and status bar
  is inside the viewport.
- A full sweep uses the `ux-audit` skill.

## Delegation

| Step | Who |
|---|---|
| Find code across the shell | `walflow-scout` |
| Implement in `frontend/src/` | `walflow-frontend-dev`, briefed with the region and the checklist above |
| Update or add tests | `walflow-test-author` |
| Gate | `walflow-gate-runner` |
| Browser verification, decisions, CHANGELOG | orchestrator |
