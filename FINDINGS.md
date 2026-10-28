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

### Critical

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| C1 | A new cloud drawing opens read-only, and the lock is lost silently on every reload. The read-only toast has no Check out action. | Open | fe | [useAutoSaveSession.js:250-276](frontend/src/hooks/useAutoSaveSession.js#L250-L276), [App.jsx:1307-1330](frontend/src/App.jsx#L1307-L1330) | Vitest case in `useAutoSaveSession.test.jsx`: when the lock status is free and the user is signed in, checkout is called. The server side is covered by `api/test_locks_and_lists.py`. |
| C2 | The console logs "WebSocket Error: Event" on every load (StrictMode cleanup while connecting). The React Flow nodeTypes warning has the same cause. | Open | fe | [useWebSocketSimulation.js:74-78](frontend/src/hooks/useWebSocketSimulation.js#L74-L78) | Gate. First check that the React Flow warning is absent in `npm run preview`, then allowlist it in an audit-config. |

### High

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| H1 | A failed solve shows a raw "math domain error" without naming a component. The banner's "Show" button selects nothing, and stale readouts stay on the canvas. | Review | orch + phys, fe | [solver.py:791-793](backend/simulation/solver.py#L791-L793), [RunBanners.jsx:62-65](frontend/src/components/overlays/RunBanners.jsx#L62-L65) | First decide on the message text. Then add a scenario case (boundary pressure above pump shut-off head) asserting that the error names the cause and holds no Python exception text, in `unit/solver/test_solver_methods.py` or `test_physical_validity.py`. Frontend: Gate. |
| H2 | Recharts warns "width(-1)/height(-1)" ×6 on the inspector Results charts. | Open | fe | ValveDetails.jsx:119, FilterDetails.jsx:71, PumpDetails.jsx:159, JunctionDetails.jsx:150 | Gate (console check in a re-audit). |
| H3 | axe-core reports Critical and Serious violations: Pipe Network List inputs and selects have no label, and palette/node cards have nested interactive elements. | Open | fe | [DataList.jsx:923, 1209, 1238, 1266](frontend/src/components/panels/DataList.jsx#L1209) | Gate. Extend `DataList.test.jsx` only if a shared `getByLabelText` check is cheap. |
| H4 | Layout collapses below 1280 px with the inspector and data panel open: top-bar actions are pushed off-screen, and at 500 px the canvas width is 0. | Open | fe | Navbar.jsx right action group, inspector width in App.jsx | Gate (re-audit at 1280/1024/768). |
| H5 | No m³/h or bar g: flow is fixed to L/min, and pressures mix bar(a) and bar g. | Review | fe | [UnitContext.jsx:117-123, 160-182](frontend/src/context/UnitContext.jsx#L117-L123), utils/converters | Decide the scope first (flow unit only, or also a gauge/absolute basis). Then add reference rows for the conversion in a converters test (m³/h ↔ L/min, round trip through `toDisplayValue`/`fromInputValue`). |
| H6 | After loading another drawing, the inspector still shows the previous drawing's selection. | Open | fe | [App.jsx:791-799](frontend/src/App.jsx#L791-L799) | Gate. The fix is two setState calls in App.jsx, which has no test harness. |

### Medium

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| M1 | A pump curve cannot be entered as several points (no table, no paste). | Review | orch + phys, fe | Pump model + `<pump>.md`, PumpInspector | Feature: add reference rows (fitted curve through the datasheet points) to `unit/equipment/test_<pump>.py`, keep the pump in `PUMP_DATA`, and add a Vitest case for the clipboard paste parser. |
| M2 | A case that was never run shows "Cavitation ✓ Normal", and the status pill is not tied to the active case. | Open | fe | Operating Cases Matrix in DataList.jsx, [App.jsx:386](frontend/src/App.jsx#L386) | Vitest case in `DataList.test.jsx`: a case without telemetry renders "—". |
| M3 | The case matrix cannot compare per-point values such as bearing header pressure or PCV opening. | Review | fe | DataList.jsx matrix, Measurements tab | Decide which values to show. Then add a Vitest case: a measurement row shows one value per case. |
| M4 | CSV export has no quoting and no BOM, and does not say which case the data belongs to. | Open | fe | [DataList.jsx:491-503](frontend/src/components/panels/DataList.jsx#L491-L503) | Vitest case (file export is in scope): a value with a comma or quote round-trips, the BOM is present, and the case name is in the file name. |
| M5 | Equipment search ignores tag abbreviations (PCV, TCV, PSV, PRV, FCV). | Open | fe | [Sidebar.jsx:1093-1095](frontend/src/components/panels/Sidebar.jsx#L1093-L1095) | Gate. |
| M6 | The canvas "Case manager" cannot add cases, and clicking a tab of the collapsed data panel does not expand it. | Open | fe | Case manager popover, data-panel tab handler | Gate. |

### Low

| ID | Finding | Status | Owner | Where | Test |
|---|---|---|---|---|---|
| L1 | A pasted component overlaps the original and is named "Filter 1_copy" instead of the next tag. | Open | fe | paste handler, `autoTag.js` | Gate. |
| L2 | The drop point is the node's top-left corner, not its centre. | Open | fe | canvas onDrop | Gate. |
| L3 | "Restored unsaved drawing" appears after a reload in which everything was saved. | Open | fe | useAutoSaveSession.js draft restore | Vitest case in `useAutoSaveSession.test.jsx`: a draft older than the server copy is not restored. |
| L4 | The first run does not point this persona to the API 614 example. | Review | fe | EmptyCanvasHint | Gate. |
| L5 | Port direction is shown by colour only. | Review | fe | node handles | Gate. |
| L6 | The "Load diagram?" confirm has no `role="dialog"`. | Open | fe | confirm renderer in `utils/dialogs` | Extend `DialogHost.test.jsx`: the confirm has role `alertdialog`. |

### Physics review (not UX findings)

| ID | Observation | Status | Owner | Test |
|---|---|---|---|---|
| P1 | Pressure Regulator 1 reported "wide open (100 %)" but carried 4.22 bar ΔP at 0.8 L/min, while the pump ran near shut-off. Check the regulator's default Cv and its wide-open ΔP. | Review | orch + phys | If wrong, add a reference row in `unit/equipment/test_<regulator>.py` (wide-open ΔP against the Cv formula). |
| P2 | Flow shown as 0.9 then 0.8 L/min across the cooler, at 1 decimal, reads to an engineer as a mass imbalance. Mass balance itself is covered by `test_network_invariants.py`. | Review | fe | Display only: 2 decimals below 10 L/min. Gate. |
