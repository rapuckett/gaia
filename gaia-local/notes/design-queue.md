# Design lane queue (gaia-ea)

Working list for the sprint's Design tasks (`2026-11-12-mobile-parity-sprint.md`). Up to 3 building
sub-agents. Record each finished task with
`node /Users/rapuckett/Projects/gaia/.local/dev/estimate.mjs actual <sprint est id> --agent <agentId>`
(the sprint item's id, never a new forecast). One actual per id: when one builder covers several ids, or one id
spans several builders, record each id with `--tokens` once the item is complete, from the per-agent totals
below.

**Priority since 2026-11-12 evening (Lead, relaying Rich):** the mobile MVP on the simulator first, security
de-prioritized (Mobile's plan: `2026-11-12-mvp-plan.md`). No new string tiers until the MVP runs. MVP gated
jobs run with `AGENT_HOST_HEAVY_CLASS=release` (SRE). Each lane lands its own reviewed branches:
`.claude/integration-signoff.json` in the worktree (schema 1: branch, commit, signedOffAt, choice "merge",
yolo true), then `.local/dev/integrate.sh <branch>` from it, then a one-line FYI with the merge sha to the Lead.
Conditions: the whole diff read; UI changes' en and ar screenshots read. Also glance at other lanes' new UI
before it lands.

## In flight

| Task | Est id | Agent | Branch / worktree | State |
| --- | --- | --- | --- | --- |
| prq-strings-p1 | df325a03 (actual recorded, 384k) | a43ca8d1668bea6e2 | design/i18n-p1, .worktrees/design-i18n-p1 | **landing** (integrate.sh started 04:24 UTC); then FYI the sha to the Lead (their pure-utils builder waits on it) |
| str-markdown | c61d25ea | a7922d221ec1a0e79 (sonnet) | design/mobile-markdown, .worktrees/design-mobile-markdown | building: web UI split (cleanToolCallContent, longContent) first, then the renderer on ui-core |
| ui-core: fnd-tokens + fnd-type-fonts + core of fnd-ui-primitives | 21db0ee7, 6114164e, 9801e000 (part) | a6db4f9f57e65974f (sonnet) | design/mobile-ui-core, .worktrees/design-mobile-ui-core | building; waits for the scaffold to land, then merges it |
| ui-lists: lists, states, Sheet, Notice, choices | 9801e000 (part), cb644ed6, 4d4f89b6 (part), e121de5d (part) | a40fcf26a0c6aa7b9 (sonnet) | design/mobile-ui-lists, .worktrees/design-mobile-ui-lists | building; merges ui-core as it commits |

Contract every lane codes against: `2026-11-12-mobile-ui-api.md`.

## Paused

| Task | Est id | Agent | State |
| --- | --- | --- | --- |
| prq-strings-p2 | 3705038c | a0a1c2bd775688dbe (156k tokens so far) | WIP commit c2b973416 on design/strings-p2. Left: rerun the 2 failing vitest files, the en/ar scheduled-tasks screenshots, verify, and drop the "WIP" line from the message. Resume after the MVP runs. |

## Next, in order

1. **str-markdown** (c61d25ea), then **str-bubbles** (3f538de8): Design's MVP screens, in
   `src/features/chat/markdown/**` and `src/features/chat/messages/**`. Specs: `mvp-specs/str-markdown.md`,
   `mvp-specs/str-bubbles.md`. Start when a slot frees (P1 done) and ui-core has landed. Deps: mdast
   (`mdast-util-from-markdown` 2.1.0, `mdast-util-gfm` 3.1.0, `micromark-extension-gfm` 3.0.0), the same GFM
   parser family as the web UI's react-markdown + remark-gfm. The list takes Mobile's `useMessages(sessionId)`
   and the live bubble as a prop.
2. Review and land ui-core, then ui-lists, as each reports. Tell Parity and Mobile as each lands.
3. Glance at other lanes' MVP screens before they land (look's owner).
4. After the MVP runs: P2 resumes; then P3 (1c2098f9), P4a-c (8fefc1d4, 82e7ef94, 1dd79c2c) stacked, each brief
   with the Arabic acceptance checks below; prq-literals-lint (a5878bad); the import guard for react-native
   in `src/features` and `src/app`; the rest of overlays, forms and lists; a11y-motion-contrast (4dbb9707);
   screens as their dependencies land.
5. **P1b after the MVP:** Parity's fixed scanner (`2026-11-12-webui-visible-literals.md`, 457 strings overall) finds
   14 more in P1's files. Sidebar's row counts must reuse Parity's keys `row.toSend`, `row.notSent`, `row.inLine`
   (from `parity/chat-drawer`); "GAIA" stays `APP_NAME` (constants.ts), never a key. **P1's leftovers** (for later tiers): sidebar rows' "1 to send" is English in Arabic; AgentActivity's
   "unknown tool" (P4); streamSteps' Thinking, Commentary, Error, Working and "Using skill: …" labels (inside a
   switch, so Parity's scan misses them; the narration is parsed back by a regex in AgentActivity); the policy
   toast overlaps the composer (a web UI layout bug, en and ar); the download banner lost its bold model name.
6. **Arabic acceptance checks for the string moves:** the `english-left` rows of Parity's
   `audit-0254-ar-mapping.tsv` (0.25.4). In main they map to: "Open sidebar" → App.tsx (P1), the model
   menu and chips → ModelChip.tsx (P3), and Mobile access, the folder chip and "Resize sidebar" →
   MobileAccessModal.tsx, FolderChip.tsx and SidebarResizer.tsx (P4). The status pill and popover appear in
   no tier (main already translates them). Each brief asks for those screens' Arabic shots to show no English.

**Before the next capture of Rich's GAIA:** the harness now loads the main checkout's web UI Playwright (1.65,
Chromium 1254; 1243 was deleted). Re-run `.local/dev/audit/selftest.mjs` and `dryrun.mjs` once before trusting it.

## Done

- **audit: installed 0.25.4** (23cd454d, not a sprint item; 155k recorded at the Setup stop): 222 shots, 35
  surfaces. Arabic pass (3f08283b, 81k): 55 shots, 29 surfaces. Both handed to Parity.
- **audit: main fixtures** (077d3b55, not a sprint item; actual recorded): 324 width-matrix, 36 palette and 506
  geometry shots, 38 contact sheets; index `.local/audit/2026-11-12/main-fixtures/index.md`. No horizontal scroll
  at 320-1280. Bug: at 320 the menu button overlaps the "Good morning" heading on new chat. The spec is saved as
  `.local/dev/audit/zz-design-audit.visual.ts`; worktree and branch removed.
