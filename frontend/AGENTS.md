# WalFlow Frontend Context

Applies to work in `frontend/`. The project-wide rules are in the root [AGENTS.md](../AGENTS.md).

## Design & Layout Sources

Read these before any visual or layout change. Where they differ, the higher one wins:

1. **[design-system/walflow/MASTER.md](../design-system/walflow/MASTER.md)**: how WalFlow looks. Colour, spacing,
   radius, shadow, type, shell size, icon and layer tokens; button, form, menu, modal and shell-bar specs;
   breakpoints. It is the single source of truth for token values; `src/index.css` implements it with the same
   names and values.
2. **`walflow-ui-layout` skill** ([../.claude/skills/walflow-ui-layout/SKILL.md](../.claude/skills/walflow-ui-layout/SKILL.md)):
   where things go. The placement rule, the regions and their rules, the command list and menus, dialogs vs info
   bars vs toasts, responsive behaviour, checklist and verification.
3. **`ui-ux-pro-max` skill** ([../.claude/skills/ui-ux-pro-max/SKILL.md](../.claude/skills/ui-ux-pro-max/SKILL.md)):
   generic desktop UI/UX rules and searchable design data.

## Essentials

* **App shell:** menu bar (File, Edit, View, Simulation, Tools, Help; drawing name, save and lock state; account),
  command bar (Undo, Redo, Run Simulation, case), activity rail with one side pane per job (Components, Examples,
  Drawings, Settings), canvas, full-height inspector, results panel under the canvas, status bar.
* **Commands** are defined once in the command list and shown in menus, the command bar, context menus and
  shortcuts. Never wire a handler straight into one surface.
* **Buttons:** one primary (WälFlow orange) action per view, Run Simulation in the shell; secondary for neutral
  actions; dark teal for the active selection; danger ghost for destructive actions. Specs in MASTER.md.
* **Styling:** tokens and classes from `src/index.css`. No new hex colours, raw px sizes or z-index numbers in
  components; inline styles only for values computed at run time.
* **Canvas values:** nodes show values through `NodeReadout` and states through `StatusBadge`, one style and one
  colour for every number; colour only on a state badge (MASTER.md "Canvas values", enforced by a style guard test).
* **Icons:** Phosphor through `components/symbols/IconLibrary.jsx`; icon-only buttons have an accessible name and a
  tooltip.
* **Supported windows:** full editing from 1024 px wide, overlays down to 768 px.
* **Docs stay true:** a change that adds or alters a region, menu item, rule, token or size updates the
  `walflow-ui-layout` skill or MASTER.md in the same change. A docs sync test in the gate checks tokens and menus.
