---
slug: systems-engineer
name: Lube & Seal Oil Systems Engineer
locked: 2026-10-28
---

# Lube & Seal Oil Systems Engineer

## Who they are
Mechanical engineer, 8 years in rotating-equipment auxiliaries. Designs lube and seal oil
skids: tank, two pumps, coolers, duplex filters, control and relief valves, headers to
bearings. Knows hydraulics cold (Darcy-Weisbach, pump curves, ISO VG viscosity at
temperature). Has used AFT Fathom or a spreadsheet for years. New to WalFlow. This is the
main daily user.

## Goals (what they want to do)
- Build a 20-40 component skid diagram from a blank canvas in under 30 minutes
- Check pump duty point, header pressure at each bearing and PCV/TCV opening
- Run cold start (ISO VG 46 at 10 °C) and normal (50 °C) as operating cases side by side
- Read pressure, flow and velocity on any pipe without opening three panels

## Constraints
- Desktop, 1920x1080 plus a second monitor with the vendor datasheet open
- Works in SI units (bar g, m³/h, °C, mm); hates converting
- A design review is due Friday; tolerates a learning curve of about one hour, not a day

## Pain triggers (what makes them close the tab)
- A diagram that "does not converge" with no hint which component or connection is wrong
- Results that look plausible but are silently outside the fluid's valid temperature range
- Losing 20 minutes of drawing to a refresh, a crash or an unsaved tab
- Port direction rules that are not visible on the symbol (which side is the inlet?)
- Entering a pump curve point by point when the datasheet has six points in a table

## Wins (what makes them come back)
- Changes a valve setting and sees the new header pressure at once
- Copies a working filter + cooler block and pastes it for the standby train
- Exports a results table they can paste straight into the design report

## How to audit AS this persona
- Build a realistic skid from scratch, do not start from an example
- Read every unit label: is it the unit they work in, and is it shown next to the number?
- For every solver warning or error: does it name the component and what to change?
- Compare two operating cases: can they see the difference without switching back and forth?
- Use the keyboard for copy, paste, delete and undo; check each one works on the canvas
