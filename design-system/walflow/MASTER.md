# Design System Master File (WalFlow)

> **LOGIC:** When building a specific page, first check `design-system/walflow/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** WälFlow
**Version:** 0.2.0
**Platform:** desktop web app (mouse and keyboard, windows from 768 px wide). Mobile rules do not apply.
**Design Dials:** Variance 3/10 (Clean Minimalism) | Motion 3/10 (Subtle Micro-interactions) | Density 8/10 (Compact Editor Density)

This file is the **single source of truth** for how WalFlow looks: tokens, type, components and app shell sizes.
`frontend/src/index.css` implements it and must use the same names and values; when they differ, this file wins
and `index.css` is corrected. Where to place a control (menus, panes, status bar, dialogs) is in the
`walflow-ui-layout` skill. Generic advice is in the `ui-ux-pro-max` skill. Edit this file by hand; do not
regenerate it with `--persist`.

---

## Global Rules

### CSS Custom Variables & Tokens

```css
:root {
  /* Primary Accent (Action) */
  --color-primary: #FA8507;
  --color-primary-hover: #E07600;
  --color-primary-active: #C86900;
  --color-primary-text: #B45309; /* orange as text on light surfaces: 5.0:1 on white (#FA8507 is 2.49:1) */
  --color-primary-tint: rgba(250, 133, 7, 0.12);
  --color-primary-glow: rgba(250, 133, 7, 0.35);

  /* Brand Dark (Active States) */
  --color-brand-dark: #395253;
  --color-brand-darker: #263839;
  --color-brand-darkest: #1A2829;
  --color-brand-light: #4A6768;

  /* Surfaces & Backgrounds */
  --color-bg-canvas: #F0F4F4;
  --color-surface: #FFFFFF;
  --color-surface-hover: #F8FAFA;
  --color-surface-muted: #F4F7F6; /* secondary button hover, panel and rail backgrounds */
  --color-surface-dark: #223233;

  /* Borders & Dividers */
  --color-border: #D8E2E1;
  --color-border-hover: #B8C9C8;
  --color-border-active: #FA8507;

  /* Text & Labels */
  --color-text-primary: #1C2B2C;
  --color-text-secondary: #587071;
  --color-text-muted: #849A9B;
  --color-text-inverse: #FFFFFF;

  /* Semantic Alerts */
  --color-success: #10B981;
  --color-success-text: #166534; /* green as text and icon on its tint */
  --color-success-tint: #F0FDF4;
  --color-success-border: #BBF7D0;
  --color-warning: #F59E0B;
  --color-warning-text: #B45309; /* amber as text: 5.0:1 on white */
  --color-warning-text-strong: #92400E;
  --color-warning-bg: #FFFBEB;
  --color-warning-border: #FDE68A;
  --color-danger: #EF4444;
  --color-danger-text: #B91C1C; /* red as small text: 6.5:1 on white (#EF4444 is 3.76:1) */
  --color-danger-tint: #FEF2F2;
  --color-danger-border: #FEE2E2;
  --color-info: #0284C7;
  --color-info-text: #0369A1;    /* blue as text on its tint */
  --color-info-tint: #F0F9FF;
  --color-info-border: #BAE6FD;

  /* Diagram semantics (canvas) */
  --color-signal: #587071;       /* signal (sensing) lines */
  --color-inlet: #0284C7;
  --color-outlet: #E11D48;
  --color-port-neutral: #587071; /* junction, orifice, filter ports: 5.3:1 on white */

  /* Spacing Scale (Compact Density) */
  --space-xs: 2px;
  --space-sm: 4px;
  --space-md: 8px;
  --space-lg: 12px;
  --space-xl: 16px;
  --space-2xl: 24px;
  --space-3xl: 32px;

  /* Radius Tokens */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-full: 9999px;

  /* Shadow Depths */
  --shadow-sm: 0 1px 2px 0 rgba(57, 82, 83, 0.05);
  --shadow-md: 0 4px 12px -2px rgba(57, 82, 83, 0.1), 0 2px 4px -2px rgba(57, 82, 83, 0.06);
  --shadow-lg: 0 10px 25px -3px rgba(57, 82, 83, 0.14), 0 4px 6px -2px rgba(57, 82, 83, 0.05);
  --shadow-xl: 0 20px 35px -5px rgba(57, 82, 83, 0.2);

  /* Type Scale (nothing below 11px in UI chrome) */
  --fs-xs: 11px;   /* captions, badges, table meta */
  --fs-sm: 12px;   /* labels, secondary text, dense tables */
  --fs-base: 13px; /* body, inputs, buttons */
  --fs-md: 14px;   /* emphasised body, modal subtitles */
  --fs-lg: 16px;   /* section and panel titles */
  --fs-xl: 20px;   /* modal titles */
  --fs-2xl: 24px;  /* page titles, empty-state glyphs */

  /* Canvas text (zooms with the drawing; see "Canvas values") */
  --fs-canvas-meta: 9px;    /* node name, secondary lines, status badges */
  --fs-canvas-value: 10px;  /* values on nodes and the pipe hover label */

  /* Typography Pairing */
  --font-sans: 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace;

  /* App Shell Sizes (see "App Shell & Layout") */
  --shell-menubar-h: 40px;
  --shell-commandbar-h: 44px;
  --shell-statusbar-h: 28px;
  --shell-rail-w: 48px;
  --shell-pane-w: 288px;       /* default; resizable 240-400 */
  --shell-inspector-w: 320px;  /* default; resizable 280-480 */
  --shell-results-h: 280px;    /* default; resizable 160 to 70% of the workspace */
  --shell-results-collapsed-h: 36px;
  --shell-canvas-min-w: 480px;
  --shell-canvas-min-h: 320px;
  --shell-flyout-w: 576px;     /* status bar flyouts */
  --shell-overlay-w: 336px;    /* canvas overlay cards (top right) */
  --control-h: 30px;           /* buttons, inputs, selects */
  --control-h-sm: 24px;        /* table cells, chips, status bar items */
  --icon-sm: 16px;             /* menus, dense rows, status bar */
  --icon-md: 20px;             /* command bar, rail */

  /* Layers: use these, never raw z-index numbers */
  --z-canvas-overlay: 10;      /* legend, case manager, run banners, canvas controls */
  --z-pane-overlay: 100;       /* side pane or inspector shown over the canvas */
  --z-popover: 1000;           /* menus, dropdowns, context menus, status flyouts, tooltips */
  --z-modal: 2000;
  --z-toast: 3000;
}
```

---

## Typography

*   **Font Family:** Inter, bundled through `@fontsource-variable/inter` (works offline).
*   **Type scale (tokens in `frontend/src/index.css`):** `--fs-xs` 11px, `--fs-sm` 12px, `--fs-base` 13px, `--fs-md` 14px, `--fs-lg` 16px, `--fs-xl` 20px, `--fs-2xl` 24px. Use the tokens, not raw px; nothing below 11px in UI chrome. Text on the canvas zooms with the drawing and uses the canvas tokens `--fs-canvas-meta` and `--fs-canvas-value` (see "Canvas values").
*   **Casing:** sentence case for labels, buttons, chips and badges; UPPERCASE only for small section headers.
*   **Icons:** Phosphor (regular weight) through `components/symbols/IconLibrary.jsx` only; no emoji as icons.
*   **Weights:** Light (300), Regular (400), Medium (500), SemiBold (600), Bold (700), Black (900).
*   **Header Selection:** Strict bold/heavy weight selectors to emphasize visual landmarks.

---

## Component CSS Specifications

### 1. Buttons

```css
/* Base Transition Utilities */
.btn-primary,
.btn-secondary,
.btn-danger-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

/* Primary Button (Action CTAs) */
.btn-primary {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border: 1px solid transparent;
}
.btn-primary:hover {
  background-color: var(--color-primary-hover);
}
.btn-primary:active {
  background-color: var(--color-primary-active);
}
.btn-primary:focus-visible {
  box-shadow: 0 0 0 3px var(--color-primary-glow);
}
.btn-primary:disabled {
  background-color: var(--color-border);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

/* Secondary Button (Neutral Actions) */
.btn-secondary {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}
.btn-secondary:hover {
  background-color: var(--color-surface-muted);
  border-color: var(--color-border-hover);
}
.btn-secondary:active {
  background-color: var(--color-border);
}
.btn-secondary:focus-visible {
  border-color: var(--color-primary);
}

/* Danger Button (Destructive Triggers) */
.btn-danger-ghost {
  background-color: transparent;
  color: var(--color-danger);
  border: 1px solid transparent;
}
.btn-danger-ghost:hover {
  background-color: var(--color-danger-tint);
  border-color: var(--color-danger-border);
}
.btn-danger-ghost:active {
  background-color: var(--color-danger-border);
}
```

### 2. Form Fields

```css
.form-input,
.form-select {
  height: 30px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-input:hover,
.form-select:hover {
  border-color: var(--color-border-hover);
}

.form-input:focus,
.form-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-glow);
}
```

### 3. Sidebar Drag Cards & Lists

```css
/* Category Header Collapses */
.sidebar-category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) var(--space-sm);
  cursor: pointer;
  outline: none;
  user-select: none;
}

/* Drag Cards */
.sidebar-drag-card {
  padding: 12px 8px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: grab;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 120px;
  text-align: center;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar-drag-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
.sidebar-drag-card:active {
  cursor: grabbing;
}

/* Standard List Items */
.sidebar-list-item {
  width: 100%;
  padding: 8px 10px;
  background-color: transparent;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  color: var(--color-text-primary);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 6px;
}
.sidebar-list-item:hover {
  background-color: var(--color-primary-tint);
  color: var(--color-primary);
}
```

### 4. Modals & Dialogs

```css
/* Modal Overlay / Backdrop Scrim */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(28, 43, 44, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

/* Modal Content Container */
.modal-container {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: walflowFadeIn 0.2s ease-out;
  box-sizing: border-box;
}

/* Modal Header Area */
.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-surface-hover);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Modal Title */
.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

/* Modal Body area */
.modal-body {
  padding: 20px;
  overflow-y: auto;
}

/* Modal Footer / Actions Row */
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-surface-hover);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* Keyboard Shortcut KBD element style */
.modal-kbd {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  box-shadow: 0 1px 0 var(--color-border-hover);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 11px;
}
```

### 5. App Shell Bars

```css
/* Menu bar (row 1) and command bar (row 2) */
.shell-menubar   { height: var(--shell-menubar-h);    background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.shell-commandbar{ height: var(--shell-commandbar-h); background: var(--color-surface); border-bottom: 1px solid var(--color-border); gap: var(--space-md); padding: 0 var(--space-lg); }

/* Menu bar entries: text buttons, no border; open menu uses the active state */
.menubar-item         { height: 28px; padding: 0 var(--space-md); font-size: var(--fs-base); border-radius: var(--radius-sm); background: transparent; }
.menubar-item:hover,
.menubar-item[aria-expanded="true"] { background: var(--color-surface-muted); }

/* Dropdown menus and context menus share one look */
.menu      { min-width: 220px; padding: var(--space-sm); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); z-index: var(--z-popover); }
.menu-item { height: 28px; padding: 0 var(--space-md); font-size: var(--fs-base); display: grid; grid-template-columns: var(--icon-sm) 1fr auto; gap: var(--space-md); align-items: center; }
.menu-item kbd { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-text-muted); }

/* Activity rail: icon buttons with a visible active marker */
.shell-rail            { width: var(--shell-rail-w); background: var(--color-surface-muted); border-right: 1px solid var(--color-border); }
.rail-button           { width: 40px; height: 40px; border-radius: var(--radius-sm); color: var(--color-text-secondary); }
.rail-button[aria-pressed="true"] { color: var(--color-brand-dark); box-shadow: inset 2px 0 0 var(--color-primary); background: var(--color-surface); }

/* Status bar: quiet, one line, small text; items are buttons when they open a flyout */
.shell-statusbar { height: var(--shell-statusbar-h); background: var(--color-surface-muted); border-top: 1px solid var(--color-border); font-size: var(--fs-xs); color: var(--color-text-secondary); gap: var(--space-xl); padding: 0 var(--space-lg); }
.status-item     { height: var(--control-h-sm); display: inline-flex; align-items: center; gap: var(--space-sm); }
```

### 6. Canvas values

Every text a node shows under its symbol goes through two shared components; nodes pass data and never style text
themselves.

* **Node readout** (`frontend/src/nodes/NodeReadout.jsx`, passed as `BaseNode`'s `footer`): an optional name line,
  then rows of `{ label?, value, unit? }`, then optional secondary lines and optional status badges.
* **Status badge** (`frontend/src/components/common/StatusBadge.jsx`): the only coloured mark on a node. Kinds
  `neutral`, `success`, `warning`, `danger`, `info`; always words (OFF, OPEN, BURST, HH), never colour alone. The
  same component is used in the inspector results views.

```css
.node-readout        { font-family: var(--font-sans); text-align: center; line-height: 1.25; }
.node-readout-name   { font-size: var(--fs-canvas-meta); font-weight: 700; color: var(--color-text-primary); }
.node-readout-value  { font-size: var(--fs-canvas-value); font-weight: 600; color: var(--color-brand-dark); font-variant-numeric: tabular-nums; }
.node-readout-unit   { font-weight: 500; }
.node-readout-meta   { font-size: var(--fs-canvas-meta); font-weight: 500; color: var(--color-text-secondary); }

.status-badge          { display: inline-flex; align-items: center; gap: var(--space-xs); padding: 0 var(--space-sm); border: 1px solid; border-radius: var(--radius-full); font-size: var(--fs-canvas-meta); font-weight: 700; line-height: 1.5; }
.status-badge-neutral  { color: var(--color-text-secondary);      background: var(--color-surface-muted); border-color: var(--color-border); }
.status-badge-success  { color: var(--color-success-text);        background: var(--color-success-tint);  border-color: var(--color-success-border); }
.status-badge-warning  { color: var(--color-warning-text-strong); background: var(--color-warning-bg);    border-color: var(--color-warning-border); }
.status-badge-danger   { color: var(--color-danger-text);         background: var(--color-danger-tint);   border-color: var(--color-danger-border); }
.status-badge-info     { color: var(--color-info-text);           background: var(--color-info-tint);     border-color: var(--color-info-border); }
```

Rules:

* **A number never carries colour**, whatever its sign, size or state: heater duty, a setpoint, an outlet
  temperature, an alarm limit are all values in `.node-readout-value`. A sign stays a sign (heating positive).
* Colour on a node is allowed only on a state: the status badge, or the `BaseNode` warning icon
  (`--color-danger-text`). Pipe heatmap colours are the one exception, because a legend explains them.
* Port identities are not values and may keep a colour, from tokens only: the diagram tokens (`--color-inlet`,
  `--color-outlet`, `--color-port-neutral`) for ports, `--color-danger-text` for a three-way valve's hot port letter.
* Symbol strokes use tokens too (for example the rupture disc symbol).
* Helper classes in `index.css` for the rest of the node text: `.node-readout-row/-label/-badges`,
  `.symbol-text-meta/-value` (SVG letters in symbols), `.port-letter-hot/-cold`, `.instrument-*`, `.note-*`
  (text bubble sizes from `--fs-*`), `.node-warning-icon`, `.node-off-badge`.
* No hex literals, numeric `fontSize` or inline colour styles in `frontend/src/nodes/`; a static guard test
  (`src/test/styleGuard.test.js`) enforces it.

---

## App Shell & Layout

What goes into each region, and the rules for adding to it, are in the `walflow-ui-layout` skill. This section
fixes the geometry.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Menu bar 40  Logo  File Edit View Simulation Tools Help  Drawing·saved  User │
├──────────────────────────────────────────────────────────────────────────────┤
│ Command bar 44  Undo  Redo  |  Run Simulation  |  Case ▾      panel toggles  │
├────┬────────────┬───────────────────────────────────────────┬────────────────┤
│Rail│ Side pane  │ Canvas (min 480×320)                      │ Inspector      │
│ 48 │ 288        │                                           │ 320, full      │
│    │            ├───────────────────────────────────────────┤ height         │
│    │            │ Results panel 280 (collapsed 36)          │                │
├────┴────────────┴───────────────────────────────────────────┴────────────────┤
│ Status bar 28  run result · case · solve time · warnings  units · zoom       │
└──────────────────────────────────────────────────────────────────────────────┘
```

* **Grid:** the shell is one CSS grid filling the window (`height: 100%`, no page scroll). Only pane, inspector,
  results and dialog bodies scroll.
* **Spacing:** multiples of 4 px, from the `--space-*` tokens. Panel padding `--space-lg`; gaps between groups
  `--space-md`; between sections `--space-2xl`.
* **Splitters:** between side pane and canvas, canvas and inspector, canvas and results panel. 4 px hit area
  (8 px with padding), keyboard arrows step 24 px (Shift: 80 px), sizes remembered per browser.
* **Canvas minimum:** `--shell-canvas-min-w` × `--shell-canvas-min-h`. A pane that would push the canvas below it
  opens as an overlay over the canvas instead of docking.

### Breakpoints (window width)

| Name | Width | Shell behaviour |
|---|---|---|
| Wide | ≥ 1440 px | Side pane, inspector and results panel all docked. |
| Large | 1008-1439 px | Docked while the canvas minimum holds; otherwise the side pane overlays when the inspector opens (below 1136 px = rail + pane + inspector + canvas minimum). |
| Medium | 768-1007 px | Side pane and inspector open as overlays (`--z-pane-overlay`, shadow-lg, close on Esc or outside click). Results panel starts collapsed. Command bar shows icons with tooltips; Run keeps its label. Drawing name truncates. |
| Small | < 768 px | Best effort only: same as medium, no layout guarantees. |

Breakpoints are the Windows app breakpoints (641 / 1008 px) adapted to WalFlow's 768 px floor, plus a wide state.

Status bar slots hide one by one as the window narrows: zoom below 1008 px, selection below 900 px, units below
820 px. Below 1008 px the menu bar also hides the app version and the project path, and the lock chip shows a lock
icon plus the holder's name, "Editing" or "Other tab".

### Layers

Use the `--z-*` tokens only. Canvas overlays never sit above menus; menus never above dialogs; toasts sit above
everything and never block input.

---

## Style Guidelines

*   **Exaggerated Minimalism:** Leverage plenty of empty canvas workspace offset by tight, functional editor sidebars. High contrast borders and flat colors are preferred over heavy shadows and background gradients.
*   **SVG-Only Rule:** All structural icons must be vector-based. Use Phase 1 SVG symbols from `IconLibrary.jsx`. Do not use emojis inside structural buttons or navigation blocks.
*   **Focus Ring Accessibility:** Keyboard outlines must always be visible. Always define `:focus-visible` styling using `outline` offsets or shadow glow rings.
*   **Consistent Motion Ease:** CSS transition durations must stay in the 150-200ms range using native `cubic-bezier(0.4, 0, 0.2, 1)` easing.

---

## Pre-Delivery Checklist

Before delivering code changes, ensure compliance:
- [ ] No structural emojis are in use (vector SVG elements only).
- [ ] Proper `cursor-pointer` or cursor grab semantics exist for interactive triggers.
- [ ] Focused elements have visual ring indicators (keyboard navigation compliance).
- [ ] Contrast ratios meet WCAG AA standards.
- [ ] Transitions remain fluid (150-200ms) with no layout jitter or shifting.
- [ ] Colours, sizes, spacing and z-index come from the tokens above; no new hex or raw z-index values.
- [ ] Icon-only buttons have an accessible name and a tooltip with the shortcut.
- [ ] The shell holds at 1920, 1440, 1280, 1024 and 768 px wide: nothing clipped, canvas minimum kept.
