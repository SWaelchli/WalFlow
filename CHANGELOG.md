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

