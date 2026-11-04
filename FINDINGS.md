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
| UX1 | High | Open | React Flow warns on every render that `nodeTypes` and `edgeTypes` are created anew | Define `nodeTypes` and `edgeTypes` outside the component scope or memoize with `useMemo` | fe | 1 | Systems-engineer UX audit 2026-11-03 |
| UX2 | High | Open | MenuBar brand button accessible name does not contain the visible text "v0.2.1 • Beta" (WCAG 2.5.3) | Include visible version string in `aria-label` or align label with visible text | fe | 1 | axe-core audit 2026-11-03 |
| UX3 | High | Open | WebSocket throws premature connection closure warning during React StrictMode mount | Guard initialization effect cleanup so socket handshake is not aborted in-flight on mount | fe | 1 | Systems-engineer UX audit 2026-11-03 |
| UX4 | High | Open | Menu keyboard shortcuts (`kbd`) and status timestamp have contrast below 4.5:1 | Adjust text color tokens from tertiary to secondary to meet WCAG AA | fe | 1 | axe-core audit 2026-11-03 |
| UX5 | Medium | Open | `NewDrawingModal` and `LoginModal` containers lack `role="dialog"` and `aria-modal="true"` | Add `role="dialog"` and `aria-modal="true"` to `.modal-container` in both modals | fe | 1 | Systems-engineer UX audit 2026-11-03 |
| UX6 | Medium | Open | `LoginModal` inputs trigger browser DOM autocomplete warning | Add `autoComplete="username"` and `autoComplete="current-password"` | fe | 1 | Systems-engineer UX audit 2026-11-03 |
| UX7 | Low | Open | Side pane categories jump heading levels (`h4` used without intermediate `h3`) | Standardize heading hierarchy to `h3` in sidebar group titles | fe | 2 | axe-core audit 2026-11-03 |

## Roadmap

| Phase | Entries | Why this order | Exit check |
|---|---|---|---|
| 1 | UX1, UX2, UX3, UX4, UX5, UX6 | Zero console warnings and zero axe-core Serious violations; quick wins with no risk to simulation physics or layout. | Gate green (`npm run lint && npm test && npm run build`); browser console clean on mount and during simulation run. |
| 2 | UX7 | Heading semantic polish across Activity Rail drawers. | Gate green; axe-core heading-order rule passes. |

Commit each phase only when the user asks.

## Details: Systems Engineer UX Audit 2026-11-03

Source: live browser walkthrough and axe-core audit using Puppeteer on Chrome (docs/audit/2026-11-03-systems-engineer/report.md).

| ID | Details | Where | Test |
|---|---|---|---|
| UX1 | Move `nodeTypes` and `edgeTypes` declarations out of the component body or wrap them in `useMemo`. Eliminates React Flow warning #002 and prevents re-mounting all canvas nodes on zoom/pan. | `frontend/src/App.jsx` | Gate (`npm run build`, `npm run lint`). |
| UX2 | `.menubar-brand` has visible text `v{APP_VERSION} • {RELEASE_STAGE}` but `aria-label="About WälFlow, version 0.2.1"`. Change `aria-label` to include the visible string so voice navigation works (`About WälFlow v0.2.1 • Beta`). | `frontend/src/components/layout/MenuBar.jsx` | `MenuBar.test.jsx`. |
| UX3 | In `useSimulationWebSocket`, connection initialization triggers `WebSocket is closed before the connection is established` during StrictMode mount. Check connection state before closing in cleanup. | `frontend/src/hooks/useSimulationWebSocket.js` | Component test or manual verification. |
| UX4 | Contrast on `.menu-item-shortcut kbd` and `.status-chip-time` falls below 4.5:1. Switch text token to `--color-text-secondary` to satisfy WCAG AA. | `frontend/src/components/layout/MenuBar.css`, `frontend/src/index.css` | Gate. |
| UX5 | `.modal-container` lacks `role="dialog"` and `aria-modal="true"`. Screen readers and automation harnesses cannot detect the dialog container. | `frontend/src/components/modals/NewDrawingModal.jsx`, `frontend/src/components/modals/LoginModal.jsx` | Vitest modal tests. |
| UX6 | Browser logs DOM warning: `Input elements should have autocomplete attributes`. Add `autoComplete="username"` and `autoComplete="current-password"` to form fields. | `frontend/src/components/modals/LoginModal.jsx` | Vitest modal tests. |
| UX7 | Category group headers in `Sidebar.jsx` render as `h4` while the parent container has no `h3`. Use `h3` for group headers. | `frontend/src/components/panels/Sidebar.jsx` | Gate. |

## Details: Layout review 2026-10-30

Source: user review of the new app shell before committing it (2026-10-30), with read-only scout audits of the
data list, canvas values, results views and catalogue. No published report. Line numbers are from the uncommitted
working tree of 2026-10-30; re-check them before editing.

Read before any change: `frontend/AGENTS.md`, `design-system/walflow/MASTER.md`, `.claude/skills/walflow-ui-layout/SKILL.md`,
`.claude/skills/ui-ux-pro-max/SKILL.md`, and `walflow-qa` for tests. Frontend code goes through `walflow-frontend-dev`,
tests through `walflow-test-author`, the gate through `walflow-gate-runner`.

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
| `ResultChart` | Every chart frame | Chart font sizes and colours from tokens (no `fontSize={10}`)|

- Every results view = a list of `ResultSection`s. Equipment-specific content (pump curves, PSV scale, mixing
  balance, port table) goes inside a section as its own child; it may have its own layout but uses the blocks for
  any label/value, badge or warning it shows.
- All numbers through `UnitContext` formatters or the shared dimensionless formatter; no `toFixed` in views.
- Equipment without a dedicated view gets the generic view, which is itself built from these blocks.
- The results panel tables (`DataList.jsx`) use the same value cell style; their table layout stays.
