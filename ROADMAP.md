# WalFlow Roadmap & Feature Backlog

This document outlines planned features, overlays, and enhancements for the WalFlow hydraulic simulator.

---

## 🎨 Canvas & Overlays

- [ ] **🛡️ Overpressure Safety Zone Overlay (`SafetyBoundsOverlay`)**
  * **Concept:** Boundary shading defining isolated pressure zones across the diagram canvas.
  * **Visuals:** Semi-transparent shaded region boundaries grouped by high-pressure, pilot-pressure, and tank-return lines, with dynamic warning indicators when a low-pressure line experiences excessive pressure.
  * **Engineering Value:** Provides clarity in complex P&ID diagrams with multiple pressure levels (e.g., main supply circuit vs. pilot control circuit vs. drain/tank return).

---

## ⚙️ Physics & Simulation

*Future physics engine capabilities will be listed here.*

---

## 📊 Analytics & Telemetry

- [ ] **🖥️ Server Resource Telemetry & Performance Dashboard**:
  * **System Resource Monitoring**: Track CPU % consumed by matrix calculations (SciPy/NumPy), RAM usage per active simulation WebSocket, and average solver iteration time (ms) using `psutil`.
  * **Session & User Usage Stats**: Record active connected user count, duration of simulation runs, and historical simulation sessions in the database.
  * **Live Admin Performance Dashboard**: Build an integrated admin dashboard featuring live gauges and historical charts of server compute power and active simulation sessions.

---

## 🔐 Admin Hub & Registration Approval Backlog

- [ ] **Admin Account Initialization**:
  * On initial app deployment and database creation, a default **Admin User** is automatically created in the database.
- [ ] **Admin Hub Panel**:
  * Dedicated administrative hub for user management, role assignments, and system telemetry monitoring.
- [ ] **User Registration Approval Workflow**:
  * When a new user registers (`POST /api/auth/register`), their account status is set to `pending_approval`.
  * Admin users have a registration backlog in the Admin Hub where they can **Approve** or **Reject** pending user registrations before the user account is allowed to log in and run simulations.

