---
name: installed-gaia-unsafe-gets
description: "GET endpoints in Rich's installed GAIA (0.25.0) that do real work - block them in any \"read-only\" capture or probe"
metadata:
  node_type: memory
  type: project
  originSessionId: 64ce907e-adb5-4898-816f-81d54e1da246
  modified: 2026-11-13T01:44:56.029Z
---

Blocking non-GET requests is not enough to keep a capture of Rich's live GAIA read-only. These GETs act on his PC (swept 2026-11-12 over all 81 GET routes of the installed backend):

- `/api/memory/stream-discovery` scans the PC (git identity, apps, app usage, browser history).
- `/api/memory/stream-inference` runs LLM inference on his Lemonade; `include_browser=true` reads browser history.
- `/api/mcp/servers/{name}/tools` connects to an MCP server, starting stdio ones as processes.
- `/v1/email/*` acquires the email sidecar from the daemon, which can spawn it.
- `/api/setup/check?load=true` loads models; `/api/files/search` walks his disk; `/api/agents/catalog` writes a cache.

**Why:** at first the owner allowed only GETs and page loads against his installed app. Since later on 2026-11-12 it's a development install (Rich: "this is all for development so it doesn't matter if things/data get destroyed"; recorded in the overlay and CLAUDE.local.md). Runs may exercise it fully, coordinated with Release, who owns it. Two exceptions: never fire `POST /api/tunnel/start`, and so never open the Mobile access dialog unblocked. ngrok is installed (`/opt/homebrew/bin/ngrok`), so it would really put his PC on the internet, and the rule covers data, not security. Skip model loads unless the run is about one. This list now says what a GET does, for runs that should leave his state alone; it's no longer a hard limit.

- New in 0.25.4: `/api/sessions/{id}/changes/git` runs git in his repositories, `/api/setup/report/{name}` downloads a bundle of every GAIA log, and `/api/providers` and `/api/providers/active` can register a cloud provider in his Lemonade. Exception: `/api/providers/active` is safe while his `last_model` (`~/.gaia/config.json`) is local, and 0.25.4 opens on Setup without it (registration needs a `fireworks.` or `amd.` model; verified 2026-11-12).

**How to apply:** use the fail-closed allowlist that matches his installed version, apply its `# DENY` lines first (a `{param}` pattern also matches literal siblings), and check the version first (`~/.gaia/venv/bin/python -c "import gaia.version as v; print(v.__version__)"`). For 0.25.4: `/Users/rapuckett/Projects/gaia/.local/notes/installed-0.25.4-get-allowlist.txt`; reasons in `installed-0.25.0-get-routes.md` (0.25.4 delta at the end). For any newer build, re-run `python3 -I .local/dev/parity-get-sweep.py <site-packages>/gaia/ui` and diff the routes first. Related: [[parity-lane-setup]].
