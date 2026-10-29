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

### Physics review (not UX findings)

| ID | Observation | Status | Owner | Test |
|---|---|---|---|---|
| P1 | Pressure Regulator 1 reported "wide open (100 %)" but carried 4.22 bar ΔP at 0.8 L/min, while the pump ran near shut-off. Check the regulator's default Cv and its wide-open ΔP. | Review | orch + phys | If wrong, add a reference row in `unit/equipment/test_<regulator>.py` (wide-open ΔP against the Cv formula). |
