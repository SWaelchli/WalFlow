---
name: ui-ux-pro-max
description: Design guide for desktop applications (web apps used in a desktop browser, and native Windows apps), with a searchable base of 67 styles, 161 color palettes, 57 font pairings, 99 UX guidelines, 25 chart types and 22 technology stacks. Use for any visual or interaction change, design system work, UI review or UI bug in WalFlow.
---
# ui-ux-pro-max

Design guide for **desktop applications**: web apps used in a desktop browser with mouse and keyboard, and native
Windows apps. It holds a searchable base of styles, palettes, font pairings, UX guidelines, chart types and stack
guidelines, and a generator that turns them into a project design system.

Mobile apps (iOS, Android, React Native, Flutter) are out of scope by default. The data still holds mobile rules
(the `web` domain and the mobile stacks); use them only when the user explicitly builds a mobile app.

## In WalFlow

WalFlow already has a design system made with this skill. Use it before any search:

1. **Look:** [`design-system/walflow/MASTER.md`](../../../design-system/walflow/MASTER.md): tokens, type scale,
   components, app shell sizes. A page file in `design-system/walflow/pages/` overrides it for that page.
2. **Placement:** the `walflow-ui-layout` skill: which region a control belongs in, menus and commands, dialogs,
   status, breakpoints and the layout checklist.
3. **Generic advice:** this skill, for anything the two above do not decide.

Where they differ, MASTER.md wins over this skill, and `frontend/AGENTS.md` lists the order. Do not regenerate the
design system (`--design-system --persist`) for WalFlow: it would overwrite MASTER.md. Search single domains instead.

# Prerequisites

The bundled scripts need Python 3 (standard library only, no network). Check it is available:

```bash
python --version
```

If Python is not installed, **do not install it yourself**. Ask the user to install Python 3, then continue. Never
run package-manager or system-changing commands for this skill. Without Python, skip the searches and use the rules
in this file.

Run the scripts from the repository root: `python .claude/skills/ui-ux-pro-max/scripts/search.py ...`
(use `python3` on macOS and Linux). On Windows set `PYTHONIOENCODING=utf-8` if the output shows garbled characters.

---

## How to Use This Skill

| Scenario | Trigger examples | Start from |
|----------|-----------------|------------|
| **New project / page** | "Build a dashboard", "Add an admin page" | Step 1 → Step 2 (design system) |
| **New component** | "Add a results table", "Add a modal" | Step 3 (domain search: style, ux) |
| **Choose style / color / font** | "What style fits an engineering tool?" | Step 2 (design system) |
| **Review existing UI** | "Review this page for UX issues", "Check accessibility" | Desktop rules and checklist below |
| **Fix a UI bug** | "Button hover is broken", "Layout shifts on load" | Desktop rules → relevant section |
| **Improve / optimize** | "Make the table faster", "Fix the layout on small windows" | Step 3 (domain search: ux, react) |
| **Implement dark mode** | "Add dark mode support" | Step 3 (domain: style "dark mode") |
| **Add charts / data viz** | "Add a pump curve chart" | Step 3 (domain: chart) |
| **Stack best practices** | "React performance tips", "WinUI navigation" | Step 4 (stack search) |

### Step 1: Analyze User Requirements

Extract from the request:
- **Product type**: tool (editor, simulator, converter), productivity, dashboard, content site, or hybrid.
- **Audience and context**: for WalFlow, professional engineers at work, on laptops and large monitors, often
  with two windows side by side.
- **Style keywords**: minimal, dense, content-first, dark mode, etc.
- **Stack**: infer it from the project (package.json, existing files) or ask, then load its rules with
  `--stack <name>`. WalFlow is `react`. For desktop interaction patterns also search `--stack winui` or `--stack wpf`.
- **Platform**: desktop unless the user says otherwise. Mobile-only concerns (safe areas, haptics, bottom
  navigation, Dynamic Type, 44 pt touch targets) do not apply.

### Step 2: Generate Design System (new projects only)

**Start a new project with `--design-system`** to get recommendations with reasoning:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This command:
1. Searches domains in parallel (product, style, color, landing, typography)
2. Applies reasoning rules from `ui-reasoning.csv` to select best matches
3. Returns a complete design system: pattern, style, colors, typography, effects
4. Includes anti-patterns to avoid

**Example:**
```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "engineering simulation desktop tool" --design-system -p "Flow Lab"
```

### Step 2b: Persist Design System (Master + Overrides Pattern)

To save the design system for retrieval across sessions, add `--persist`:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
```

This creates:
- `design-system/<project>/MASTER.md`: global source of truth with all design rules
- `design-system/<project>/pages/`: folder for page-specific overrides

**With page-specific override:**
```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name" --page "dashboard"
```

This also creates `design-system/<project>/pages/dashboard.md`: page-specific deviations from Master.

**How hierarchical retrieval works:**
1. When building a specific page (e.g. "Catalogue"), first check `design-system/<project>/pages/catalogue.md`
2. If the page file exists, its rules **override** the Master file
3. If not, use `design-system/<project>/MASTER.md` exclusively

Persisted files are edited by hand afterwards. Re-running `--persist` overwrites them.

### Step 2c: Design Dials (optional)

Three optional 1-10 sliders that tune `--design-system` output without changing your query:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --variance <1-10> --motion <1-10> --density <1-10>
```

| Dial | Low (1-3) | Mid (4-7) | High (8-10) |
|------|-----------|-----------|-------------|
| `--variance` | Centered / minimal (biases toward Minimalism-style categories) | Balanced / modern | Bold / asymmetric (biases toward Brutalism, Bento Grids) |
| `--motion` | Subtle micro-interactions | Standard scroll/stagger motion | Complex choreography (pin, Flip, SplitText) |
| `--density` | Spacious (24-96px spacing scale) | Standard (16-64px, default) | Dense/editor/dashboard (8-32px spacing scale) |

- `--motion` attaches a GSAP snippet matched to the resolved tier.
- `--density` overrides the `--space-*` table in the output. Desktop tools and editors are usually 7-9.
- Leaving a dial unset keeps that part of the output unchanged.

### Step 3: Supplement with Detailed Searches (as needed)

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

| Need | Domain | Example |
|------|--------|---------|
| Product type patterns | `product` | `--domain product "saas dashboard"` |
| More style options | `style` | `--domain style "minimalism dark"` |
| Color palettes | `color` | `--domain color "industrial professional"` |
| Font pairings | `typography` | `--domain typography "technical modern"` |
| Chart recommendations | `chart` | `--domain chart "real-time dashboard"` |
| UX best practices | `ux` | `--domain ux "keyboard focus loading z-index"` |
| React performance | `react` | `--domain react "rerender memo list"` |
| Icon suggestions | `icons` | `--domain icons "phosphor toolbar"` |
| Individual Google Fonts | `google-fonts` | `--domain google-fonts "variable sans serif"` |
| GSAP animation snippets | `gsap` | `--domain gsap "subtle"` |
| Marketing pages only | `landing` | `--domain landing "hero pricing"` |
| Mobile apps only | `web` | `--domain web "touch targets safe areas"` |

### Step 4: Stack Guidelines

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack <stack>
```

For desktop shells (menu bar, command bar, navigation pane, title bar, responsive window states) search
`--stack winui` or `--stack wpf` even for a web app: the patterns carry over, the code does not.

---

## Search Reference

### Available Domains

| Domain | Use For | Example Keywords |
|--------|---------|------------------|
| `product` | Product type recommendations | SaaS, dashboard, tool, portfolio, healthcare |
| `style` | UI styles, colors, effects | minimalism, flat, dark mode, glassmorphism |
| `typography` | Font pairings, Google Fonts | professional, technical, modern |
| `color` | Color palettes by product type | saas, fintech, industrial, healthcare |
| `landing` | Marketing page structure, CTA strategies | hero, testimonial, pricing |
| `chart` | Chart types, library recommendations | trend, comparison, timeline |
| `ux` | Best practices, anti-patterns | accessibility, keyboard, z-index, loading, forms |
| `gsap` | GSAP animation skeletons by intensity tier | subtle, stagger, page transition |
| `react` | React/Next.js performance | waterfall, bundle, suspense, memo, rerender |
| `web` | Mobile app interface guidelines (iOS/Android/React Native) | touch targets, safe areas, Dynamic Type |
| `icons` | Icon recommendations with import code | arrow, navigation, phosphor |
| `google-fonts` | Individual Google Fonts lookup | sans serif, monospace, variable font |

### Available Stacks

Desktop and web: `react`, `nextjs`, `vue`, `svelte`, `astro`, `angular`, `nuxtjs`, `nuxt-ui`, `html-tailwind`,
`shadcn`, `laravel`, `threejs`, `wpf`, `winui`, `uwp`, `avalonia`, `uno`, `javafx`.
Mobile: `swiftui`, `react-native`, `flutter`, `jetpack-compose`.

---

## Example Workflow

**User request:** "Add a results dashboard to our engineering tool."

1. **Analyze:** tool for professional engineers, dense and content-first, light theme, stack `react`, desktop.
2. **Design system:** the project has one, so read `design-system/<project>/MASTER.md` and any page file. Without
   one: `search.py "engineering simulation dashboard dense" --design-system --density 8`.
3. **Detailed searches:**
   ```bash
   python .claude/skills/ui-ux-pro-max/scripts/search.py "dense table comparison" --domain chart
   python .claude/skills/ui-ux-pro-max/scripts/search.py "table sorting keyboard loading" --domain ux
   ```
4. **Stack:** `search.py "table virtualization memo" --stack react`, and
   `search.py "command bar navigation pane" --stack winui` for the shell pattern.

**Then:** combine the design system with the searches, apply the desktop rules below, implement.

---

## Output Formats

```bash
# ASCII box (default) - best for terminal display
python .claude/skills/ui-ux-pro-max/scripts/search.py "fintech" --design-system

# Markdown - best for documentation
python .claude/skills/ui-ux-pro-max/scripts/search.py "fintech" --design-system -f markdown
```

---

## Tips for Better Results

- Use **multi-dimensional keywords**: product + industry + tone + density, e.g.
  `"engineering editor dense professional"`, not just `"app"`.
- Try different keywords for the same need: `"technical minimal"` → `"industrial flat"` → `"content-first dense"`.
- Use `--domain` to deep-dive any dimension you are unsure about, and `--stack` for implementation details.

| Problem | Where to look |
|---------|---------------|
| Can't decide on style/color | `--domain style` / `--domain color` with other keywords (new projects: re-run `--design-system`) |
| Dark mode contrast issues | Desktop rules: Color and theming |
| Animations feel unnatural | Desktop rules: Motion; `--domain ux "animation easing"` |
| Form UX is poor | Desktop rules: Forms; `--domain ux "inline validation error focus"` |
| Navigation or commands feel confusing | Desktop rules: Window layout and Commands; `--stack winui "navigation command bar"` |
| Layout breaks on small windows | Desktop rules: Window layout; check every breakpoint width |
| Performance / jank | `--domain react "rerender memo list virtualize"` |

---

## Desktop Rules for Professional UI

These rules apply to every desktop UI. A project design system (WalFlow: MASTER.md) may set stricter values.

### Icons & Visual Elements

- Default icon library: **Phosphor (`@phosphor-icons/react`)**. `data/icons.csv` lists common choices, not the
  full set. If nothing fits there, pick from the full Phosphor set; Heroicons (`@heroicons/react`) is the fallback,
  matching stroke, fill and corner style.

| Rule | Standard | Avoid |
|------|----------|-------|
| **No emoji as structural icons** | Vector icons from one family | Emoji for navigation, settings or system controls |
| **Vector only** | SVG icons that scale and theme | Raster PNG icons |
| **Icon sizes as tokens** | 16 px in menus and dense rows, 20 px in toolbars and command bars | Arbitrary 18/22/26 px mixes |
| **Stroke and fill discipline** | One stroke width and one style (outline or filled) per hierarchy level | Mixed thick/thin or filled/outline at the same level |
| **Icon-only buttons are labelled** | `aria-label` plus a tooltip naming the action and its shortcut | Bare glyphs the user must guess |
| **Icon contrast** | 3:1 for UI glyphs, 4.5:1 for small text-like icons (WCAG) | Glyphs that blend into the surface |
| **Correct brand assets** | Official logos with clear space | Recoloured or distorted logos |

### Pointer & Keyboard Interaction

| Rule | Do | Don't |
|------|----|-------|
| **Hover, focus and pressed states** | Every interactive element shows hover, `:focus-visible` and pressed states within 100-150 ms | Controls that look the same in every state |
| **Pointer targets** | At least 24×24 CSS px hit area (WCAG 2.5.8); 28-32 px for toolbar buttons | Tiny icons with no padding |
| **Cursors** | `pointer` for actions, `grab`/`grabbing` for drag, `text` for inputs, `not-allowed` for disabled | Default arrow on clickable elements |
| **Keyboard first** | Every command reachable by keyboard; Tab order follows the visual order; Esc closes the top layer | Mouse-only actions |
| **Shortcuts** | Standard ones (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+C/V, Del, F2, F5 where free); shown in menus and tooltips | Overriding browser-reserved keys (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Tab, Alt+letter in browsers) |
| **Context menus** | Right-click offers the commands for what is under the pointer, with shortcuts | Commands that exist only in a context menu |
| **Tooltips** | Delay ~500 ms, name the action, show the shortcut | Tooltips as the only place for essential information |
| **Disabled state** | Native `disabled`, reduced emphasis, explanation in a tooltip where useful | Controls that look active but do nothing |
| **Drag and drop** | Visible drop target, Esc cancels, keyboard or menu alternative | Drag as the only way to do something |
| **Stable states** | Hover and press change colour, border or shadow only | Transforms that move neighbouring content |

### Window Layout

| Rule | Do | Don't |
|------|----|-------|
| **Regions, not a scrolling page** | Fixed app shell (title/menu, panes, status bar); only content areas scroll | Whole-page scroll in an app |
| **Windows breakpoints** | Design for window width, not device: small < 641 px, medium 641-1007 px, large ≥ 1008 px; add a wide state (e.g. ≥ 1440 px) for docked side panes | One fixed layout for every width |
| **Collapse, don't clip** | Panes collapse to rails or overlays, commands move into overflow menus, labels shorten to icons with tooltips | Controls pushed off-screen or overlapping |
| **Protect the main content** | A minimum size for the main work area (canvas, document, table) that panels may not take | Side panels that squeeze the work area to nothing |
| **Resizable panels** | Splitters with keyboard support (arrow keys), remembered sizes, min and max widths | Fixed widths that ignore the window |
| **4 px grid** | Sizes, margins and positions in multiples of 4 px; spacing from tokens | Random 5/7/13 px values |
| **Density** | Compact controls (28-32 px high) for tools and editors; roomier for occasional-use pages | Mobile-sized controls in a desktop editor |
| **Text measure** | Long text max ~70 characters wide, even in wide panels | Edge-to-edge paragraphs |
| **Layering** | z-index from a small set of tokens (content, sticky, overlay, menu, dialog, toast) | Ad-hoc z-index values like 9999 |

### Commands, Dialogs & Feedback

| Rule | Do | Don't |
|------|----|-------|
| **One home per command** | Every command defined once and shown in the menu bar; frequent ones also in a command bar, context menu and shortcut | The same action built separately in several places, or an action with no menu entry |
| **Menu conventions** | File, Edit, View, then app menus, Help last; verbs first; "…" when a dialog follows; separators group related items; disabled rather than hidden | Hidden commands that appear and vanish |
| **One primary action per view** | A single accent-coloured button for the main task | Several competing primary buttons |
| **Dialogs only for blocking decisions** | Unsaved work, permanent delete, overwrite, sign-in | Confirmations for reversible actions; prefer undo |
| **Status has a place** | Persistent state in a status bar or inline info bar; transient confirmation in a toast | State that only appears in a toast and disappears |
| **Loading feedback** | Progress indicator for anything over ~300 ms; the UI stays responsive | Frozen UI without feedback |
| **Errors** | Say what went wrong and how to fix it, next to the cause | Raw exception text, colour-only errors |

### Forms

| Rule | Do | Don't |
|------|----|-------|
| **Labels** | Visible label for every field; unit in the label or as a suffix | Placeholder as the only label |
| **Validation** | Inline, on blur or submit, with a message next to the field | Errors only in a toast |
| **Focus** | First field focused in dialogs; focus returns to the trigger on close | Focus lost to the page body |

### Color and Theming

| Rule | Do | Don't |
|------|----|-------|
| **Token-driven** | Semantic colour tokens for surfaces, text, borders and states | Hard-coded hex values in components |
| **Text contrast** | Body text ≥ 4.5:1, large text and UI glyphs ≥ 3:1, in every theme | Light grey body text |
| **Colour is never alone** | Pair state colours with an icon, label or pattern | Red/green as the only signal |
| **Theme parity** | Hover, focus, selected and disabled states defined for each theme | States defined for one theme only |
| **Scrims** | Modal scrim strong enough to separate the dialog (40-60 % dark) | Weak scrims that let the background compete |

### Motion

- Transitions 150-200 ms with `cubic-bezier(0.4, 0, 0.2, 1)`; exits faster than entrances.
- Respect `prefers-reduced-motion`.
- No motion that delays the user's next action.

---

## Pre-Delivery Checklist

Before delivering UI code, verify:

### Visual Quality
- [ ] No emoji used as icons; one icon family and style
- [ ] Colours, spacing, radius, type sizes and z-index come from tokens (no new hard-coded values)
- [ ] Hover and press states do not shift layout

### Interaction
- [ ] Every interactive element has hover, focus-visible, pressed and disabled states
- [ ] Hit areas ≥ 24×24 px; icon-only buttons have an accessible name and a tooltip
- [ ] Every command works from the keyboard; shortcuts do not clash with the browser
- [ ] Dialogs trap focus, close on Esc, and return focus to the trigger

### Window Layout
- [ ] Checked at 1920, 1440, 1280, 1024 and 768 px wide (and a short window, ~720 px high)
- [ ] Nothing is clipped or pushed off-screen; panes collapse instead
- [ ] The main work area keeps its minimum size; only content regions scroll
- [ ] Spacing follows the 4 px grid

### Color and Theme
- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for large text and glyphs) in every theme shipped
- [ ] Colour is never the only indicator

### Accessibility
- [ ] Landmarks (`header`, `nav`, `main`, `aside`, `footer`) and headings describe the regions
- [ ] Form fields have labels and clear error messages
- [ ] Selected, expanded and disabled states are exposed (`aria-selected`, `aria-expanded`, `disabled`)
- [ ] Reduced motion is respected; text zoom to 200 % does not break the layout
