Copyright (c) 2026 Sebastian Waelchli (https://swaelchli.com). All rights reserved. Licensed under the PolyForm Noncommercial License.

# WalFlow

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
