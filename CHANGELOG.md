# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [Unreleased] (v0.1.0)

### 🔐 Admin Hub & Registration Backlog
- Added **First-Time Admin Setup** modal on launch when no admin user exists in the database.
- Added **Registration Approval Backlog** for admins to approve or reject self-registered user accounts before login.
- Added **User Management** panel to view registered users, update roles (`user` / `admin`), and delete accounts.
- Added **Database Inspector & Diagram Manager**:
  - Open any user diagram directly onto the active canvas.
  - Reassign diagram ownership between users via inline dropdowns.
  - Duplicate, rename, export `.wlf` files, and delete diagrams with popup confirmation.

### 🎨 UI & Layout Polish
- Redesigned sidebar header with WälFlow logo and sleeker user account pill bar.
- Clicking WälFlow logo opens the Help & Info modal directly to the "About & Copyright" tab.
- Reordered Help & Info modal tabs: **Keyboard Shortcuts**, **User Guide**, and **About & Copyright**.
- Unified design system and styling across all modals (`LoginModal`, `AdminSetupModal`, `AdminHubModal`, `ProjectManagerModal`, `HelpInfoModal`) using dark teal glassmorphism theme and custom gradients.

### ⚙️ System & Proxy Fixes
- Added backend retry logic during frontend startup for server connection stability.
- Migrated FastAPI startup handlers to modern `lifespan` context manager.
- Fixed Vite proxy configuration targeting `127.0.0.1:8000` to prevent IPv6 `ECONNREFUSED` connection issues.
