# WalFlow Development Guide

This guide is intended for developers and contributors looking to understand the architecture of WalFlow, run local development environments, or extend the app with new hydraulic components.

---

## 🛠️ Local Development Setup

### Backend (Python & FastAPI)

1. **Navigate to the root directory and set up a Python virtual environment:**
   ```bash
   python -m venv .venv
   # Windows (PowerShell):
   .\.venv\Scripts\Activate.ps1
   # Linux/macOS:
   source .venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements-dev.txt
   ```

3. **Start the FastAPI server with reload:**
   ```bash
   uvicorn main:app --app-dir backend --reload --port 8000
   ```
   The backend API and WebSocket endpoints will be available at `http://localhost:8000`.

### Frontend (React & Vite)

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Vite development server:**
   ```bash
   npm run dev
   ```
   The frontend will run at `http://localhost:5173` and connect automatically to `ws://localhost:8000/ws/simulate`.

4. **Linting & Code Quality:**
   ```bash
   npm run lint
   ```

---

## 🧩 How to Add New Equipment

Adding a component touches the physics engine (backend) and the canvas (frontend). The step-by-step guide, code templates for each equipment type, solver stability rules and the frontend registration list live in the `equipment-creation` skill: [.claude/skills/equipment-creation/SKILL.md](.claude/skills/equipment-creation/SKILL.md). Every equipment class gets an explanatory `<name>.md` beside it in `backend/simulation/equipment/` (example: `orifice.md`).

## 🧪 Testing

The test strategy and the release gate are in the `walflow-qa` skill: [.claude/skills/walflow-qa/SKILL.md](.claude/skills/walflow-qa/SKILL.md).

## 🎨 User Interface

How the app looks (tokens, components, shell sizes, breakpoints) is in [design-system/walflow/MASTER.md](design-system/walflow/MASTER.md). Where a control goes (menu bar, command bar, side panes, inspector, results panel, status bar, dialogs) is in the `walflow-ui-layout` skill: [.claude/skills/walflow-ui-layout/SKILL.md](.claude/skills/walflow-ui-layout/SKILL.md). [frontend/AGENTS.md](frontend/AGENTS.md) gives the order of authority.

---

## 🏗️ Architecture & Solver Model

* **Steady-State Static Solver:** WalFlow solves static hydraulic equilibrium ($P, Q, T$) instantly without time-stepping ($\Delta t = 0$).
* **Data Flow:** ReactFlow canvas graph $\rightarrow$ WebSocket JSON payload $\rightarrow$ Python Graph Parser & Matrix Solver $\rightarrow$ WebSocket telemetry stream $\rightarrow$ React UI state update.
