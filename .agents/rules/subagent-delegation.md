# WalFlow Subagent Delegation Rule

When delegating tasks according to the Orchestrator Delegation Protocol in `AGENTS.md`:

1. **Subagent Definitions**:
   The specifications, operational rules, and output contracts for WalFlow subagents are located in `.claude/agents/`:
   | Agent | Job | Model tier (Claude name) | May write |
   |---|---|---|---|
   | `walflow-scout` | Read-only codebase scout across 3+ files | light (`haiku`) | nothing |
   | `walflow-gate-runner` | Runs the full gate or test/lint/build subsets | light (`haiku`) | nothing |
   | `walflow-physics-reviewer` | Reviews changes in `backend/simulation/` | mid (`sonnet`) | nothing |
   | `walflow-test-author` | Writes, updates or deletes tests | mid (`sonnet`) | `backend/tests/**`, `frontend/src/test/**`, `frontend/src/**/*.test.{js,jsx}` |
   | `walflow-frontend-dev` | Implements UI/UX in `frontend/src/` | mid (`sonnet`) | `frontend/src/**` except tests, `frontend/public/**` |

   In Claude Code, `.claude/hooks/scope-guard.mjs` enforces the "May write" column. Other harnesses do not run that
   hook: state the write scope in the brief, and check the subagent's changed files against it before accepting
   its report.

2. **Invocation Procedure**:
   - Before invoking a specialized subagent for the first time in a session, read its specification from `.claude/agents/<name>.md`.
   - Use `define_subagent` to register the subagent using the exact System Prompt, scope limits, and tool permissions specified in its definition file, on the model tier above.
   - Invoke the subagent using `invoke_subagent` with a self-contained brief (goal, target paths, acceptance criteria).
   - Trust the subagent report and follow the context firewall rules (condensed output, no raw log dumps).
