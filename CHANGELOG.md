# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.1.5]

- Added the Calibrated Restriction component to represent bearings, clearances, and custom restrictors calibrated from baseline flow, temperature, and inlet/outlet pressures. Supports user-selectable Orifice, Laminar, and Quadratic simulation models with tooltip documentation.
- Implemented Newton solver stability fixes (smooth Fischer-Burmeister complementarity equations) for Safety Valves and Rupture Discs to eliminate step-change discontinuities during iterations.
- Resolved temperature locking in flow mixers and pass-through nodes to correctly propagate startup temperatures during warm starts.
- Redeveloped the Heat Exchanger (Cooler) to support Water Cooled and Air Cooled types.
- Implemented three design rating methods for the cooler: Specify Rated Duty, Specify Design Temperatures (utilizing exact e-NTU mathematical inversion), and Specify Heat Transfer Coefficient (UA).
- Updated the Property Editor UI for the Cooler to support dynamic conditional rendering of fields and intuitive rated pressure drop input specification.
- Updated WälFlow UI pressure unit designations to explicitly show bar(a) (absolute pressure) and bar(d) (differential pressure) across the property editor, details panels, canvas node indicators, data list tabs, and exported reports.
- Upgraded the generic node and pipe detail panels to show a compact engineering table with dynamic flow path visualization, Inlet/Outlet pressures, fluid velocities, Reynolds numbers, and pressure gradient in mbar(d)/m.
- Implemented UI/UX modernization including a centralized custom SVG IconLibrary, index.css design tokens, a unified tabbed right-hand InspectorPanel, and horizontal layout positioning to prevent canvas compression.
- Polished the Navbar and Sidebar to replace emojis with vector icons, migrated inline styling to standard CSS classes, and cleaned up JavaScript mouse hover event listeners.
- Audited accessibility, verified focus outline states, and added full keyboard event and role support to collapsible panels.
- Refactored system modals (Admin Setup, Login, Project Manager, Help & Info, and Admin Hub) and canvas overlays (Case Manager and Heatmap Legend) to replace structural emojis with custom SVG icons, map all style parameters to design system CSS variables, and eliminate custom JavaScript hover handlers.
- Renamed the setup and results inspector sub-components to SetupPanel and ResultsPanel, refactored all 9 system detail panels and data tables to follow standard layout and typography sizes, and patched a runtime ReferenceError crash on the operating case matrix table.
- Realigned canvas nodes, handles, sensing pins, and pipe/signal edges to inherit unified styling color tokens, eliminated hardcoded visual hex colors, replaced annotations pushpin emoji with clean vector SVG representation, and eliminated duplicate selection border outlines by removing custom wrappers in favor of ReactFlow standards.
- Removed the legacy HYBR (Powell Hybrid) solver, kept LM (Least-Squares) as a secondary solver option, and configured LM as the automatic fallback for the Sparse Newton solver.
- Refined the solver telemetry to propagate pressures bidirectionally through pruned dead-end branches under zero flow, correctly isolating closed pressure safety valve and rupture disc seats and ensuring a zero pressure drop profile in return headers.
- Fixed Three-Way Temperature Control Valve (TCV) hot-side bias under temperature inversion to always respect physical control direction (opening the hot port when outlet temperature is below setpoint).

