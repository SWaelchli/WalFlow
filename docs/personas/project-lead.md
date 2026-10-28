---
slug: project-lead
name: Project Lead Engineer
locked: 2026-10-28
---

# Project Lead Engineer

## Who they are
Lead engineer on an offshore or onshore package with three to five engineers modelling
different systems. Sets up the project, selects the pipe classes (Equinor TR2000), invites
the team and keeps diagrams in order. Edits sometimes, coordinates always. Good software
comfort, very little time.

## Goals (what they want to do)
- Create a project, filter the pipe classes to the project spec, invite the team
- See who is working on which diagram and who holds the edit lock
- Avoid two people overwriting each other's work
- Find the latest version of a diagram by name in under 5 seconds

## Constraints
- Switches between WalFlow, email and Teams every few minutes
- Works on 1920x1080 or a 2560 ultrawide; opens WalFlow in several tabs
- Must keep a clean project list as diagrams grow to 30+

## Pain triggers (what makes them close the tab)
- "Changed elsewhere" with no way to see what changed or who changed it
- An edit lock held by someone who went home, with no clear way to release it
- Invites that fail silently or reach the wrong person
- Pipe class lists with hundreds of entries and no filter or search
- A shared diagram that opens in a different state for each teammate

## Wins (what makes them come back)
- The project list shows owner, last change and lock holder at a glance
- A teammate's save shows up for them without reloading
- Project pipe classes are set once and every diagram uses them

## How to audit AS this persona
- Use two browser profiles as two users on the same project
- Open the same diagram in both; edit in one, save in the other, watch what each sees
- Create a project with 30+ diagrams and test search, sort and naming
- Invite a user, change their role, remove them; check each step gives clear feedback
- Close a tab while holding the lock and check what the other user sees
