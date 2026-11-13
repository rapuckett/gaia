---
name: release-owner-install-passive-check
description: "How to see what GAIA Rich runs without touching it (plist, install-state JSON, venv dist-info, ps, lsof)"
metadata:
  node_type: memory
  type: reference
  originSessionId: 2c3278a6-9ec5-4f4a-83c0-4f1e0be10727
  modified: 2026-11-13T01:44:45.641Z
---

Read-only checks of Rich's GAIA on this Mac (used 2026-11-12):
- App version: `/usr/bin/plutil -extract CFBundleShortVersionString raw /Applications/gaia-desktop.app/Contents/Info.plist`
- Install state and installed version: `~/.gaia/electron-install-state.json`; startup failures: `~/.gaia/electron-startup-failures.json`
- Backend package: `~/.gaia/venv/lib/python3.12/site-packages/amd_gaia-*.dist-info/METADATA`
- Up or not, and ports: `ps -axo pid,lstart,command | grep -iE 'gaia|lemon|llama'` and `lsof -nP -iTCP -sTCP:LISTEN`
- Lemonade version: the path of the running `lemond` (`~/.gaia/lemonade/dist/<version>/lemond`); there is no Lemonade app.
- Labels he sees: `grep -lF '<label>' /Applications/gaia-desktop.app/Contents/Resources/dist/assets/*.js` (the same build his phone gets). On 0.25.4 read `git show v0.25.4:src/gaia/apps/webui/src/i18n/locales/en.ts`; builds before v0.25.4 have no catalog. The procedure is in the overlay's Release section.
- Offered updates: `~/.gaia/electron-updater.log`; `~/.gaia/update-config.json` absent means automatic install is off.
- SQLite counts on his idle WAL databases need `sqlite3 "file:<db>?immutable=1"` (`-readonly` fails with "unable to open database file" when no `-shm` exists).
- Set up or not (the app opens on Setup otherwise): `GET /api/setup/check` with header `x-gaia-ui: 1` (never `load=true`) answers `ready: true`, the GAIA agent's `~/.gaia/agents/gaia/.installed` exists, and `GET /api/agents` lists `gaia`. The `Agent registry initialized` line in `~/.gaia/gaia.log` is written only at backend start, so it lags an install made in a running app. After any update, confirm the app opens past Setup. On 2026-11-12 this was missed: his agent had never been installed, and 0.25.4's setup check started counting it.

Prefer process and port checks to his backend's API. Since 2026-11-12 it's a development install ([[installed-gaia-is-dev]]), so testing against it is allowed. Parity's allowlist for his build ([[installed-gaia-unsafe-gets]]) still marks the GETs that do real work: skip the memory scans of his PC, anything that opens a window, and any model load unless that's the point (loads compete with the gate and evict his resident Gemma), and record what changed. Never fire `POST /api/tunnel/start`: it can put his PC on the public internet through ngrok (installed here), which is his call alone. In 0.25.4, opening Mobile access fires it. Don't print `~/.gaia/config.json` values other than model names, and never read `~/.gaia/lemonade/env.sh`. See [[release-lane-role]].
