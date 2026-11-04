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
| UX1 | Low | Rejected | React Flow warns twice on mount in dev that `nodeTypes` and `edgeTypes` are created anew, although both are module constants: StrictMode runs its check twice | Accepted by the user as a dev-only false positive; no code change | fe | — | Systems-engineer UX audit 2026-11-03 |
| PF1 | Medium | Review | `build_network` runs on the WebSocket event loop, outside the solve slot and deadline, so a large diagram delays lock and collaboration frames for every connected user | Measure the blocking time at the node limit; if it matters, run it with `asyncio.to_thread` after checking the parser is thread-safe | orch | 1 | Code review 2026-11-04 |
| KP1 | Medium | Review | The `total_flow_lmin` KPI adds the flow of every pump, so two pumps in series carrying 500 L/min report 1000 L/min in the case comparison | Decide what "total flow" means (for example flow leaving the sources), then change the sum | orch + phys | 1 | Code review 2026-11-04 |

## Roadmap

| Phase | Entries | Why this order | Exit check |
|---|---|---|---|
| 1 | PF1, KP1 | Both need a measurement or a decision before any code changes. | Gate green; physics review for KP1; PF1 measured per `walflow-performance`. |

Commit each phase only when the user asks.

## Details: Systems Engineer UX Audit 2026-11-03

Source: live browser walkthrough and axe-core audit using Puppeteer on Chrome (docs/audit/2026-11-03-systems-engineer/report.md).

| ID | Details | Where | Test |
|---|---|---|---|
| UX1 | `nodeTypes` and `edgeTypes` are already module constants, so nothing re-mounts. React Flow 11 compares type keys inside a `useMemo`, and StrictMode runs that twice on mount, so warning #002 fires once for each. Development builds only. | `frontend/src/App.jsx`, `frontend/src/main.jsx` | Gate. |

## Details: Code review 2026-11-04

Source: code review of `v0.2.0..HEAD` (2026-11-04). No published report.

| ID | Details | Where | Test |
|---|---|---|---|
| PF1 | The frontend sends `update_graph` 250 ms after edits and anonymous sockets are allowed by default. HTTP `/batch` parses inside `solve_slot` and `solve_deadline`; the WebSocket does not. Existing behaviour, not caused by the move to the service. | `backend/routers/ws_simulation.py`, `backend/services/simulation_service.py` | Measurement first; test decided with the fix. |
| KP1 | The same sum also adds pumps on separate islands and recirculation loops. Existing behaviour, moved unchanged to the service. Shown in `DataList.jsx`. | `backend/services/simulation_service.py` (`calculate_case_kpis`) | Reference-table row with series and parallel pumps. |

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
