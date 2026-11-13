---
name: gaia-gate-node-and-landing
description: "Why gaia's gated npm jobs need Node 20.20 from nvm, and why gaia landings lost landing priority at the shared gate"
metadata:
  node_type: memory
  type: project
  originSessionId: 02deb33f-fd8e-4685-9c7e-8dd828369be6
  modified: 2026-11-13T04:27:23.093Z
---

Two shared-gate (dev-kit dk-heavy) facts, found 2026-11-12:

1. **Node** (later the same day): webui's vitest also crashes on Node 20, because jsdom's undici needs zlib zstd. Upstream CI runs its Node jobs on node-version '22' and never reads `.nvmrc`. So verify.sh runs the web UI and app sections on nvm v22.18.0 and starts gated npm or npx jobs through `env`; without it, node22.sh re-picks `.nvmrc`'s 20 (tested: `dk-heavy env node -v` gives v22.18.0, a plain `node -v` gives v20.20.0). The original finding follows. For npm, npx and node jobs, dk-heavy sources dev-kit's lib/node22.sh. It takes only the major from the repo's `.nvmrc` (gaia pins v20.20.0) and uses the newest nvm `v20.*`. With only v20.3.1 installed, Vite 8 crashed (`node:util` has no `styleText`). Rich approved `nvm install 20.20.0` on 2026-11-12, and nvm's default stays 22. A dev-kit fix to refuse a Node older than `.nvmrc` was dispatched by the Lead.
2. **Landing priority:** `landing_claim()` honored only locks named `agent-host-integration-*.lock`. gaia's lock is `/tmp/gaia-integration-rapuckett.lock`, so a dev-kit fix to accept any `<repo>-integration-<name>.lock` was dispatched. On gaia's side, integrate.sh must export `AGENT_HOST_HEAVY_PRIORITY="$lock"` and write `started=` trimmed at both ends: macOS pads `ps -o lstart=` with trailing spaces, and dk-heavy compares the trimmed value.

3. **Priority:** an `AGENT_HOST_HEAVY_CLASS=release` requeue (granted twice on 2026-11-12, for Mobile's scaffold install and the unit-suite fix) only gets ahead of fresh tickets. Every ordinary ticket becomes class 2 after 45 minutes of waiting, and within a class the oldest goes first. Only the landing class (3) beats aged tickets.

**Why:** without these, gaia's web tests fail inside the gate for reasons outside the code, and landings queue behind ordinary jobs (agent-host's 2026-10-18 landing waited 1887 s).

**How to apply:** when a gated npm step fails strangely, check which Node node22.sh picked first. After a gaia landing, confirm its queue ticket shows `class=3`. Related: [[gaia-disk-floors]].
