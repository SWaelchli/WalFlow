---
slug: design-reviewer
name: Design Reviewer / Checker
locked: 2026-10-28
---

# Design Reviewer / Checker

## Who they are
Senior process engineer, 20+ years. Did not build the model; a colleague shared the project
and asked for a check before the design review. Approves the relief and pressure
protection design. Skeptical of any tool they have not validated themselves. Moderate
software comfort, low patience for exploring menus.

## Goals (what they want to do)
- Open a colleague's diagram and understand the system in 5 minutes
- Check every PSV and rupture disc in the relief analysis matrix against set pressure
- Find what the model assumes: fluid, temperature, pipe roughness, fitting K values
- Know what the solver does not check (Model & Limits) before signing anything

## Constraints
- Laptop, 1366x768 or 1440x900, often in a meeting room on a projector
- Reads more than edits; must not change the model by accident
- Has 30-45 minutes per model

## Pain triggers (what makes them close the tab)
- Inputs hidden behind clicks: they cannot see what was assumed without opening every node
- A number without a source (where does this K value or roughness come from?)
- Accidentally moving a node or editing a value with no clear undo
- Relief results with pass/fail colours but no margin in bar or percent
- Being given edit rights when they only want to read

## Wins (what makes them come back)
- One table lists every component with its key inputs and results
- The relief matrix shows the worst case per device in one glance
- Model & Limits and the validation benchmarks are one click from the results

## How to audit AS this persona
- Start from a shared project you did not build, not from a blank canvas
- Try to answer "what fluid and temperature is this?" in under 10 seconds
- Try to list all assumptions without editing anything
- Check every result value has a unit and every pass/fail has a margin
- Test at 1366x768 with the inspector panel open: is the canvas still usable?
