# UX audit in WalFlow (read first)

This skill is generic. In the WalFlow repo the rules below **override** `SKILL.md` and every other reference file.
Where a reference file assumes another stack, tool or platform, skip that part.

## App and platform

- WalFlow is a desktop web app: a steady-state hydraulic simulator (P&ID canvas, inspector, results panel). Mouse
  and keyboard only. Full editing from 1008 px wide, overlays down to 768 px (`design-system/walflow/MASTER.md`).
- Viewport matrix: 1920 / 1440 / 1280 / 1024 / 768 wide, at 900 and 720 high (the `walflow-ui-layout` checklist).
  **Skip** 375 px, touch, tap-target size, swipe and every "Mobile & Touch" check.
- The design rules to judge against are `design-system/walflow/MASTER.md` (look) and the `walflow-ui-layout` skill
  (placement). A deviation from them is a finding; a generic "AI tell" that MASTER.md allows is not.
- Physics is steady state. A finding never asks for time-dependent behaviour (filling over time, ramps, transients).

## Running it

- **URL:** local dev, `http://localhost:5173` (backend on port 8000; start commands in `AGENTS.md`). Second user:
  `http://[::1]:5173`. No `lsof`; there is no deployed URL to prefer.
- **Browser:** Claude in Chrome (`mcp__claude-in-chrome__*`) only. No Playwright MCP, no headless
  `/api/test-auth/*` (that endpoint does not exist). If Chrome is not connected, stop and ask.
- **Accounts:** the `walflow-test-users` skill. Sign out first, use `test_alice` (`test_admin` for admin pages,
  `test_bob` as second user), work in the project "WalFlow Test Team", and tell the user at the end that they were
  signed out.
- **No browser dialogs.** Never trigger `alert`, `confirm` or `prompt`; they freeze the browser extension. Replace
  the `<script>alert(1)</script>` canary with `<img src=x onerror="console.log('xss-canary')">` and check the
  console for `xss-canary` instead. Before clicking a control that may open a native confirm dialog, say so.
- **Files:** temporary files (cookie jars, scripts, raw captures) go in the session scratchpad, never `/tmp`.
  Image tools: no `sips`; use the screenshot tool's own sizing.
- **axe-core** is loaded from a CDN. If the corporate network blocks it, record the a11y gate as "not run" with the
  reason; do not mark it green.

## Gates and thresholds (one value each)

| Gate | WalFlow value |
|---|---|
| Console errors | 0 |
| Console warnings | 0, except the accepted list below |
| axe Critical / Serious per page | 0 / 0 |
| Pointer target size | not checked (desktop); clickable icons follow MASTER.md sizes |
| LCP / CLS / INP | < 4.0 s / ≤ 0.25 / < 500 ms, on the canvas with a shipped example loaded |
| Phase 3 duration for an exhaustive audit | ≥ 5 min (shorter = Incomplete) |

**Accepted console noise** (keep it in the manifest, do not report it):

- React Flow warning `#002` ("It looks like you've created a new nodeTypes or edgeTypes object"), twice on mount in
  dev. It is a React StrictMode false positive.

## Scenarios

- Scenario 8 (second user) and lock checks: `test_alice` and `test_bob` on the two hosts.
- Scenario 11 (Data Seasoning): run only the parts that apply: drawing lists sorted by date and the
  "last modified" labels. There is no chat, feed or notification history.
- Heavy data: a drawing with 200+ components and the Drawings pane with 100+ drawings; there is no seed script for
  that, so build it with the app or a copy of a shipped example, inside "WalFlow Test Team".

## Output

- Report: `docs/audit/YYYY-MM-DD-<persona-slug>/report.md` with `screenshots/` beside it (singular "audit", not the plural the generic files use).
- Personas: `docs/personas/<slug>.md`.
- Findings for follow-up go to `FINDINGS.md` in the repo root, layout and ID prefix (`U-`) per the `walflow-qa`
  skill, "Findings list". The report keeps its own finding numbers; `FINDINGS.md` IDs never go into code or tests.

## No fixing during the audit (replaces Phase 7)

The audit reports; it does not patch. `AGENTS.md` requires confirmed requirements before any code change, and
frontend changes go to `walflow-frontend-dev`. After the verdict:

1. Offer to add the Critical and High findings (and any others the user picks) to `FINDINGS.md`.
2. Fixes are a separate task after the user confirms them, following the delegation protocol and the
   `walflow-qa` bug-fix decision tree.
3. A re-walk of a fixed slice is a short follow-up audit that links the original report.

## Not used in WalFlow

- Playwright killer-flow tests and "run on every deploy via CI": WalFlow has no end-to-end or browser tests
  (`walflow-qa`), and CI runs only on release tags. Turn a regression worth guarding into a Vitest or pytest case
  through `walflow-test-author` instead.
- `.jez/` paths, `pnpm`, `dev-tools:brains-trust`, `wrangler`, better-auth, TanStack Query, Next.js and the other
  stack examples in `project-adaptation.md` and `live-interaction-smoke.md`.
