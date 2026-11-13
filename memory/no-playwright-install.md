---
name: no-playwright-install
description: "Never let a builder run `npx playwright install`; it downloads a binary and prunes other projects' browsers from the shared cache"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 87755532-a893-4faf-bbd5-d4c7467bb0a4
  modified: 2026-11-13T03:54:30.052Z
---

Every brief that runs Playwright (test:rtl, test:visual, headless web-export checks) must say: never run `npx playwright install`. Point `GAIA_VISUAL_CHROMIUM` at the newest cached headless shell (`~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell`), or pass `executablePath`, and if none fits, stop and report.

**Why:** on 2026-11-12 a Mobile builder for webui's Playwright 1.65 ran it to get Chromium 1254. That was a binary download without asking, which breaks Rich's rule to ask before new binaries. Worse, Playwright's cleanup then deleted Chromium 1243 from `~/Library/Caches/ms-playwright`, which every project on this Mac shares, because no registered install in `.links` referenced it, so other teams' e2e could break. My brief hadn't carried the rule, and the overlay's Design section did.

**How to apply:** put the no-download line in every builder brief that touches a browser, not just Design's. Treat other installers that garbage-collect a shared cache the same way. If a builder still downloads, tell SRE at once with the before-and-after cache contents. Related: [[gaia-sprint-recording]].
