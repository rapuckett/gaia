---
name: design-lane-local-files
description: "Where the gaia Design lane's untracked working files live (queue, plans, read-only capture harness for Rich's installed GAIA)"
metadata:
  node_type: memory
  type: reference
  originSessionId: 8fdd8c76-aea0-4316-97ce-8bb155a30308
  modified: 2026-11-13T00:10:29.566Z
---

The gaia Design lane keeps its working files untracked under `/Users/rapuckett/Projects/gaia/.local/` (git-ignored through `.git/info/exclude`, so `git status` never shows them):

- `notes/design-queue.md`: the lane's task queue for the mobile-parity sprint, with each task's sprint estimate id, agent id, branch and state. Start here when resuming.
- `notes/2026-11-12-mobile-tokens-plan.md`: how the React Native app's tokens are generated from the web UI's `index.css` and `palettes.css` (one `--check`, no per-token tests).
- `notes/2026-11-12-device-pairing-strings.md`: the final en/ar catalog strings for the "Phones and tablets" Settings section (names picked by Rich).
- `dev/audit/`: the fail-closed, read-only headless capture harness for Rich's installed GAIA. Its README holds the rules. It refuses to run unless Parity's GET allowlist was swept for the exact installed version.

Related: [[gaia-installed-app-read-only]]
