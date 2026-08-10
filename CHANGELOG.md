# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [Unreleased]

### Fixed

- Batch solve matrix no longer uses a hardcoded `localhost` backend URL; it now uses the relative `/api/simulation/batch` endpoint, fixing the CORS / `ERR_FAILED` error when deployed behind a reverse proxy (e.g. Cloudflare).

---
