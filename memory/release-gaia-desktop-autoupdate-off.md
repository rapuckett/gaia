---
name: release-gaia-desktop-autoupdate-off
description: "Rich's gaia-desktop offers updates but never installs one by itself, so his version changes only when he clicks to update or Release installs one"
metadata:
  node_type: memory
  type: project
  originSessionId: 2c3278a6-9ec5-4f4a-83c0-4f1e0be10727
  modified: 2026-11-13T01:28:42.293Z
---

Since 2026-11-12 Rich runs gaia-desktop 0.25.4 (Release updated it from 0.25.0 on his go). At each launch 0.25.4 checks `hub.amd-gaia.ai` (logged in `~/.gaia/electron-updater.log`) and offers a newer final release. Automatic download and install are off by default and he has no `~/.gaia/update-config.json`, so nothing installs unless he clicks to update. 0.25.0 had no update feed at all.

**Why:** his version can now move without the team doing anything, the moment he accepts an offered update.
**How to apply:** check his installed version before quoting him labels or steps, never assume it from the record. Since 2026-11-12 it's a development install ([[installed-gaia-is-dev]]), so installing a build needs no go, but tell him and record what changed. See [[release-owner-install-passive-check]] and [[release-lane-role]].
