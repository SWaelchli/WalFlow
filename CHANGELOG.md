# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.2.1]

### Security
- **Backend runs unprivileged**: the backend container now drops from root to an unprivileged user before starting the app, so the network-facing process is no longer root. `PUID`/`PGID` set the user and keep the data volume writable.
- **Pinned CI actions**: all GitHub Actions in the release workflow are pinned to commit SHAs, so a moved tag on a third-party action can no longer change what runs with registry-publish rights.

---
