# Findings

Open issues to implement or review. Each entry links to its source for reproduction steps, evidence and the
suggested patch. This list is temporary: delete an entry once its fix is committed (the commit and
`CHANGELOG.md` are the record).

Rules (from the `walflow-qa` skill):
- IDs below are for this list only. Never put them in code, test names, param ids or comments; describe the behaviour.
- Fix test-first where a test has value; the **Test** column follows the bug-fix decision tree
  (law → reference row → scenario → new test). "Gate" means lint/build is the check and no new test is added.
- Run the gate (`walflow-gate-runner`) before marking an entry fixed.

Status: `Open` (agreed, to implement) · `Review` (needs a decision or a physics check first) · `In progress` · `Fixed` (remove at commit)

Owner: `orch` (orchestrator: backend/simulation, API) · `fe` (`walflow-frontend-dev`) · `phys` (`walflow-physics-reviewer` after the change)

## Roadmap

Order: data safety first, then the lock model, then UI that builds on it; units before anything that displays
pressures in new places; layout last among UI work so it is tuned to the final navbar. One commit per phase, gate
before each commit.

| Phase | Entries | Why this order | Exit check |
|---|---|---|---|
| 1 Data safety (rest) | LK-H4 | The data-safety and lock-model fixes are done; this console warning is what is left of phase 1. Frontend only. | Gate. |
| 3 Lock clarity | LK-M1, LK-M2, LK-M3, LK-M4 | UI on top of the final lock states; the navbar chip changes the navbar width, which H4 depends on. | Re-audit of the lifecycle as `test_alice` and `test_bob` (`walflow-test-users` skill; two users, two tabs). |
| 4 Results panel (Batch C) | M2, M4, M6 | Independent DataList fixes; small. | Gate. |
| 5 Units | H5 | Cross-cutting (every pressure input and readout); must land before M3 adds per-case values. | Converter reference rows; gate. |
| 6 Solver feedback | H1, P1 | Backend solver messages + physics review; P1 is a check in the same area (regulator wide-open ΔP), fix only if wrong. | Scenario test; physics review; gate. |
| 7 Compare and onboarding | M3, L4 | M3 shows per-case values in the chosen units; L4 is a link. | Gate. |
| 8 Layout | H4 | Last UI change: responsive below 1280 px against the final navbar, inspector and data panel. | Re-audit at 1280 / 1024 / 768. |

Not scheduled: M1 (deferred to the product roadmap), L5 (rejected for now).

## Source: UX audit 2026-10-28, systems-engineer

Report: [docs/audit/2026-10-28-systems-engineer/report.md](docs/audit/2026-10-28-systems-engineer/report.md) · Verdict: FAIL (Critical 2, High 6, Medium 6, Low 6)

### High

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| H1 | A failed solve shows a raw "math domain error" without naming a component. The banner's "Show" button selects nothing, and stale readouts stay on the canvas. | Open | orch + phys, fe | [solver.py:791-793](backend/simulation/solver.py#L791-L793), [RunBanners.jsx:62-65](frontend/src/components/overlays/RunBanners.jsx#L62-L65) | Decided: two messages by failure kind (component outside its valid range / did not converge), each short and naming the largest-imbalance component from `bottleneck`; "Show" selects it; raw text behind Details; readouts blanked on failure. Then add a scenario case (boundary pressure above pump shut-off head) asserting that the error names the cause and holds no Python exception text, in `unit/solver/test_solver_methods.py` or `test_physical_validity.py`. Frontend: Gate. |
| H4 | Layout collapses below 1280 px with the inspector and data panel open: top-bar actions are pushed off-screen, and at 500 px the canvas width is 0. | Open | fe | Navbar.jsx right action group, inspector width in App.jsx | Gate (re-audit at 1280/1024/768). |
| H5 | No m³/h or bar g: flow is fixed to L/min, and pressures mix bar(a) and bar g. | Open | fe | [UnitContext.jsx:117-123, 160-182](frontend/src/context/UnitContext.jsx#L117-L123), utils/converters | Decided: flow unit (L/min, m³/h) and pressure basis (bar g / bar a, 1.01325 bar atm) in Global settings, applied to all pressure readouts and inputs; backend stays Pa(a). Add reference rows for the conversion in a converters test (m³/h ↔ L/min, round trip through `toDisplayValue`/`fromInputValue`). |

### Medium

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| M1 | A pump curve cannot be entered as several points (no table, no paste). | Deferred (roadmap) | orch + phys, fe | Pump model + `<pump>.md`, PumpInspector | Feature: add reference rows (fitted curve through the datasheet points) to `unit/equipment/test_<pump>.py`, keep the pump in `PUMP_DATA`, and add a Vitest case for the clipboard paste parser. |
| M2 | A case that was never run shows "Cavitation ✓ Normal", and the status pill is not tied to the active case. | Open | fe | Operating Cases Matrix in DataList.jsx, [App.jsx:386](frontend/src/App.jsx#L386) | Vitest case in `DataList.test.jsx`: a case without telemetry renders "—". |
| M3 | The case matrix cannot compare per-point values such as bearing header pressure or PCV opening. | Open | fe | DataList.jsx matrix, Measurements tab | Decided: compare per-case values in the Measurements tab (one value per case per instrument). Add a Vitest case: a measurement row shows one value per case. |
| M4 | CSV export has no quoting and no BOM, and does not say which case the data belongs to. | Open | fe | [DataList.jsx:491-503](frontend/src/components/panels/DataList.jsx#L491-L503) | Vitest case (file export is in scope): a value with a comma or quote round-trips, the BOM is present, and the case name is in the file name. |
| M6 | The canvas "Case manager" cannot add cases, and clicking a tab of the collapsed data panel does not expand it. | Open | fe | Case manager popover, data-panel tab handler | Gate. |

### Low

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| L4 | The first run does not point this persona to the API 614 example. | Open | fe | EmptyCanvasHint | Gate. |
| L5 | Port direction is shown by colour only. | Rejected (for now) | fe | node handles | Gate. |

## Source: UX audit 2026-10-29, drawing lifecycle and locks

Report: [docs/audit/2026-10-29-drawing-lifecycle/report.md](docs/audit/2026-10-29-drawing-lifecycle/report.md) · Verdict: FAIL (Critical 2, High 3 + console gate, Medium 4)

Agreed design: one checked-out drawing per user (and per tab); opening another drawing saves, then releases the previous lock; lock released after 30 min without activity or when the app is closed; automatic release only (no take-over for non-owners).

### High

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| LK-H4 | Console gate: React Flow warning #008 when a saved edge points to a missing handle (the expected 409 log and #002 are done; nodeTypes was already stable). Needs a shared handle-id helper per node type before load can drop or repair such edges. | Open | fe | edge load path, node handle ids (`BoundaryPorts`, `portLabels.js`) | Gate. |

### Medium

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| LK-M1 | Padlock states unreadable: a padlock on every free row; red/green only; on the active row every state is white. No always-visible lock status in the navbar. The active-drawing panel says "Locked by <you>" (another user) when your own other tab holds the lock. | Open | fe | [Sidebar.jsx:669-680](frontend/src/components/panels/Sidebar.jsx#L669-L680), Navbar | Decided: badge "Editing" (mine), lock + initials (other), nothing (free), own background; navbar chip "Editing" / "Read-only · {name} is editing since HH:MM". Gate. |
| LK-M2 | "Saved to cloud HH:MM" shows the previous drawing's time after opening or creating a drawing. | Open | fe | open path never sets `lastSavedTimestamp` from `updated_at` | Vitest: opening a drawing shows its `updated_at` time. |
| LK-M3 | Restore and conflict dialogs do not name the drawing (or who saved the cloud version). | Open | fe | [useAutoSaveSession.js:604-610](frontend/src/hooks/useAutoSaveSession.js#L604-L610), [App.jsx:943-948](frontend/src/App.jsx#L943-L948) | Gate. |
| LK-M4 | The active drawing can sit in a collapsed project folder; the selection highlight stays on the previous row. | Open | fe | Sidebar tree expand state | Gate. |

## Physics review (not UX findings)

| ID | Observation | Status | Owner | Test |
|---|---|---|---|---|
| P1 | Pressure Regulator 1 reported "wide open (100 %)" but carried 4.22 bar ΔP at 0.8 L/min, while the pump ran near shut-off. Check the regulator's default Cv and its wide-open ΔP. | Review | orch + phys | If wrong, add a reference row in `unit/equipment/test_<regulator>.py` (wide-open ΔP against the Cv formula). |
