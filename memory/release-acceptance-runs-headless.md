---
name: release-acceptance-runs-headless
description: "Agent UI acceptance passes on this Mac use the browser build in headless Playwright, not upstream's computer-use desktop-window skill"
metadata:
  node_type: memory
  type: project
  originSessionId: 2c3278a6-9ec5-4f4a-83c0-4f1e0be10727
  modified: 2026-11-13T03:57:09.989Z
---

Upstream's `testing-agent-ui-release` skill drives the real desktop window through computer use, and its `launch_isolated.py` assumes a Windows `.exe`. On this Mac, acceptance passes run the browser build instead: `gaia chat --ui` from a worktree, its own `GAIA_HOME` under the scratchpad, a team port (4210-4229), in headless Playwright at phone and desktop widths. Keep that skill's ground rules: read every screenshot before passing, match evidence to the claim, start from a fresh home once per pass.

**Why:** Rich's rule is no visible windows, and a pass has to be repeatable from a fresh home. His own install has been a development install since 2026-11-12 ([[installed-gaia-is-dev]]), but a pass that starts from his state can't be repeated.
**How to apply:** use this for any "does build N work" pass until native or desktop-shell work needs the packaged app; then ask Rich before anything opens a window. Run Playwright on a cached headless shell through `GAIA_VISUAL_CHROMIUM`, never `npx playwright install` ([[no-playwright-install]]). Gated jobs for MVP work run as `AGENT_HOST_HEAVY_CLASS=release` (the overlay's Shared facts, Gate). See [[release-lane-role]].
