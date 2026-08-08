# Design System Master File (WalFlow)

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** WälFlow
**Version:** 0.1.5
**Design Dials:** Variance 3/10 (Clean Minimalism) | Motion 3/10 (Subtle Micro-interactions) | Density 8/10 (Compact Editor Density)

---

## Global Rules

### CSS Custom Variables & Tokens

```css
:root {
  /* Primary Accent (Action) */
  --color-primary: #FA8507;
  --color-primary-hover: #E07600;
  --color-primary-active: #C86900;
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
  --color-warning: #F59E0B;
  --color-danger: #EF4444;
  --color-info: #0284C7;

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

  /* Typography Pairing */
  --font-sans: 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace;
}
```

---

## Typography

*   **Font Family:** Inter (via Google Fonts or standard variable packages).
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
  background-color: #F4F7F6;
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
  background-color: #FEF2F2;
  border-color: #FEE2E2;
}
.btn-danger-ghost:active {
  background-color: #FEE2E2;
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
