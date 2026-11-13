---
name: installed-gaia-is-dev
description: "Rich's installed GAIA on this Mac is a development install; the team may test against, restart, reset it and lose its data without asking"
metadata:
  node_type: memory
  type: user
  originSessionId: b94a7fde-791c-462d-8673-316b6b771814
  modified: 2026-11-13T01:24:03.039Z
---

Rich's installed GAIA (`/Applications/gaia-desktop.app`, `~/.gaia`) is for development only (Rich, 2026-11-12): "it doesn't matter if things/data get destroyed".

**Why:** earlier rules treated it as his real install (never stop, restart or test against it), which slowed fixes such as the 0.25.4 agent install.

**How to apply:** test against it, restart or update it, and run setup on it without asking first; Release owns it and records what changed. Still stop only by recorded PID, keep windows off the external monitor, never print secrets. Repeatable tests keep their own `GAIA_HOME`. Overlay: `~/.claude/skills/create-team/projects/gaia.md`.
