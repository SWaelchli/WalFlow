# Findings

Open issues to implement or review. This list is temporary: delete a finding's overview row and detail row in the
same change that commits its fix (the commit and `CHANGELOG.md` are the record). Layout and rules: `walflow-qa`
skill, "Findings list".

- IDs are for this list only. Never put them in code, test names, param ids or comments; describe the behaviour.
- Fix test-first where a test has value; the **Test** column follows the bug-fix decision tree
  (law → reference row → scenario → new test). "Gate" means lint/build is the check and no new test is added.
- Run the gate (`walflow-gate-runner`) before marking a finding fixed.

Status: `Open` (agreed, to implement) · `Review` (needs a decision or a physics check first) · `In progress` · `Fixed` (remove at commit) · `Deferred` · `Rejected`

Owner: `orch` (orchestrator: backend/simulation, API, docs) · `fe` (`walflow-frontend-dev`) · `test` (`walflow-test-author`) · `phys` (`walflow-physics-reviewer` after the change)

ID prefixes: `D-` standard deviation · `U-` UX audit · `R-` physics review · `S-` solver failure on a generated network · `F-` other

## Overview

The only place that holds the status.

| ID | Severity | Status | Finding | Proposed solution | Owner | Phase | Source |
|---|---|---|---|---|---|---|---|
| D-01 | Medium | Open | The rupture disc bursts on inlet gauge pressure, not on the inlet − outlet differential of ISO 4126-2 §3.10, so against a pressurised outlet it bursts early and under-predicts the protected side's peak pressure. | Decided: burst on $P_{\text{in}} - P_{\text{out}}$ (override the disc's opening driver, as the conventional PSV already does); check `rated_flow` and `inlet_opening_pressure_pa`; then set RD-01 and RLF-03 (burst-pressure part) to ✅ in the register and the equipment docs. | orch + phys, test | — | Standard verification ISO 4126-2:2018, 2026-11-24 |
| D-02 | Low | Review | The safety valve's blowdown input accepts 0-50 % with no warning; ISO 4126-1 §7.2.1 d) limits it for liquids to 2.5 % minimum and 20 % or 0.6 bar maximum, whichever is greater. | Warn (do not clamp) when the blowdown is outside the ISO liquid range for the valve's set pressure; use the liquid limits only, as the app has only liquids. Decide whether the 50 % clamp stays, since ISO allows more than 50 % below 1.2 bar(g). | orch, test | — | Standard verification ISO 4126-1:2013, 2026-11-24 |

## Roadmap

| Phase | Entries | Why this order | Exit check |
|---|---|---|---|

Commit each phase only when the user asks.

## Details

| ID | Details | Where | Test |
|---|---|---|---|
| D-01 | ISO 4126-2:2018 §3.1 (device responds to differential pressure) and §3.10 (burst pressure = differential between inlet and outlet side); ISO 4126-6:2014 §3.21, §6.1.2 (pressure on both sides must be considered). Expected: 10 bar(g) disc, outlet at 3 bar(g): burst at $P_{\text{in}}$ = 13 bar(g); the model bursts at 10 bar(g). Same result for an atmospheric outlet. A fix also needs a look at `rated_flow` and `inlet_opening_pressure_pa`, which use the gauge set pressure. Second opinion `walflow-physics-reviewer`: agreed, not a documented simplification. **After the fix, update the standards register:** (1) `docs/STANDARDS_REGISTER.md` Part B: RD-01 and RLF-03 from ⚠️ to ✅ (RLF-03 keeps 🚩 for the unread ASME part) and drop the "RD-01 stays ⚠️" / "burst on inlet gauge pressure" wording in their notes; add a Part C log row for the fix; (2) section 2 status cells in `rupture_disc.md` (RD-01) and `relief_device.md` (RLF-03): replace the ⚠️ text with ✅ and the clauses (ISO 4126-2 §3.10, ISO 4126-6 §3.21). | `relief_device.py` `driver_pa`, `opening_margin_pa`, `inlet_opening_pressure_pa`, `rated_flow`; `rupture_disc.py` `update_relief_state`; docs `rupture_disc.md` §3.1, `relief_device.md` §3 | Reference row: disc into a pressurised outlet bursts at set + outlet gauge pressure (`test_rupture_disc.py`) |
| D-02 | ISO 4126-1:2013 + Amd 1:2016 §3.15 (blowdown in % of set; in bar below 3 bar) and §7.2.1 d). Incompressible fluids: at least 2.5 % (does not apply to proportional-opening valves) and at most 20 % or 0.6 bar, whichever is greater. The limits for compressible fluids (2.0 %, 15 % or 0.3 bar) are not needed: the app has only liquids so far. The upper limit as a percentage is $\max(20\,\%,\ 0.6\ \text{bar}/P_{\text{set,g}})$: 20 % at or above 3 bar(g), 60 % at 1 bar(g). The default of 7 % is inside the range. The definition (reseat = set·(1 − blowdown)) is verified (PSV-03 ✅); this is an input-check finding, not a physics deviation. Modulating valves have no blowdown and are not affected. | `pressure_safety_valve.py` `__init__` (clamp 0-50), `reseat_threshold_pa`; input warnings where the other equipment warnings are issued; doc `pressure_safety_valve.md` §5 and the note under the table | Reference row: blowdown 1 % and 25 % at 10 bar(g) warn; 7 % does not; 40 % at 1 bar(g) does not (`test_pressure_safety_valve.py`) |
