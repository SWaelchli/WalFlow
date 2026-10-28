# WalFlow Frontend Context

Applies to work in `frontend/`. The project-wide rules are in the root [AGENTS.md](../AGENTS.md). Before any visual change, also read the `ui-ux-pro-max` skill ([../.claude/skills/ui-ux-pro-max/SKILL.md](../.claude/skills/ui-ux-pro-max/SKILL.md)); where the two differ, this file wins for WalFlow.

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
