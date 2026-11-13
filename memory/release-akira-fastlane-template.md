---
name: release-akira-fastlane-template
description: "Akira's fastlane setup (the design template for GAIA's React Native builds to TestFlight and Android internal) and the first-build steps only Rich can do"
metadata:
  node_type: memory
  type: reference
  originSessionId: 2c3278a6-9ec5-4f4a-83c0-4f1e0be10727
  modified: 2026-11-13T00:06:24.460Z
---

Akira's fastlane setup is `~/Projects/agent-host/fastlane` (private repo `extropolis/akira`: reuse its design, never copy its files into the public gaia fork, see [[akira-code-is-private]]).
- Lanes: iOS `check`, `tf`, `beta`, `upload`, `certificates`; Android `check`, `apk`, `internal`.
- IDs: `ai.extropolis.akira` for TestFlight and Play (Appfile `app_identifier` and `package_name`), `ai.extropolis.akira.dev` for dev builds (`app/app.config.ts` variants).
- Auth: `app_store_connect_api_key`, signing via `match` (`sync_code_signing`, a private certs git repo in `Matchfile`), Play via a service-account `json_key`.

For a new app, Rich's hands are needed once per store: creating the App Store Connect app record (the API can't), creating the Play Console app, uploading its first AAB through the Console, and giving the service account access to it. Account identifiers and the match repo URL never go in the public fork.

Native builds resumed for gaia on 2026-11-12, frugally (rebuild only at the end of big changes). Every build and upload follows SRE's load rules under Devices in the overlay's Shared facts: the gate, a 25 GiB free floor, a 4-core `-jobs` / `--max-workers` cap, and output in the scratchpad. On 2026-11-12 Rich chose `ai.amd.gaia.mobile` (dev builds `ai.amd.gaia.mobile.dev`, beside the desktop app's `ai.amd.gaia`) and deferred store uploads: builds stay on agent devices, with no account and no fastlane yet. The checklist for when he picks accounts is in the overlay's Release section. See [[release-lane-role]].
