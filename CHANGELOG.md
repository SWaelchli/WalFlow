# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.2.3] - Unreleased

### Features
- **Pump results chart**: the flow range follows the pump's rated flow, the curve stops at zero head, the pressure axis starts at 0 with round ticks, and the system curve is an estimate with static head (fitted to the solved slope at the operating point). New Pressure | Head toggle, "Flow (% of rated)" row, and warnings for reverse flow and operation past zero head.

### Fixes
- **Rupture disc**: bursts on the pressure difference across it (ISO 4126-2), so a disc into a pressurised outlet no longer bursts early; rated capacity at the burst differential + 10 %. The inspector labels the burst pressure as Δp, and the results show the inlet pressure at which the disc bursts and its backpressure.
- **Safety valve backpressure**: built-up backpressure now covers the flow of every device relieving into the same header, also valves that opened earlier (API 521), so the 10 % check of conventional valves no longer passes too easily.
- **Safety valve blowdown**: any blowdown from 0 to 100 % is used as entered (was capped at 50 %); a warning shows when it is outside the ISO 4126-1 range for liquids.
- **Relief opening order**: devices breached together open in the order of the inlet pressure at which they actually open (outlet + set for discs and conventional valves), not of their set pressure.
- **Shut-in sections around a closed relief device**: sections that only connect through a closed disc or conventional valve keep their leak-path pressure instead of being set to the device's opening pressure.
- **Results charts**: the operating point is always a vertex of the valve and pump curves (it could be dropped when two chart flows coincided).

---
