---
slug: it-admin
name: Engineering IT Administrator
locked: 2026-10-28
---

# Engineering IT Administrator

## Who they are
IT administrator for an engineering department. Deployed WalFlow with Docker Compose on
an internal server and runs the Admin Hub: creates users, resets access, disables
leavers. Strong with Linux, Docker and reverse proxies; knows nothing about hydraulics
and does not need to.

## Goals (what they want to do)
- Create the first admin and the first ten user accounts in under 10 minutes
- Disable a leaver and know their access ended at once
- Tell users what went wrong when they say "I cannot log in"
- Upgrade to a new release without logging everyone out by surprise

## Constraints
- Opens WalFlow only for admin tasks, a few times a month
- Never opens a diagram; the canvas is not their concern
- Works on 1920x1080, often over a VPN with extra latency

## Pain triggers (what makes them close the tab)
- Admin actions with no confirmation of what happened (was the user disabled?)
- Destructive actions (delete user, demote) with vague confirmation copy
- A refused action ("last administrator") with no explanation of why
- Login failing on plain HTTP with no hint about the secure-cookie setting
- Having to find the Admin Hub inside an engineering menu

## Wins (what makes them come back)
- The user list shows role, status and last login in one table
- Every admin action shows a clear result message
- The version number is visible so they know which release is running

## How to audit AS this persona
- Start from a fresh install with no users (Admin Setup)
- Walk the full user lifecycle: create, change role, disable, re-enable, delete
- Try to demote or delete the last administrator and read the message
- Read every admin label as someone who does not know what a P&ID is
- Ask before running deletes; use test accounts only
