---
name: release-lane-role
description: "What gaia's Release and QA lane (AGENT_LANE=release) owns and where its record lives; read when acting as the release lane"
metadata:
  node_type: memory
  type: project
  originSessionId: 2c3278a6-9ec5-4f4a-83c0-4f1e0be10727
  modified: 2026-11-12T22:45:35.673Z
---

In gaia (Rich's fork `rapuckett/gaia`), the Release and QA lane (AGENT_LANE=release) owns: the "Owner's current versions" section of `~/.claude/skills/create-team/projects/gaia.md` (the record of what Rich runs; first checked and committed 2026-11-12), builds to testers once the React Native app exists, updating Rich's own install after asking, checking every step another lane gives Rich against his exact version, and acceptance passes on fresh builds. Started up 2026-11-12; the Dev Lead was gaia-07.

**Why:** the overlay is the single shared record; other lanes read it before giving Rich steps.
**How to apply:** re-check his install with [[release-owner-install-passive-check]] before quoting a version, and edit only that overlay section (commit only that hunk; other lanes keep uncommitted edits in the same file). Related: [[release-gaia-desktop-autoupdate-off]], [[release-acceptance-runs-headless]], [[release-akira-fastlane-template]].
