*Copyright (c) 2026 Sebastian Waelchli (https://swaelchli.com). All rights reserved. Licensed under the PolyForm Noncommercial License.*

<img width="1264" height="215" alt="Logo_WalFlow" src="https://github.com/user-attachments/assets/914e105e-2a84-4a10-85c1-22be7a99d3e4" />


**WalFlow** is a web-based hydraulic process simulator. Build, modify, and analyze Process Flow Diagrams (PFDs) directly in your browser with real-time steady-state solver telemetry.

---

## ✨ Features

* **Interactive Drag-and-Drop Canvas:** Build Process Flow Diagrams effortlessly using a component library built on ReactFlow.
* **Real-Time Physics Engine:** Fast Python-based steady-state static solver calculating algebraic pressure distributions, flow rates, and fluid temperatures over WebSocket connections.
* **Hydraulic Component Library:** Includes pumps, control valves, shut-off valves, orifices, pressure relief valves, heat exchangers, oil coolers, strainers, reservoirs, and pipe branching.
* **Live Telemetry & Component Inspection:** Instant visual readout of pressure drops, flow rates, temperature profiles, and operating curves.
* **Custom Fluids & Solver Control:** Select standard fluids (ISO VG oils, water, etc.) or configure custom fluid properties (density, viscosity) and ambient conditions.
* **Scenario Templates & Cloud Storage:** Quickly load benchmark PFD scenarios or save, export, and import customized simulation models.
* **Colaborative Project Structure:** Create Projects and invite your team to work on your PFDs together .

---

## Model & Limits

WalFlow is a **steady-state** simulator: it solves the algebraic balance of pressures, flows and temperatures, with no time stepping (no transients, water hammer or dynamic filling).

* **Friction:** Darcy-Weisbach with the Churchill (1977) friction factor, using the roughness of the pipe class.
* **Fluids:** built-in properties are valid only over a limited temperature range per fluid (for example water 0 to 150 °C); runs outside the range are flagged.
* **Control valves:** the viscosity correction is a simplified form of the IEC 60534-2-1 Reynolds factor (within about 12 % up to 30 cSt, 0.7 to 1.7 times the standard up to 1000 cSt); choked flow is not modelled.
* **Not checked:** pipe class ratings, corrosion allowance, pump run-out and velocity limits are informational or unchecked. Review results against the applicable standards.

The same text is in the app under **Help > Model & Limits**.

---
<img width="1033" height="667" alt="Untitled" src="https://github.com/user-attachments/assets/5839d719-bae1-4ee6-9179-d06644e6875b" />
---

## 🐳 Production Deployment (Docker Compose)

Deploy WalFlow using container images from GitHub Container Registry:

*Example Docker-Compose.yaml:*
```yaml
services:
  walflow-backend:
    image: ghcr.io/swaelchli/walflow-backend:latest
    container_name: walflow-backend
    restart: unless-stopped
    ports:
      - "127.0.0.1:8000:8000"
    volumes:
      - /docker/walflow/data:/app/data
    environment:
      - DATABASE_PATH=/app/data/walflow.db
      - PYTHONUNBUFFERED=1
      - ENVIRONMENT=production
      - WALFLOW_SECRET_KEY=${WALFLOW_SECRET_KEY:?set it in .env}

  walflow-frontend:
    image: ghcr.io/swaelchli/walflow-frontend:latest
    container_name: walflow-frontend
    restart: unless-stopped
    ports:
      - "5173:80"
    depends_on:
      - walflow-backend
```

Create a `.env` file with `WALFLOW_SECRET_KEY` (see below), run `docker compose up -d` and navigate to `http://localhost:5173` in order to access the web UI.

### Environment Variables Configuration

Copy [`.env.example`](./.env.example) to `.env` next to `docker-compose.yml` and set at least **`WALFLOW_SECRET_KEY`**. `docker compose` stops with an error until it is set. All other variables are optional; the compose file passes them to the containers with the defaults shown below.

> **Upgrading from an earlier compose file:** add `WALFLOW_SECRET_KEY` to `.env` before `docker compose pull`. All users are logged out once, because the previously random key is replaced. The backend port 5701 is now published on `127.0.0.1` only; use port 5702 (the frontend) for users.

**Backend (`walflow-backend`)**

| Variable | Default | What it does |
|---|---|---|
| `WALFLOW_SECRET_KEY` | none, **required** in compose | Key that signs login tokens. Generate with `openssl rand -hex 32`. Changing it logs everybody out. Without it the backend would invent a random key at each start and, with `ENVIRONMENT=production`, refuses to start. |
| `ENVIRONMENT` | `production` in compose | `production` enforces the checks above. |
| `WALFLOW_SECURE_COOKIES` | `true` | Login cookies are sent over HTTPS only. Set to `false` for a plain-HTTP LAN install, otherwise login does not work. |
| `WALFLOW_TRUSTED_PROXY_HOPS` | `1` | Number of reverse proxies that append the client address to `X-Forwarded-For` (the bundled nginx is 1; use `2` when another proxy such as Traefik or Nginx Proxy Manager sits in front of it; `0` ignores the header). The login rate limit uses this address, so a wrong value either lets clients spoof their address or puts all users into one bucket. |
| `WALFLOW_REQUIRE_WS_AUTH` | `false` | `false`: anonymous users may run simulations (collaboration on shared diagrams always needs a login). `true`: the simulation also needs a login. |
| `WALFLOW_MAX_NODES` | `500` | Largest diagram (number of components) accepted for simulation. |
| `WALFLOW_MAX_CASES` | `20` | Most operating cases accepted by `/api/simulation/batch`. |
| `WALFLOW_SOLVE_TIMEOUT_S` | `60` | Seconds one simulation request may take before it is stopped with an error. `0` turns the limit off. |
| `WALFLOW_MAX_CONCURRENT_SOLVES` | number of CPUs | Simulations running at the same time; further requests wait. |
| `UVICORN_WS_MAX_SIZE` | `2097152` (2 MiB) | Largest WebSocket message in bytes. |
| `WALFLOW_COLLAB_BROADCAST_INTERVAL_S` | `10` | Shortest gap between "diagram updated" notices that co-editors receive. |

**Frontend / nginx (`walflow-frontend`)**

| Variable | Default | What it does |
|---|---|---|
| `NGINX_MAX_BODY_SIZE` | `5m` | Largest request body, for example a cloud save or `/batch`. Larger requests get HTTP 413. |

**Notes**
*   WalFlow runs as a **single backend worker**. Edit locks and the list of logged-out tokens are kept in memory (or in Redis when `REDIS_URL` is set), so do not start more than one worker without Redis.
*   Saving a project diagram while nobody holds its edit lock takes the lock for the saver. A save is refused when someone else changed the diagram since you opened it ("changed elsewhere"); reload to see their version.
*   Disabling a user in the Admin Hub ends their access immediately. The last administrator cannot be demoted, disabled or deleted.

---


## 💻 Quick Start for Local Development

To run backend and frontend dev servers locally:

```bash
# 1. Start Backend (FastAPI)
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --app-dir backend --reload --port 8000

# 2. Start Frontend (Vite + React)
cd frontend
npm install
npm run dev
```

For complete development guidelines, graph parser extensions, and step-by-step equipment integration, see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

## 📚 Documentation & Project Links

* 🛠️ **[Development Guide](./DEVELOPMENT.md)** — Architecture details and instructions for adding new hydraulic equipment.
* 🗺️ **[Project Roadmap](./ROADMAP.md)** — Upcoming features, solver enhancements, and planned overlays.
* 📜 **[Changelog](./CHANGELOG.md)** — Version history and release notes.
* 📄 **[License](./LICENSE.txt)** — PolyForm Noncommercial License 1.0.0.
