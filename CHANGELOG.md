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
- **Project service layer**: extracted project role checks and permission helpers into `services/project_service.py`, so routers no longer share them with each other. `ws_simulation.py` still imports its solver helpers from `routers/simulation.py`.
- **Code hygiene**: eliminated dead scratch tests, obsolete React hooks, unused CSS rules, and unified equipment defaults.

### Fixes
- **Local Docker build**: the documented `deploy/docker-compose.local.yml` command finds its build context again.
- **Collaboration errors**: a server fault while joining a diagram is logged in full and no longer reported as a sign-in problem.
- **Dev server**: `--reload` watches only `backend/`.

---
