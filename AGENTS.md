# Gemini Code-Context

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

### Backend (Python)

1.  **Install Dependencies:**
    It is recommended to use a virtual environment.
    ```bash
    pip install -r requirements.txt
    ```

2.  **Run the Server:**
    The backend server is a FastAPI application run with uvicorn.
    ```bash
    uvicorn backend.main:app --reload --port 8000
    ```
    The server will be available at `http://localhost:8000`.

### Frontend (React)

1.  **Install Dependencies:**
    Navigate to the `frontend` directory.
    ```bash
    cd frontend
    npm install
    ```

2.  **Run the Development Server:**
    This command starts the Vite development server.
    ```bash
    npm run dev
    ```
    The frontend will be available at `http://localhost:5173` by default and will connect to the backend WebSocket at `ws://localhost:8000/ws/simulate`.

## Development Conventions

### Adding New Equipment

The project has a clear process for adding new hydraulic components, which involves updating both the backend and frontend. The [DEVELOPMENT.md](./DEVELOPMENT.md) file contains a detailed guide on how to:
1.  Create a new equipment class in the Python backend.
2.  Register the new equipment in the backend's graph parser.
3.  Create a corresponding React component for the equipment in the frontend.
4.  Register the new component in the frontend's `App.jsx` and `Sidebar.jsx`.

### Linting

The frontend uses ESLint for code quality. To run the linter, use the following command from the `frontend` directory:
```bash
npm run lint
```

## Interaction with User

1. The user will advice on what feature they want to change or implement. Before changing any code, make sure to clarify the exact requirements. Write a prompt and wait for confirmation from user before proceeding.
2. Git commits should ONLY be performed upon explicit user request. Do not automatically create git commits after completing a task or phase unless requested.
3. Always read and consult the `ui-ux-pro-max` skill whenever changing the user interface (UI) or user experience (UX) to ensure premium visual compliance.

## Versioning Policy

1. **App Version**: The current app version is `0.1.6`. The app version must ONLY be raised after explicit user confirmation. The app version takes the lead on major version increments.
2. **File Format Version**: The current file format version is `0.1`. The file format version should ONLY be raised when there would otherwise be a data format incompatibility.
3. **Version Alignment**: The major (first) digit of the App Version and File Format Version must always match (e.g., App `0.1.6` maps to File Format `0.1`). When the App Version reaches `1.0.0`, the File Format Version must advance to `1.0`.
4. **Git Release Tags**: Always use the `vX.X.X` format (e.g., `v0.1.1`) when creating and pushing new release tags to trigger automated Docker image builds via GitHub Actions.
5. **Changelog Maintenance**: All implemented features and updates must be tracked in `CHANGELOG.md`. Keep changelog entries brief, concise, and high-level without going overboard with details. The changelog must be emptied after the version number is increased.

## Design & Styling Philosophy

The WalFlow user interface follows a modern, clean, and engineering-focused design system.

### Color Palette & Tokens
* **Primary Accent (Action)**: `#FA8507` (WälFlow Orange) / Hover `#E07600`. Dedicated to primary calls-to-action (e.g. `Run Simulation`).
* **Brand Dark (Active State)**: `#395253` / Hover `#253637`. Used for active tab selections, key dark brand headers, and active state highlights.
* **Surface Light**: `#F4F7F6` / `#FFFFFF`. Backgrounds for secondary buttons, panels, card backgrounds, and inputs.
* **Borders**: `#D8E2E1` (Standard subtle 1px border), `#EBF0EF` (Divider lines).
* **Typography & Text**: `#1C2B2C` (Primary headers and text), `#587071` (Secondary/muted labels and subtexts).
* **Destructive Actions**: Soft light red fill (`#FEF2F2`), border (`#FEE2E2`), and red text (`#EF4444`) for destructive triggers (e.g. `Clear Canvas`, `Log Out`).

### Component Guidelines
1. **Top Navbar**: Houses global layout controls, primary simulation action (`Run Simulation`), canvas management (`Export`, `Import`, `Clear Canvas`), user/auth status, and modal triggers (`Cloud Projects`, `Admin Hub`).
2. **Sidebar**: Focused strictly on component drag-and-drop cards, scenario templates, global fluid/solver settings, and diagnostics statistics.
3. **Buttons**:
   - **Primary CTA**: WälFlow Orange, white text, subtle orange shadow.
   - **Secondary Actions**: Soft light surface (`#F4F7F6`), `#D8E2E1` border, `#1C2B2C` text. Hover transitions to `#EBF0EF`.
   - **Active Selection**: Dark brand teal (`#395253`), white text.
   - **Destructive Ghost**: Soft red text (`#EF4444`) with subtle red hover fill (`#FEF2F2`).


