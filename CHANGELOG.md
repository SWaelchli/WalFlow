# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.1.2]

- Fixed pipe selection and deletion conflict by migrating ReactFlow edge IDs to unique random UUIDs.
- Implemented dynamic label scanning to assign sequential human-readable labels to newly created and duplicated pipes.
- Implemented case variable base-value equivalence check to automatically clear overrides when matching base case values.
- Implemented automatic version upgrade to current APP_VERSION for cloud diagrams upon opening.
- Added support for fully closed (0%) linear control valves in the UI and implemented a stiff linear resistance model in the backend physics simulation to block flow completely.
