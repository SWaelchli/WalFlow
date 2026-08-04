Copyright (c) 2026 Sebastian Waelchli (https://swaelchli.com). All rights reserved. Licensed under the PolyForm Noncommercial License.

<img width="1264" height="215" alt="Logo_WalFlow" src="https://github.com/user-attachments/assets/914e105e-2a84-4a10-85c1-22be7a99d3e4" />

**WalFlow** is a modern, web-based hydraulic process simulator. Build, modify, and analyze Process Flow Diagrams (PFDs) directly in your browser with real-time steady-state solver telemetry.

---

## ✨ Features

* **Interactive Drag-and-Drop Canvas:** Build network diagrams effortlessly using a component library built on ReactFlow.
* **Real-Time Physics Engine:** Fast Python-based steady-state static solver calculating algebraic pressure distributions, flow rates, and fluid temperatures over WebSocket connections.
* **Rich Hydraulic Component Library:** Includes pumps, control valves, shut-off valves, orifices, pressure relief valves, heat exchangers, oil coolers, strainers, reservoirs, and pipe branching (T-pieces).
* **Live Telemetry & Component Inspection:** Instant visual readout of pressure drops, flow rates, temperature profiles, and operating curves.
* **Custom Fluids & Solver Control:** Select standard fluids (ISO VG oils, water, etc.) or configure custom fluid properties (density, viscosity) and ambient conditions.
* **Scenario Templates & Cloud Storage:** Quickly load benchmark PFD scenarios or save, export, and import customized simulation models.

---
<img width="1033" height="667" alt="Untitled" src="https://github.com/user-attachments/assets/5839d719-bae1-4ee6-9179-d06644e6875b" />
---

## 🐳 Production Deployment (Docker Compose)

Deploy WalFlow on a homelab server, Proxmox VM, or cloud host using container images from GitHub Container Registry:

```yaml
services:
  walflow-backend:
    image: ghcr.io/swaelchli/walflow-backend:latest
    container_name: walflow-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - /docker/walflow/data:/app/data
    environment:
      - DATABASE_PATH=/app/data/walflow.db
      - PYTHONUNBUFFERED=1

  walflow-frontend:
    image: ghcr.io/swaelchli/walflow-frontend:latest
    container_name: walflow-frontend
    restart: unless-stopped
    ports:
      - "5173:80"
    depends_on:
      - walflow-backend
```

Run `docker compose up -d` and navigate to `http://localhost:5173` (or route through a reverse proxy like Nginx or Cloudflare Tunnel).

### Environment Variables Configuration

The backend supports several environment variables that can be customized in the `environment:` section of the `walflow-backend` service:

*   **`WALFLOW_REQUIRE_WS_AUTH`** (Default: `true`)
    *   **What it does**: Controls whether WebSocket connections (required to run simulations) need user authentication/login.
    *   **How to implement**: Set to `false` to allow guest users to run simulations:
        ```yaml
        - WALFLOW_REQUIRE_WS_AUTH=false
        ```

*   **`WALFLOW_SECRET_KEY`** (Default: Auto-generated random key at startup if not defined, provided `ENVIRONMENT` is not `production`)
    *   **What it does**: The cryptographic key used to sign and verify JSON Web Tokens (JWT) for user authentication.
    *   **Benefits & Trade-offs of Configuration Options**:
        *   *Omitted / Not Set (Default)*: If not configured, the backend auto-generates a temporary random key on startup.
            *   *Pros*: Zero-configuration setup, ideal for quick testing.
            *   *Cons*: Every container restart or redeployment invalidates all active user login sessions, forcing users to log in again.
        *   *Set explicitly*: Defined as a persistent, secure random string.
            *   *Pros*: Keeps user sessions valid and logged in across container restarts and updates. Enforced in production environments.
            *   *Cons*: Requires manual configuration and secure storage in your docker compose file.
    *   **How to implement**:
        ```yaml
        - WALFLOW_SECRET_KEY=your_secure_random_key_here
        ```

*   **`ENVIRONMENT`** (Default: `development` behavior if not set)
    *   **What it does**: Sets the execution mode. If set to `production`, the backend strictly enforces security checks, such as crashing on startup if `WALFLOW_SECRET_KEY` is not defined.
    *   **How to implement**:
        ```yaml
        - ENVIRONMENT=production
        ```

*   **`WALFLOW_SECURE_COOKIES`** (Default: `true` if `WALFLOW_SECRET_KEY` is configured, `false` otherwise)
    *   **What it does**: Overrides the `Secure` flag on HTTP cookies (tells the browser to only transmit cookies over encrypted `https://` connections).
    *   **How to implement**: Set to `false` if deploying without HTTPS (e.g., local home network/LAN):
        ```yaml
        - WALFLOW_SECURE_COOKIES=false
        ```

---


## 💻 Quick Start for Local Development

To run backend and frontend dev servers locally:

```bash
# 1. Start Backend (FastAPI)
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

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
