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
| EX1 | Medium | Open | The example drawings are not neat: readouts and badges run into symbols, signal lines cross text, pipes bend or cross where they need not. | Some equipment names are meaningless, such as `TANK_985_copy_copy_copy` in the Large Reference Network. Decided: re-lay out and rename across all 13 examples to the rules in the details below, without changing any parameter or result. | orch, fe | 5 | User request 2026-11-02 |
| EX2 | Low | Open | An example loaded after another one keeps the previous zoom and pan, so it can open cut off until fit-view is pressed. | Decided: fit the view when a drawing is opened. | fe | 5 | Browser check 2026-11-02 |
| EX3 | — | Open | Nothing keeps future examples neat. | Decided: the layout and naming rules go in the `walflow-ui-layout` skill, and `equipment-creation` points to them for its example. | orch | 5 | User request 2026-11-02 |

## Roadmap

| Phase | Entries | Why this order | Exit check |
|---|---|---|---|
| 5 | EX1, EX2, EX3 | Last step before the v0.2.0 release. Starts only when every other finding is closed and every other branch is on main, because symbol sizes and node footers set the layout. | Gate green with `golden_examples.json` unchanged; browser check of all 13 examples against the layout and naming rules; user sign-off of each drawing. |

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
   panel open, readouts included. Decided 2026-11-02: the fit zoom floor drops to about 0.2 so every drawing fits;
   drawings of up to about 20 items aim for zoom 0.7 or higher; LOS, Large Reference and Jeppson 48 are overviews
   read by zooming in.

Naming rule: every equipment and pipe name is meaningful and says what the item is or does in that process, for example
"Cooling Water Tank" or "Pump A Discharge". No copy suffixes and no generated names: the Large Reference Network has
`TANK_985_copy_copy_copy_copy_copy` and `BRANCH_770_copy_copy`. Names are unique within a drawing. A benchmark that
follows a published figure keeps that figure's numbering. Decided 2026-11-02: Jeppson 48 adds the junction number where
names repeat (`N13 Demand 2 cfs`, `N13 Demand link`) and keeps `P1` to `P48`.

App change decided 2026-11-02, outside the data-only limits below: on a node rotated 90° or 270° the readout sits beside
the symbol, so vertical runs do not pass through their own text.

Limits: only names (labels), node positions, rotation, note position and size, and edge handles may change. Parameters,
pipe lengths, connections and internal IDs stay as they are, so the results stay the same. A benchmark that follows a
published figure keeps that figure's arrangement.

Progress 2026-11-02: the fit on opening (EX2) and the readout beside rotated symbols are built. Welcome canvas and API 614
LOS are re-laid out and signed off. Next is API 682 seal flush, then the rest of the order in EX1. Still to do at the
end: tests for the fit and readout helpers, EX3, and a final browser check of all 13.

Notes for the remaining drawings: the app reads a pipe's name from `data.label` when a drawing loads, so a rename writes
both `label` and `data.label`. Junction port handles may be swapped to get a straight run or avoid a crossing. Signal
lines are drawn as curves, so check them against symbols as well as text. The Large Reference names go to the user as a
list first, because they infer what each item does.

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

