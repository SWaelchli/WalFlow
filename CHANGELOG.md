# Changelog

All notable changes to the WälFlow project will be documented in this file.

---

## [0.1.3]
- Fixed vertical panel overlap between Scenario & Case Manager and Property Editor overlays on the right side of the canvas
- Implemented autoScale-aware dynamic top spacing with smooth CSS transitions for all right-hand panel overlays
- Added support for dynamic maxHeight boundaries and vertical scroll bar on Property Editor when pushed down
- Aligned Scenario & Case Manager design layout, typography, and close button with Heatmap Legend
- Compacted Scenario & Case Manager components and moved relief case explanations to tooltips
- Fixed unresponsive Run Simulation button by defaulting secure cookies to false in local development, enabling guest/unauthenticated simulations when running locally, and adding automatic frontend WebSocket reconnection upon login and connection drops
- Blocked backend application startup in production environments if `WALFLOW_SECRET_KEY` is not configured, and replaced the hardcoded secret fallback with an auto-generated random key in development environments (SEC-01)
- Enforced WebSocket simulation authentication requirement by default (`WALFLOW_REQUIRE_WS_AUTH=true`) across all environments to prevent unauthorized compute usage, while still allowing explicit disablement (SEC-02)

