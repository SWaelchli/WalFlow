# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [Unreleased]

### Changes
- **Pressure unit labels**: absolute and gauge pressures now read "bar(a)" / "bar(g)" (was "bar a" / "bar g") across the app, messages and docs. Differential pressure stays "bar"; imperial labels stay psia / psig / psi.
- **Units in labels and headers**: units beside a label are now in square brackets, e.g. "Set Pressure [bar(g)]", "Flow [m³/h]".
- **Remaining unit labels in brackets**: the inspector's NPSH, temperature, length, power and ΔP fields now show units in square brackets too.
- **Palette symbols use design tokens**: the Components pane symbols take their colours from the design tokens (strokes now match the canvas nodes).
- **Valve Results chart**: control valves and regulators get a two-view chart: ΔP – Flow (current and full-open curve, operating point, headroom to full open) and Flow – Cv (flow over Cv at the operating ΔP with the 20-80 % control range). New result rows: valve ΔP, max flow at full open, capacity used.
- **Regulator viscosity correction**: the pressure regulator now uses the IEC 60534-2-1 Reynolds number factor like the control valves, with valve style, F_L and F_d inputs. Results change only for viscous liquids or very low flow; older files load with the default style.
- **Agent instructions made consistent**: skills, agent definitions and design docs agree on the gate, test naming, findings IDs, font tokens and the 1008 px editing width; the UX audit skill has WalFlow-specific rules; a test checks that paths named in instruction docs exist.

---
