# WalFlow Agent Context

This document provides context for the WalFlow project, a web-based hydraulic simulator.

## Project Overview

WalFlow is a full-stack application that allows users to build and simulate hydraulic process and instrumentation diagrams (P&IDs) in a web browser. It consists of two main parts:

*   **Backend:** A Python-based physics engine built with FastAPI. It uses WebSockets for real-time communication with the frontend. The simulation logic relies on libraries like NumPy and SciPy for numerical calculations.
*   **Frontend:** A React-based user interface built with Vite. It uses the ReactFlow library to provide a drag-and-drop canvas for building the hydraulic diagrams.

The application allows users to drag various hydraulic components (pumps, valves, pipes, etc.) onto a canvas, connect them, and then run a simulation to see the real-time operating conditions of the system.

## Simulation & Physics Principles

* **Steady-State Static Solver**: WalFlow is strictly a static, steady-state hydraulic simulator. The backend solver calculates instantaneous algebraic equilibrium (pressures, flow rates, temperatures, fluid velocities) with no time-stepping ($\Delta t = 0$).
* **No Time-Step Dynamics**: Concepts involving time integration—such as dynamic accumulator charging/discharging over time ($P_1 V_1^n = P_2 V_2^n$), dynamic tank level filling/emptying over time, valve ramping, or transient water hammer—are incompatible with the current steady-state solver model and should not be proposed or modeled as time-dependent processes.

## Building and Running

```bash
# Backend (FastAPI, use a virtual environment): http://localhost:8000
pip install -r requirements-dev.txt
uvicorn main:app --app-dir backend --reload --port 8000
# Frontend (Vite): http://localhost:5173, connects to ws://localhost:8000/ws/simulate
cd frontend && npm install && npm run dev
```

## Development Conventions

### Adding New Equipment

Follow the `equipment-creation` skill ([.claude/skills/equipment-creation/SKILL.md](./.claude/skills/equipment-creation/SKILL.md)): backend class and its `<name>.md`, graph parser registration, tests, frontend node and registration.

### Testing

Always read and follow the `walflow-qa` skill ([.claude/skills/walflow-qa/SKILL.md](./.claude/skills/walflow-qa/SKILL.md)) before writing, changing or deleting any test, fixing a bug, or adding equipment. It holds the test strategy (test pyramid, property tests with hypothesis), where each test belongs, the bug-fix decision tree, naming and audit-marker rules, and the gate. Prefer strengthening an existing property or adding a reference-table row over adding a new test function.

Any check in the running app that needs a login (browser walkthrough, UX audit, multi-user or lock check) signs out of the current user and uses a test account from the `walflow-test-users` skill ([.claude/skills/walflow-test-users/SKILL.md](./.claude/skills/walflow-test-users/SKILL.md)).

Run the gate defined in the `walflow-qa` skill before finishing any change (via `walflow-gate-runner`, see below). GitHub Actions runs the same gate only when a release tag is pushed, and blocks Docker publishing if it fails; pushes to `main` are not checked in CI.

### Performance

Follow the `walflow-performance` skill ([.claude/skills/walflow-performance/SKILL.md](./.claude/skills/walflow-performance/SKILL.md)) for any change made for speed. Every speed-up must be measured as faster, and must leave the simulation's accuracy, scope and physical model unchanged.

## Orchestrator Delegation Protocol

The main session (Opus) is the orchestrator. It keeps the user conversation, decisions and physics; noisy or
specialised work goes to the subagents in `.claude/agents/`, which return short reports, not logs.

**The orchestrator keeps:** clarifying requirements and getting confirmation; all changes to `backend/simulation/`
(solver, graph parser, equipment, fluids) and their equipment `.md` docs; backend API/service code; cross-cutting
design; `CHANGELOG.md`, versions and git commits.

| Task | Delegate to |
|---|---|
| Find code across 3+ files or in unfamiliar areas | `walflow-scout` |
| Run the gate or any test/lint/build subset | `walflow-gate-runner` |
| Write, change, move or delete tests; red test for a bug fix | `walflow-test-author` |
| Frontend UI/UX implementation in `frontend/src/` | `walflow-frontend-dev` |
| Review a change in `backend/simulation/` | `walflow-physics-reviewer` |

Rules:
1. A single Grep, or a Read of a known file, stays inline. Delegate when the search spans 3+ files or the output is noisy.
2. Never run the gate or a test suite inline; never edit tests or frontend components inline (small one-line fixes excepted).
3. Briefs are self-contained: goal, target paths, acceptance criteria, the skill to load. Subagents do not see the chat.
4. Trust the report; do not re-run or re-read what a subagent already reported unless it is contradictory.
5. Typical flow: confirm requirements -> scout -> implement (orchestrator or frontend-dev) -> physics-reviewer if
   `backend/simulation/` changed -> test-author -> gate-runner -> report to user.
6. Write scopes are enforced by `.claude/hooks/scope-guard.mjs`: test-author writes only tests, frontend-dev only
   `frontend/src` (no tests) and `frontend/public`, the other agents nothing.


## Interaction with User

1. The user will advice on what feature they want to change or implement. Before changing any code, make sure to clarify the exact requirements. Write a prompt and wait for confirmation from user before proceeding.
2. Git commits should ONLY be performed upon explicit user request. Do not automatically create git commits after completing a task or phase unless requested.
3. Always read and consult the `ui-ux-pro-max` skill and [frontend/AGENTS.md](./frontend/AGENTS.md) whenever changing the user interface (UI) or user experience (UX) to ensure premium visual compliance.

## Versioning Policy

1. **App Version**: The current version is `APP_VERSION` in `backend/constants.py`, mirrored in `frontend/src/constants.js` and `frontend/package.json`; change all three together. The app version must ONLY be raised after explicit user confirmation. The app version takes the lead on major version increments.
2. **File Format Version**: The current version is `FILE_FORMAT_VERSION` in `backend/constants.py`, mirrored in `frontend/src/constants.js`. The file format version should ONLY be raised when there would otherwise be a data format incompatibility.
3. **Version Alignment**: The major (first) digit of the App Version and File Format Version must always match (e.g., App `0.2.0` maps to File Format `0.2`). When the App Version reaches `1.0.0`, the File Format Version must advance to `1.0`.
4. **Git Release Tags**: Always use the `vX.X.X` format (e.g., `v0.1.1`) when creating and pushing new release tags to trigger automated Docker image builds via GitHub Actions.
5. **Changelog Maintenance**: All implemented features and updates must be tracked in `CHANGELOG.md`. Keep changelog entries brief, concise, and high-level without going overboard with details. The changelog must be emptied after the version number is increased.

## Design & Styling

The UI design tokens, button rules and navbar/sidebar responsibilities are in [frontend/AGENTS.md](./frontend/AGENTS.md).
