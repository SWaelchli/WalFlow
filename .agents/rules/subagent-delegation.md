# WalFlow Subagent Delegation Rule

When delegating tasks according to the Orchestrator Delegation Protocol in `AGENTS.md`:

1. **Subagent Definitions**:
   The specifications, operational rules, and output contracts for WalFlow subagents are located in `.claude/agents/`:
   - `walflow-scout.md`: Read-only codebase scout across 3+ files.
   - `walflow-gate-runner.md`: Runs the full gate or test/lint/build subsets.
   - `walflow-test-author.md`: Writes, updates, or deletes tests.
   - `walflow-frontend-dev.md`: Implements UI/UX in `frontend/src/`.
   - `walflow-physics-reviewer.md`: Reviews changes in `backend/simulation/`.

2. **Invocation Procedure**:
   - Before invoking a specialized subagent for the first time in a session, read its specification from `.claude/agents/<name>.md`.
   - Use `define_subagent` to register the subagent using the exact System Prompt, scope limits, and tool permissions specified in its definition file.
   - Invoke the subagent using `invoke_subagent` with a self-contained brief (goal, target paths, acceptance criteria).
   - Trust the subagent report and follow the context firewall rules (condensed output, no raw log dumps).
