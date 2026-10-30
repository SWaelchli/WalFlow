# UX Audit — Drawing lifecycle and locks — WalFlow v0.2.0 (local dev) — 2026-10-29

**Scope:** opening, closing, saving, check-out / check-in of cloud drawings, sidebar padlocks, read-only mode,
two sessions on one drawing. Baseline before the lock redesign (one checked-out drawing per user, 30 min idle
release).
**Persona (locked):** `systems-engineer` ([docs/personas/systems-engineer.md](../../personas/systems-engineer.md)),
working in a team that shares project drawings.
**Target:** http://localhost:5173 (Vite dev, StrictMode) + backend :8000, signed in as `admin`, Chrome via Claude in Chrome.
**Audit config:** none → every console error/warning counts.

```
═══════════════════════════════════════════════════════════
VERDICT: FAIL

Persona: systems-engineer (team member)
Surfaces audited: 1 route (single-page app) — Workspace sidebar, navbar save state, canvas, 3 dialogs
Interaction Manifest: complete for the scoped flows (typed ✓, create ✓, open/switch ✓, release/check out ✓,
                      reload ✓, dialog ✓, console + network after each action ✓)

Hard Gates: console errors [2: expected 409 logged as error], warnings [React Flow #002 ×6, #008 ×80+],
            network 5xx [0], 403/404 [0] (one 401 came from the audit's own fetch probe, excluded),
            layout-collapse [not in scope], axe Critical [0], axe Serious [0] (4 moderate/minor)
Performance: not in scope (measured 2026-10-28: LCP 1.02 s / CLS 0.006 / INP 464 ms)

Findings: Critical 2   High 3 (+ hard gate LK-H4)   Medium 4   Low 0

Self-critique pass (sub-agent): Drafted: 13  Kept: 9  Generic: 3  Duplicate: 1
  (LK-H4 kept as the hard-gate record only; LK-M5 merged into LK-C1/LK-H1; LK-L1, LK-L2 dropped as generic)

Time: walkthrough 10:02 → 10:18 local (≈ 16 min), 2 tabs
Manifest plausibility: 34 entries, median gap ≈ 20 s, 30 screenshots, 12 network reads, 4 console reads

TOP 5 (impact × ease):
  1. LK-C1 Edits lost on a quick switch — flush the pending save before opening another drawing; one await.
  2. LK-C2 "Load cloud version" overwrote the cloud — guard the boot draft check so it runs once.
  3. LK-H1 One user, many locks — the agreed one-lock-per-user rule fixes it at the server.
  4. LK-H2 Same user, two tabs, both "Checked out" — lock per session (tab), not per user.
  5. LK-M1 Padlock states — three distinct badges, readable on the active row.
═══════════════════════════════════════════════════════════
```

## Coverage and what was NOT run

- **Threads walked:** T1 open a drawing from the sidebar and switch to another; T2 create a drawing in a project;
  T3 edit then switch within 2 s; T4 two tabs on one drawing (edit in both, release in one, check out in the other);
  T5 close a tab and reload the other (draft restore + conflict dialog); T6 watch abandoned locks expire.
- **Not run:** a second *account* (two tabs of `admin` stand in for two sessions; the server treats them as one
  user, which is itself LK-H2). Idle timeout (does not exist yet). Multi-pane/responsive, perf, scenarios 6, 8, 9, 11.
- **Element coverage (Workspace tab):** row open (double-click), row select, padlock button, Release edit lock,
  Check out to edit, New → New drawing dialog (title, destination, project), folder expand/collapse,
  conflict dialog, restore dialog, collab notices (Reload / Dismiss). Delete not exercised.

## Interaction Manifest (local time)

```
[✓] 10:02 Opened app; Local draft active; Workspace tab: 7 standalone drawings, all with an open padlock
[✓] 10:02 Single click "Test Save" → row highlight only (no request)
[✓] 10:03 Double click "Test Save" → GET, lock-status, POST checkout 200; "Checked out"; no PUT on load
[✓] 10:04 Double click "Reducer Test" → checkout 200; NO checkin for Test Save (padlock stays green)
[✓] 10:04 Navbar shows "Saved to cloud 10:02:18" for Reducer Test (time of the boot draft, not the drawing)
[✓] 10:05 + New → typed "Audit Lock A", destination "Inside Existing Project Folder", project "Test Project";
          Create → POST 201, checkout 200; now 3 locks held; navbar still "Saved to cloud 10:02:18"
[✓] 10:05 Dragged Tank, switched to Test Save within 2 s → no PUT for Audit Lock A
[✓] 10:06 Reopened Audit Lock A → empty canvas
[✓] 10:06 Dragged Tank, waited 4 s → PUT 200 (the drag itself works)
[✓] 10:06 Dragged second Tank (screenshot shows 2 tanks), switched to Test Drawing 3 within 2 s →
          no PUT for Audit Lock A; PUT 200 for Test Drawing 3 right after it loaded
[✓] 10:07 Reopened Audit Lock A → 1 tank (second one lost); "Nothing to solve" warning toast on open
[✓] 10:14 New tab B → "Restore unsaved drawing?" for a draft from 10/28 2:19 PM (no drawing name); Restore
[✓] 10:15 Tab B: opened Audit Lock A while tab A holds it → "Checked out" in both tabs
[✓] 10:15 Tab B: added Tank 2 → PUT 200; tab A: notice "Another tab of yours saved changes…"
[✓] 10:16 Tab A: added a tank → PUT 409; notice "Not saved: this diagram was changed elsewhere…"
[✓] 10:16 Tab A: Release edit lock → tab A and tab B both "Available (read-only)"; tab A navbar
          "Saved in this browser" while its canvas differs from the cloud
[✓] 10:16 Tab B: Check out to edit → tab A also flips to "Checked out", retries save → 409, "Sync error"
[✓] 10:17 Closed tab B; tab A navigated away and back → "Newer cloud version" dialog (no drawing name)
[✓] 10:17 Clicked "Load cloud version" → toast "Restored unsaved drawing"; canvas = tab A's local layout;
          two GETs of the drawing at boot; then PUT 200 → local copy written over tab B's cloud save
[✓] 10:18 Workspace: Reducer Test / Test Save padlocks free again (abandoned ~13–15 min after checkout)
[✓] 10:18 axe-core on the page: 0 critical, 0 serious
[✓] 10:18 Console read: 2 errors (409), React Flow warnings
```

## Findings

### Critical

**LK-C1 — Edits made in the last ~2 s before switching drawings are lost without a warning**
- Layer: Feedback · Surface: Workspace sidebar, any cloud drawing · Persona: team engineer moving between two
  related drawings.
- Reproduce: 1) Open a cloud drawing you can edit. 2) Drag a component onto the canvas. 3) Within 2 s
  double-click another drawing in the Workspace list. 4) Reopen the first drawing.
- Observed: the component is gone. No PUT was sent for the first drawing (network log 10:06). No prompt.
- Expected: the pending change is saved before the drawing closes, or the switch waits for it.
- Suspected location: the 2000 ms cloud timer in [useAutoSaveSession.js:446-460](../../../frontend/src/hooks/useAutoSaveSession.js#L446-L460)
  is cleared when `activeDiagram` changes; the sidebar open handler does not flush first.
- Smallest patch: in the open-drawing path, `await triggerManualCloudSave()` for the current drawing (when it holds
  the lock and the content differs) before `setActiveDiagram(next)`; the same flush is needed before check-in in the
  one-lock-per-user design.

**LK-C2 — "Load cloud version" restored the local copy and saved it over the cloud**
- Layer: Architecture · Surface: boot after reload, conflict dialog · Persona: engineer whose colleague (here: a
  second tab) saved in the meantime.
- Reproduce: 1) Tab A and tab B on the same drawing. 2) Save a change in tab B. 3) Make a change in tab A (409,
  kept as local draft). 4) Close tab B, reload tab A. 5) In "Newer cloud version", click "Load cloud version".
- Observed: toast "Restored unsaved drawing"; canvas shows tab A's layout; two GETs of the drawing at boot; then
  PUT 200 — tab B's saved work is overwritten.
- Expected: the cloud version is shown and nothing is written.
- Suspected location: [App.jsx:936-985](../../../frontend/src/App.jsx#L936-L985) — the boot effect runs twice in
  StrictMode and both runs call `reconcileDraft`; one run can take the "restore" branch
  ([useAutoSaveSession.js:589-594](../../../frontend/src/hooks/useAutoSaveSession.js#L589-L594)) while the other shows the dialog. To
  confirm with a red test first (production builds do not double-run effects, but the race between two boot
  paths still needs a guard).
- Smallest patch: a `bootDraftHandledRef` so `applyDraft` runs once per page load; on conflict never take the
  restore branch without the user's choice.

### High

**LK-H1 — One user can hold many locks; opening another drawing does not release the previous one**
- Reproduce: open Test Save, then Reducer Test, then create Audit Lock A, then open Test Drawing 3.
- Observed: four green padlocks at once; Test Save and Reducer Test stay locked for ~13–15 min after you left them;
  the sidebar padlock can also check out a drawing you have not opened.
- Expected (agreed): one checked-out drawing per user; opening another saves and releases the previous one.
- Suspected location: lock effect [useAutoSaveSession.js:331-360](../../../frontend/src/hooks/useAutoSaveSession.js#L331-L360)
  (no check-in of the previous id), [Sidebar.jsx:952-988](../../../frontend/src/components/panels/Sidebar.jsx#L952-L988),
  [lock_service.py:168](../../../backend/services/lock_service.py#L168) (no per-user index).
- Smallest patch: server keeps `user → diagram_id`; `acquire_lock` releases the user's previous lock and broadcasts
  `lock_released`; client flushes the save first (LK-C1).

**LK-H2 — The same user in two tabs: both "Checked out", edits collide**
- Reproduce: see manifest 10:15–10:16.
- Observed: both tabs editable; the later save fails with 409 and is stranded in a local draft; after a check-out
  in tab B, tab A shows "Checked out" and "Sync error" together.
- Expected: one tab edits; the other is read-only with "Open in another tab — take over here".
- Suspected location: lock identity is `user_id` only ([lock_service.py:192](../../../backend/services/lock_service.py#L192),
  [lock_service.py:209](../../../backend/services/lock_service.py#L209)); `lock_acquired` handler treats any lock with the own
  user id as "mine".
- Smallest patch: add a per-tab `session_id` (already have the tab id used for drafts) to checkout and the lock
  record; "mine" means same user and same session.

**LK-H3 — Opening a drawing can change it on the server**
- Reproduce: open Test Drawing 3 (it has an edge to a missing handle `inlet-0`).
- Observed: PUT 200 right after load; React Flow warns "Couldn't create edge for target handle id inlet-0" ×80.
- Expected: opening never writes; a broken edge is reported, not silently dropped.
- Suspected location: load path → React Flow drops the invalid edge → content key differs from `markLoaded` → auto-save.
- Smallest patch: compare against the content after the canvas settled, or skip auto-save until the first user edit
  after load; report invalid edges in the model checks.

**LK-H4 — Hard gate: console errors and warnings**
- Observed: `Cloud auto-save failed: AxiosError 409` logged as `console.error` for an expected conflict
  ([useAutoSaveSession.js:461](../../../frontend/src/hooks/useAutoSaveSession.js#L461)); React Flow #002 (nodeTypes) and #008 (LK-H3).
- Smallest patch: log 409 at `info` level (it is handled with a notice); memoise `nodeTypes`.

### Medium

**LK-M1 — Padlock states are not readable**
- Observed: every free row shows an open padlock (noise); mine = green, other user = red; on the active row the icon
  is white for every state, so "mine" and "someone else's" look the same where it matters most. Colour only.
- Location: [Sidebar.jsx:669-680](../../../frontend/src/components/panels/Sidebar.jsx#L669-L680).
- Patch: three badges with their own background — "Editing" (mine), lock + initials (other), nothing (free);
  tooltip "Anna · since 10:42".

**LK-M2 — "Saved to cloud HH:MM" shows the previous drawing's time**
- Observed: Reducer Test and the new Audit Lock A both showed "Saved to cloud 10:02:18" (boot draft time).
- Location: `lastSavedTimestamp` is only set by saves ([useAutoSaveSession.js:459](../../../frontend/src/hooks/useAutoSaveSession.js#L459))
  and the boot draft check; the sidebar open path never sets it from the drawing's `updated_at`.
- Patch: set it from the drawing's `updated_at` when a drawing opens; clear it for a new drawing until the first save.

**LK-M3 — Restore and conflict dialogs do not name the drawing**
- Observed: "An unsaved drawing from 10/28/2026, 2:19:14 PM was found…"; "This drawing was saved elsewhere…".
- Location: [useAutoSaveSession.js:604-610](../../../frontend/src/hooks/useAutoSaveSession.js#L604-L610), [App.jsx:943-948](../../../frontend/src/App.jsx#L943-L948).
- Patch: include the title and project ("Audit Lock A · Test Project") and who saved the cloud version and when.

**LK-M4 — The active drawing is not visible in the list**
- Observed: after creating or opening a drawing in a project, the folder stays collapsed; the previous row keeps
  the selection highlight.
- Location: Sidebar tree expand state.
- Patch: expand the active drawing's folder and scroll it into view; selection follows the active drawing.

*Merged into LK-C1 / LK-H1 by the self-critique:* after a release, the canvas can still show edits the cloud does
not have ("Available (read-only)" + "Saved in this browser"); the flush-then-release flow fixes it. Dropped as
generic: "Nothing to solve" toast on opening an empty drawing; double-click selects the row text.

## Perfection Roadmap

- **Quick wins:** LK-H4 (log level), LK-M2 (timestamp), LK-M3 (names in dialogs).
- **Structural (the lock redesign):** LK-C1 flush-before-switch, LK-H1 one lock per user (server), LK-H2 per-tab
  session, 30 min idle release, LK-M1 padlock badges + navbar status chip, LK-M4.
- **Separate fixes:** LK-C2 (boot guard, red test first), LK-H3 (no write on open).

## Hold this in your hands

Opening and saving feel smooth until two things happen at once, and in a team they always do. The app is honest
when it detects a conflict, and the stale-save check caught every collision in this run. But the moment of
switching drawings is fragile (the last edit can vanish), the lock is tied to a person rather than a window, and the
padlock column says almost nothing at a glance. The redesign you agreed (one drawing per user, idle release, a clear
status chip) addresses the structure; LK-C1 and LK-C2 must be fixed with it, or the new rule will release locks
on drawings whose last changes never reached the server.
