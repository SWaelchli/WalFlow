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
| LK-H4 | High | Open | React Flow warning #008 when a saved edge points to a missing handle. | Shared handle-id helper per node type, so load can drop or repair such edges. | fe | 1 | Lock audit 2026-10-29 |
| M2 | Medium | Open | A never-run case shows "Cavitation ✓ Normal"; the status pill is not tied to the active case. | Show "—" for cases without telemetry and tie the pill to the active case. | fe | 4 | UX audit 2026-10-28 |
| M4 | Medium | Open | CSV export has no quoting, no BOM, and does not name the case. | Quote values, add a BOM, put the case name in the file name. | fe | 4 | UX audit 2026-10-28 |
| M6 | Medium | Open | The canvas "Case manager" cannot add cases; a tab of the collapsed data panel does not expand it. | Add "add case" to the popover; a tab click expands the panel. | fe | 4 | UX audit 2026-10-28 |
| H5 | High | Open | No m³/h or bar g: flow is fixed to L/min, and pressures mix bar(a) and bar g. | Decided: flow unit and pressure basis in Global settings, applied to all readouts and inputs; backend stays Pa(a). | fe | 5 | UX audit 2026-10-28 |
| H1 | High | Open | A failed solve shows a raw "math domain error" naming no component; "Show" selects nothing; stale readouts stay. | Decided: two messages by failure kind naming the largest-imbalance component; "Show" selects it; readouts blanked. | orch + phys, fe | 6 | UX audit 2026-10-28 |
| P1 | — | Review | A regulator reported "wide open (100 %)" while carrying 4.22 bar ΔP at 0.8 L/min. | Check the regulator's default Cv and wide-open ΔP; fix only if wrong. | orch + phys | 6 | Physics review |
| M3 | Medium | Open | The case matrix cannot compare per-point values such as header pressure or PCV opening. | Decided: per-case values in the Measurements tab (one value per case per instrument). | fe | 7 | UX audit 2026-10-28 |
| L4 | Low | Open | The first run does not point this persona to the API 614 example. | Link the API 614 example from the empty-canvas hint. | fe | 7 | UX audit 2026-10-28 |
| H4 | High | Open | Layout collapses below 1280 px with inspector and data panel open; at 500 px the canvas width is 0. | Responsive navbar actions and inspector width, tuned to the final navbar. | fe | 8 | UX audit 2026-10-28 |
| LK-L1 | Low | Open | The navbar is crowded: with the lock chip shown, the run status touches the Catalogue button. | Solve in the full layout review (phase 8). | fe | 8 | Lock re-check 2026-10-30 |
| M1 | Medium | Deferred | A pump curve cannot be entered as several points (no table, no paste). | Point table with clipboard paste and a fitted curve (product roadmap). | orch + phys, fe | — | UX audit 2026-10-28 |
| L5 | Low | Rejected | Port direction is shown by colour only. | — (rejected for now). | fe | — | UX audit 2026-10-28 |

## Roadmap

Order: data safety first, then the lock model, then UI that builds on it; units before anything that displays
pressures in new places; layout last among UI work so it is tuned to the final navbar. One commit per phase, gate
before each commit.

| Phase | Entries | Why this order | Exit check |
|---|---|---|---|
| 1 Data safety (rest) | LK-H4 | The data-safety and lock-model fixes are done; this console warning is what is left of phase 1. Frontend only. | Gate. |
| 4 Results panel (Batch C) | M2, M4, M6 | Independent DataList fixes; small. | Gate. |
| 5 Units | H5 | Cross-cutting (every pressure input and readout); must land before M3 adds per-case values. | Converter reference rows; gate. |
| 6 Solver feedback | H1, P1 | Backend solver messages + physics review; P1 is a check in the same area (regulator wide-open ΔP), fix only if wrong. | Scenario test; physics review; gate. |
| 7 Compare and onboarding | M3, L4 | M3 shows per-case values in the chosen units; L4 is a link. | Gate. |
| 8 Layout | H4, LK-L1 | Last UI change. **Before starting, remind the user to run a full layout review first**: compare the current layout with industry-standard layouts of Windows desktop apps and similar engineering/diagram tools, then redo the layout to match them with no change in functionality, as a future-proof concept. H4 and LK-L1 are solved inside that redesign. | Layout review agreed with the user; re-audit at 1920 / 1440 / 1280 / 1024 / 768. |

## Details: UX audit 2026-10-28, systems-engineer

Report: [docs/audit/2026-10-28-systems-engineer/report.md](docs/audit/2026-10-28-systems-engineer/report.md) · Verdict: FAIL (Critical 2, High 6, Medium 6, Low 6)

| ID | Details | Where | Test |
|---|---|---|---|
| H1 | Decided: two messages by failure kind (component outside its valid range / did not converge), each short and naming the largest-imbalance component from `bottleneck`; "Show" selects it; raw text behind Details; readouts blanked on failure. | [solver.py:791-793](backend/simulation/solver.py#L791-L793), [RunBanners.jsx:62-65](frontend/src/components/overlays/RunBanners.jsx#L62-L65) | Scenario case (boundary pressure above pump shut-off head) asserting that the error names the cause and holds no Python exception text, in `unit/solver/test_solver_methods.py` or `test_physical_validity.py`. Frontend: Gate. |
| H4 | Top-bar actions are pushed off-screen below 1280 px with the inspector and data panel open. | Navbar.jsx right action group, inspector width in App.jsx | Gate (re-audit at 1280/1024/768). |
| H5 | Decided: flow unit (L/min, m³/h) and pressure basis (bar g / bar a, 1.01325 bar atm) in Global settings, applied to all pressure readouts and inputs; backend stays Pa(a). | [UnitContext.jsx:117-123, 160-182](frontend/src/context/UnitContext.jsx#L117-L123), utils/converters | Reference rows in a converters test (m³/h ↔ L/min, round trip through `toDisplayValue`/`fromInputValue`). |
| M1 | Deferred to the product roadmap. | Pump model + `<pump>.md`, PumpInspector | Feature: reference rows (fitted curve through the datasheet points) in `unit/equipment/test_<pump>.py`, keep the pump in `PUMP_DATA`, Vitest case for the clipboard paste parser. |
| M2 | | Operating Cases Matrix in DataList.jsx, [App.jsx:386](frontend/src/App.jsx#L386) | Vitest case in `DataList.test.jsx`: a case without telemetry renders "—". |
| M3 | Decided: compare per-case values in the Measurements tab (one value per case per instrument). | DataList.jsx matrix, Measurements tab | Vitest case: a measurement row shows one value per case. |
| M4 | | [DataList.jsx:491-503](frontend/src/components/panels/DataList.jsx#L491-L503) | Vitest case (file export is in scope): a value with a comma or quote round-trips, the BOM is present, and the case name is in the file name. |
| M6 | | Case manager popover, data-panel tab handler | Gate. |
| L4 | | EmptyCanvasHint | Gate. |
| L5 | Rejected for now. | node handles | Gate. |

## Details: UX audit 2026-10-29, drawing lifecycle and locks

Report: [docs/audit/2026-10-29-drawing-lifecycle/report.md](docs/audit/2026-10-29-drawing-lifecycle/report.md) · Verdict: FAIL (Critical 2, High 3 + console gate, Medium 4)

Agreed design: one checked-out drawing per user (and per tab); opening another drawing saves, then releases the previous lock; lock released after 30 min without activity or when the app is closed; automatic release only (no take-over for non-owners).

| ID | Details | Where | Test |
|---|---|---|---|
| LK-H4 | Console gate. The expected 409 log and #002 are done; nodeTypes was already stable. Load needs a shared handle-id helper per node type before it can drop or repair edges to missing handles. | edge load path, node handle ids (`BoundaryPorts`, `portLabels.js`) | Gate. |
| LK-L1 | Seen at 1568 px wide in the browser re-check of phase 3: the lock chip after the drawing name pushes "Not run yet" against "Catalogue". | Navbar.jsx centre and right groups | Gate (layout re-audit). |

## Details: physics review

| ID | Details | Where | Test |
|---|---|---|---|
| P1 | Pressure Regulator 1 reported "wide open (100 %)" but carried 4.22 bar ΔP at 0.8 L/min, while the pump ran near shut-off. Check the regulator's default Cv and its wide-open ΔP. | Regulator model + its `.md` | If wrong, add a reference row in `unit/equipment/test_<regulator>.py` (wide-open ΔP against the Cv formula). |
