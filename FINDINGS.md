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
| L4 | Low | Open | The first run does not point a new user to the example drawings. | Decided: point to the examples in general from the empty-canvas hint. | fe | 7 | UX audit 2026-10-28 |
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
| 7 Onboarding | L4 | L4 is a link to the examples. | Gate. |
| 8 Layout | H4, LK-L1 | Last UI change. **Before starting, remind the user to run a full layout review first**: compare the current layout with industry-standard layouts of Windows desktop apps and similar engineering/diagram tools, then redo the layout to match them with no change in functionality, as a future-proof concept. H4 and LK-L1 are solved inside that redesign. | Layout review agreed with the user; re-audit at 1920 / 1440 / 1280 / 1024 / 768. |

## Details: UX audit 2026-10-28, systems-engineer

Report: [docs/audit/2026-10-28-systems-engineer/report.md](docs/audit/2026-10-28-systems-engineer/report.md) · Verdict: FAIL (Critical 2, High 6, Medium 6, Low 6)

| ID | Details | Where | Test |
|---|---|---|---|
| H4 | Top-bar actions are pushed off-screen below 1280 px with the inspector and data panel open. | Navbar.jsx right action group, inspector width in App.jsx | Gate (re-audit at 1280/1024/768). |
| M1 | Deferred to the product roadmap. | Pump model + `<pump>.md`, PumpInspector | Feature: reference rows (fitted curve through the datasheet points) in `unit/equipment/test_<pump>.py`, keep the pump in `PUMP_DATA`, Vitest case for the clipboard paste parser. |
| L4 | Link the examples in general, not one specific example. | EmptyCanvasHint | Gate. |
| L5 | Rejected for now. | node handles | Gate. |

## Details: UX audit 2026-10-29, drawing lifecycle and locks

Report: [docs/audit/2026-10-29-drawing-lifecycle/report.md](docs/audit/2026-10-29-drawing-lifecycle/report.md) · Verdict: FAIL (Critical 2, High 3 + console gate, Medium 4)

Agreed design: one checked-out drawing per user (and per tab); opening another drawing saves, then releases the previous lock; lock released after 30 min without activity or when the app is closed; automatic release only (no take-over for non-owners).

| ID | Details | Where | Test |
|---|---|---|---|
| LK-L1 | Seen at 1568 px wide in the browser re-check of phase 3: the lock chip after the drawing name pushes "Not run yet" against "Catalogue". | Navbar.jsx centre and right groups | Gate (layout re-audit). |
