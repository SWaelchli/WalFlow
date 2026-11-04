# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.2.1]

### Security
- **Backend runs unprivileged**: the backend container now drops from root to an unprivileged user before starting the app, so the network-facing process is no longer root. `PUID`/`PGID` set the user; left out, it takes the data folder's non-root owner. It stops with a clear message if the database folder is not writable.
- **Pinned CI actions**: all GitHub Actions in the release workflow are pinned to commit SHAs, so a moved tag on a third-party action can no longer change what runs with registry-publish rights.

### Architecture & Refactoring
- **Deployment assets relocated**: moved Dockerfiles, entrypoints, and local Docker Compose into `deploy/` to keep the project root clean.
- **WebSocket router extraction**: separated the `/ws/simulate` endpoint from `main.py` into dedicated router `routers/ws_simulation.py`.
- **Project service layer**: extracted project role checks and permission helpers into `services/project_service.py`, so routers no longer share them with each other.
- **Simulation service layer**: moved the telemetry, KPI and result helpers into `services/simulation_service.py`, with one network build helper, so the WebSocket router no longer depends on the HTTP router.
- **Code hygiene**: eliminated dead scratch tests, obsolete React hooks, unused CSS rules, and unified equipment defaults.

### Fixes
- **Local Docker build**: the documented `deploy/docker-compose.local.yml` command finds its build context again.
- **Collaboration errors**: a server fault while joining a diagram is logged in full and no longer reported as a sign-in problem.
- **Dev server**: `--reload` watches only `backend/`.
- **Accessibility**: the About button's name matches its visible text, menu shortcuts and status times meet AA contrast, settings headings no longer skip a level, and password fields carry autocomplete hints.
- **WebSocket start-up**: a socket still connecting is closed once it opens, which removes the browser's premature-close warning.
- **WebSocket replacement**: a socket being replaced after sign-in or sign-out can no longer mark the new connection as disconnected or deliver a late result.
- **Rejected diagrams**: a run whose diagram fails to parse now clears the previous model, so a later run cannot return results for the old diagram.

---
