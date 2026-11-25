# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.2.3] - Unreleased

### Features
- **Pump results chart**: the flow range follows the pump's rated flow, the curve stops at zero head, the pressure axis starts at 0 with round ticks, and the system curve is an estimate with static head (fitted to the solved slope at the operating point). New Pressure | Head toggle, "Flow (% of rated)" row, and warnings for reverse flow and operation past zero head.

### Fixes
- **Rupture disc**: bursts on the pressure difference across it (ISO 4126-2), so a disc into a pressurised outlet no longer bursts early; rated capacity at the burst differential + 10 %. The inspector labels the burst pressure as Δp, and the results show the inlet pressure at which the disc bursts and its backpressure.
- **Results charts**: the operating point is always a vertex of the valve and pump curves (it could be dropped when two chart flows coincided).

---
