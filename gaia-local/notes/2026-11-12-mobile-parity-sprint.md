# Sprint mobile-parity: the phone app backlog (2026-11-12)

The full backlog for a React Native (Expo) GAIA app at parity with the Agent UI, for the Lead to dispatch from. Local only, never committed. Recorded in the estimator as sprint `mobile-parity` (title "GAIA mobile app: full Agent UI parity"), one plan item per task; the estimator id is in each table.

## Summary

- **222 tasks** in 25 epics (M 129, S 59, L 34; sonnet 176, opus 43, haiku 3). Lanes: mobile 109, sre 2, design 46, lead 38, parity 19, release 8.
- **Tokens (gaia's forecaster, as recorded):** p50 53.1M, p90 87.2M. **Cost:** p50 $691, p90 $1356. Every item fell back to the "all rows" class (6 past runs), so these are the same per-size number for every category and model; see "How the estimates were made".
- **Better reference (agent-host's ledger, 354 rows, read only):** p50 38.7M, p90 57.5M tokens, list-price cost p50 $477, p90 $709; 201 of 222 tasks match a specific category class there. About 149 h of sub-agent time at p50.
- **Wall clock under the push profile** (3 building sub-agents per lane, one heavy-gate slot machine-wide, 10 min of lane review per task, gate time per landing of 6 min, 12 for test and device passes, 30 for a native dev build): **about 2.2 days at p50, 4.2 days at p90**, if Rich's answers come at once. The gate alone holds 25 h, and it is shared with agent-host's and diffusitron's work, so expect slower; the Mobile lane's 3 slots are the other bottleneck (109 tasks). Without Rich's answers, 199 tasks can finish (about 1.8 days); 23 wait on him.
- **Coverage:** 613 of 613 in-scope matrix rows map to a task; 0 gaps. (The brief said 557; the matrix's own count is 613 targets = 669 rows less the 56 desktop-shell n/a rows. All 613 are covered, the 5 "different on purpose" rows included.)

### Changes from Rich during planning (2026-11-12)

- **Native builds are resumed, frugally.** No task is blocked on native builds. Native work is batched behind three checkpoint tasks (`nb-1`, `nb-2`, `nb-3`, Mobile lane, device flag), each one dev build for iOS and Android, smoke-checked on the agent device. JS work in between reuses the last dev build; rebuild only at those points. Native module tasks write the code and leave the build to the next checkpoint.
- **Frugal unit tests.** No separate test tasks: each feature task carries behavior-level checks of contracts, security invariants and real logic, and is sized for it (the T1 invariant tests live in the T1 tasks; the pinned-client test is in `t1-endpoints`). Quality is only device checks, visual and RTL passes, e2e and the security re-review. Performance budgets moved into the screens that need them (long lists in `chat-drawer` and `str-markdown`) and the device pass (`qa-device-rest`).
- **App ids and store uploads.** The app ids are `ai.amd.gaia.mobile` and `ai.amd.gaia.mobile.dev` (the desktop app is `ai.amd.gaia`). Store uploads are deferred: no TestFlight or Play account until Rich decides, so `rel-accounts`, `rel-testflight` and `rel-play-internal` are blocked by "Rich: choose store accounts". In-scope release work is internal dev and release-profile builds on the agent devices (`rel-build-config`, `rel-internal-build`) and Release's acceptance pass (`rel-acceptance`).

### Critical path

Longest dependency chain with no lane or gate limits: about 33 h at p50.

`t1-hardening-land` → `t1-contract` → `t1-cert` → `t1-listener` → `t1-device-auth` → `t1-endpoints` → `t1-notices` → `t1-settings-ui` → `t1-docs` → `t1-rereview` → `t1-land` → `ntf-push-backend` → `ntf-push-client` → `ntf-push-actions` → `nb-3` → `qa-device-rest` → `rel-parity-sweep` → `rel-docs` → `rel-acceptance`

In practice the gate and the Mobile lane set the pace, not the chain. The chain to watch is the contract work (`prq-schema-export` → `fnd-api-client`) and T1 (`t1-contract` → `t1-listener` → `t1-device-auth` → `t1-endpoints`), because every screen and the pairing flow sit on them, and the three native checkpoints, because device checks, e2e and release builds wait on them.

### Blocked on Rich

| Task | Waits on | What it unblocks |
| --- | --- | --- |
| `pair-away-decision` Put the away-from-home choice to Rich: our relay, Tailscale or ngrok passthrough, with costs and risks | away-from-home route: Rich's decision | nothing else |
| `ntf-push-decision` Put the push route to Rich: Expo push service or direct APNs and FCM from the PC, contentless payloads | push provider and accounts: Rich's decision | `ntf-push-backend` |
| `rel-accounts` Rich chooses the store accounts for TestFlight and Play internal (store uploads deferred) | Rich: choose store accounts | `rel-testflight`, `rel-play-internal` |
| `rel-testflight` First TestFlight build to Rich, with steps checked against the build | Rich: choose store accounts | nothing else |
| `rel-play-internal` First Play internal build to Rich, with steps checked against the build | Rich: choose store accounts | nothing else |
| `rel-fork-install` Install the fork desktop build with pairing on Rich's PC, backups first | Rich's go to install a fork build on his PC | `rel-channel-pin` |
| `rel-channel-pin` Pin the desktop update channel so upstream's next release doesn't replace the fork build | Rich's go to install a fork build on his PC | nothing else |
| `up-advisory` Draft the private advisory for the tunnel gaps fixed in the fork | Rich approves upstream contact | nothing else |
| `up-pairing-pr` Prepare the pairing change as an upstream-shaped branch on upstream/main with its PR text | Rich approves upstream contact | nothing else |
| `up-strings-pr` Prepare the string moves, constants and schema exports as upstream-shaped branches | Rich approves upstream contact | nothing else |
| `up-app-proposal` Write the proposal for offering the phone app upstream, for Rich to approve | Rich approves upstream contact | nothing else |

Also waiting behind these: `nb-3`, `ntf-push-backend`, `ntf-push-client`, `ntf-push-actions`, `ntf-badge`, `ntf-background`, `qa-device-rest`, `qa-security`, `rel-parity-sweep`, `rel-docs`, `rel-acceptance`, `ntf-accept`. Push needs an Apple developer account (APNs) and a Firebase project (FCM) as well as Rich's choice of route, so `ntf-push-decision` gates all push work and the third native checkpoint. The away-from-home decision gates nothing in v1 (home network first).

### First wave: dispatch now

No dependencies and not blocked. Mind the push profile: 3 building sub-agents per lane.

- **mobile:** `fnd-scaffold-land` (sonnet, M), `t1-hardening-land` (opus, S)
- **design:** `prq-strings-p1` (sonnet, L), `prq-strings-p2` (sonnet, S), `prq-strings-p3` (sonnet, M), `prq-strings-p4a` (sonnet, L), `prq-strings-p4b` (sonnet, L), `prq-strings-p4c` (sonnet, M)
- **lead:** `prq-constants` (sonnet, M), `prq-schema-export` (opus, L), `prq-pure-utils` (opus, M)
- **sre:** `fnd-dev-backend` (sonnet, S)
- **parity:** `prq-watch-hook` (haiku, S)

Put to Rich now, as Central tasks from the Lead: `ntf-push-decision`, `rel-accounts` and `pair-away-decision` (the first gates push and the third native checkpoint, the second only the store uploads, the third nothing in v1). The upstream tasks wait until the pairing work is ready to offer.

Mobile should start with `fnd-scaffold-land` and `t1-hardening-land` (both nearly done in their worktrees), then `t1-contract`. Design already has `prq-strings-p1` in progress (`.worktrees/design-i18n-p1`). Lead takes `prq-schema-export` first, because the API client and every screen wait on it.

### How the estimates were made

- **gaia's forecaster** (`.local/dev/estimate.mjs`, agent-host's script with gaia as the root) has 6 training rows (research 3, landing 1, security-review 1, setup 1). It picks category plus model when that class has 5 or more rows, else the category alone, else **all rows**; then narrows by `--security` or `--device` only if 5 matching rows remain. Every item fell to "all rows" (p50 235k, p90 387k tokens for size M; S is ×0.6, L ×1.8), and every `--security` and `--device` flag was ignored (1 and 0 matching rows). Cost comes from the same 6 rows; there are no minutes.
- **agent-host's ledger** gives far better reference classes: ui-screen/sonnet (n 12), ui/sonnet (31), ui-library/sonnet (14), scoped-impl/sonnet (23), native/opus (10), security-feature/opus with security (5), device-check/sonnet with device (29). The categories here were chosen to match its names, so its forecasts apply directly (shown in the summary; I read them with `forecast` and no `--record`, which writes nothing). Its numbers are lower: about $477 versus $691 at p50. Suggestion, not done: let gaia's forecaster fall back to agent-host's ledger when gaia's class is thin. As gaia's own `actual` rows arrive, the forecasts sharpen by themselves.

### Recording in Central

- `sprint start` and every `plan` item are recorded in `/Users/rapuckett/Projects/gaia/.local/estimates.jsonl`. Items whose text or blocker changed with Rich's updates were dropped and re-planned, so the sprint holds ${all.length} live items plus 10 cancelled (`7842cd62`, `d45bb3fe`, `1035d723`, `3447f2dd`, `9b80eee8`, `0b439b58`, then `d0833dc6`, `a8688d85`, `a9db3fc2`, `49d206e0` for the app-id correction). The ${blocked.length} blocked items carry `--blocked-by` (plan accepts it, though its usage line doesn't say so). `plan` has no dependency flag, so dependencies are only in this doc.
- **The tick does not post gaia's sprint** (reported, not worked around):
  1. Central's sync (`estimateSync.mjs`, `ESTIMATE_SOURCES`) looks for `~/Projects/gaia/scripts/dev/estimate.mjs`, but gaia's wrapper is `.local/dev/estimate.mjs`, so it skips gaia (`~/.central/estimate-sync.json` has only `agent`).
  2. Fixed during planning: gaia's burndown printed repo `agent` without `--repo` earlier on 2026-11-12, and now prints `gaia`.
  3. A hand post (`central.mjs estimate-burndown -`, 0.34.0) is refused: "total.open.costUsd is not an object". The forecaster writes `costUsd: null` when there is no cost calibration file (gaia has none), and Central accepts only an object or no field.
  4. Every record carries `"repo":"agent-host"` (`REPO_KEY` is hard-coded in the forecaster), so anything grouping records by their own repo field files gaia's under agent-host.

## Milestones (2026-11-12)

The source is `.local/milestones.json` (item ids per milestone, shown in Central). Each sprint item belongs to exactly one milestone.

| # | Milestone | Items |
| --- | --- | --- |
| 1 | Foundations ready: app scaffold, typed API, strings and tokens shared with the web UI | 31 |
| 2 | A phone pairs with the PC over pinned TLS on home Wi-Fi (first native build) | 37 |
| 3 | Core chat on the phone: chats, composer, streaming, approvals and questions | 50 |
| 4 | Every other Agent UI area: documents, memory, skills, connectors, schedules, setup, settings | 57 |
| 5 | Native extras and polish: notifications, share and photos, accessibility, Arabic RTL | 28 |
| 6 | Parity accepted: device and security passes, final sweep, internal builds checked | 11 |
| 7 | Beyond this Mac: store builds, the fork desktop build, the upstream offer (Rich) | 10 |

## Backlog by epic

p50/p90 are gaia's recorded forecasts in tokens. Flags: S security, D device. Model tiers follow the team: opus for security, contracts, native and cross-lane work.

### Foundations (24 tasks, p50 6.0M, p90 9.9M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fnd-scaffold-land` | 061a1eac | Finish and land the Expo scaffold: toolchain, API client, i18n, jest projects, web export | mobile | sonnet | M |  | 235k / 387k |  |  |  |
| `fnd-verify-wiring` | 94103fab | Run the app's typecheck, lint, jest and every gen --check from verify.sh and the nightly, through the gate | sre | sonnet | S |  | 141k / 232k | fnd-scaffold-land |  |  |
| `fnd-dev-backend` | 4c01be43 | A dev backend harness with its own GAIA_HOME on ports 4210-4229 for app tests, never Rich's GAIA | sre | sonnet | S |  | 141k / 232k |  |  |  |
| `fnd-api-client` | d7c4de4b | Typed GaiaClient for every route the matrix uses: Bearer, X-Gaia-UI on writes, error classes, R1-R4 | mobile | sonnet | L |  | 424k / 696k | fnd-scaffold-land, prq-schema-export |  | APP-09 |
| `fnd-sse` | cf733ab3 | SSE client with the Bearer header for chat, session, connector and memory streams, with timeouts and resume | mobile | opus | M |  | 235k / 387k | fnd-api-client, prq-sse-schema |  |  |
| `fnd-transport-js` | 386a9bf3 | Transport interface for the native modules, a dev transport for jest and web, pin conformance cases | mobile | opus | M | S | 235k / 387k | fnd-api-client |  |  |
| `fnd-transport-ios` | 949ba8f2 | Pinned TLS transport in Swift: pin checked in the handshake before bytes, no redirects, Keychain token | mobile | opus | L | S | 424k / 696k | fnd-transport-js |  |  |
| `fnd-transport-android` | bbe5817b | Pinned TLS transport in Kotlin: pin checked before any bytes, no redirects, token from the Android Keystore | mobile | opus | L | S | 424k / 696k | fnd-transport-js |  |  |
| `fnd-i18n` | a1a5f80a | useT over the web UI's en and ar catalogs: plurals, placeholders, missing-key failure, catalog drift check | mobile | sonnet | S |  | 141k / 232k | fnd-scaffold-land |  |  |
| `fnd-tokens` | 21db0ee7 | Generate app tokens from index.css and palettes.css with --check, and drift checks for Arabic and targets | design | sonnet | M |  | 235k / 387k | fnd-scaffold-land |  |  |
| `fnd-palette-import` | dfeacfac | Import the web UI's pure palette helpers through a Metro watch folder and a tsconfig path, with a test | mobile | sonnet | S |  | 141k / 232k | fnd-tokens |  |  |
| `fnd-type-fonts` | 6114164e | Fonts and the phone type scale in src/ui/text, following the system text size | design | sonnet | S |  | 141k / 232k | fnd-tokens |  |  |
| `fnd-ui-primitives` | 9801e000 | UI basics: Text, Button, IconButton, Pressable with 48-point targets, Screen with safe areas and keyboard | design | sonnet | L |  | 424k / 696k | fnd-tokens, fnd-type-fonts |  |  |
| `fnd-ui-overlays` | 4d4f89b6 | Sheets, menus, confirm dialogs and toasts, one modal at a time, closed by Android back in the right order | design | sonnet | L |  | 424k / 696k | fnd-ui-primitives |  |  |
| `fnd-ui-forms` | e121de5d | Form controls: switch, segmented control, text field, select, slider, disclosure, search, progress bar | design | sonnet | M |  | 235k / 387k | fnd-ui-primitives |  |  |
| `fnd-ui-lists` | cb644ed6 | List rows, section headers, chips, badges, skeletons, and the shared empty, loading and failed states | design | sonnet | M |  | 235k / 387k | fnd-ui-primitives |  |  |
| `fnd-nav` | d4d49857 | Navigation: chat drawer, stacks, push versus replace, Android back, a parent for every cold-opened screen | mobile | sonnet | M |  | 235k / 387k | fnd-scaffold-land |  |  |
| `fnd-state` | f0472026 | Stores and query keys mirroring the web UI's stores: sessions, chat, settings, notifications, invalidation | mobile | sonnet | M |  | 235k / 387k | fnd-api-client |  |  |
| `fnd-shared-logic` | 73089a25 | Import the web UI's DOM-free logic (stream steps, tool events, formatters, countdown) with drift tests | mobile | opus | M |  | 235k / 387k | prq-pure-utils, fnd-scaffold-land |  |  |
| `fnd-web-harness` | 231db778 | Headless Playwright WebKit and Chromium checks of the web export at 320, 390 and 768 wide, through the gate | mobile | sonnet | M |  | 235k / 387k | fnd-scaffold-land |  |  |
| `fnd-app-config` | 1c5658b0 | App config: ids ai.amd.gaia.mobile and .mobile.dev, scheme, local network and camera text, ATS off | mobile | sonnet | S |  | 141k / 232k | fnd-scaffold-land |  |  |
| `nb-1` | cef9f77b | Native dev build 1 (iOS and Android): pinned transport, secure token store, QR scanner, device smoke check | mobile | opus | M | SD | 235k / 387k | fnd-transport-ios, fnd-transport-android, pair-qr-scanner, fnd-app-config |  |  |
| `nb-2` | a41ff84b | Native dev build 2: picker, camera, share sheet, audio record and play, quick action, smoke-checked | mobile | sonnet | M | D | 235k / 387k | nb-1, shr-photo-picker, shr-share-sheet, cmp-voice, rc-audio, set-voice, ntf-quick-action |  |  |
| `nb-3` | 34193367 | Native dev build 3: push and its actions, badge, background refresh, pairing deep link, smoke-checked | mobile | opus | M | SD | 235k / 387k | nb-2, ntf-push-client, ntf-push-actions, ntf-badge, ntf-background, pair-deeplink |  |  |

### Web UI prerequisites (12 tasks, p50 3.3M, p90 5.4M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prq-strings-p1` | df325a03 | Move the 96 P1 visible English strings in 10 web UI files into the en and ar catalogs | design | sonnet | L |  | 424k / 696k |  |  |  |
| `prq-strings-p2` | 3705038c | Move the 12 P2 strings (chat alerts, schedule store) into the en and ar catalogs | design | sonnet | S |  | 141k / 232k |  |  |  |
| `prq-strings-p3` | 1c2098f9 | Move the 62 P3 strings (email cards, model chip, calculator and 7 more files) into the catalogs | design | sonnet | M |  | 235k / 387k |  |  |  |
| `prq-strings-p4a` | 8fefc1d4 | Move P4 strings, part 1: setup, settings and system status files, into the en and ar catalogs | design | sonnet | L |  | 424k / 696k |  |  |  |
| `prq-strings-p4b` | 82e7ef94 | Move P4 strings, part 2: documents, file browser, memory, connectors and skills files | design | sonnet | L |  | 424k / 696k |  |  |  |
| `prq-strings-p4c` | 1dd79c2c | Move P4 strings, part 3: session panel, notifications, Mobile access and the remaining files | design | sonnet | M |  | 235k / 387k |  |  |  |
| `prq-literals-lint` | a5878bad | A web UI check that fails when a component adds visible English outside the catalogs | design | sonnet | S |  | 141k / 232k | prq-strings-p1 |  |  |
| `prq-constants` | 1f591c8c | Export values the app needs from utils/constants.ts (reconnects, UI header, limits) with drift checks | lead | sonnet | M |  | 235k / 387k |  |  |  |
| `prq-schema-export` | 61cec5b0 | Give every route the app calls a response model in api.schemas.json, then regenerate both apps' types | lead | opus | L |  | 424k / 696k |  |  |  |
| `prq-sse-schema` | d0e5db2c | Export the SSE event shapes (chat, session, connector, memory streams) as schemas both apps type against | lead | opus | M |  | 235k / 387k | prq-schema-export |  |  |
| `prq-pure-utils` | de196c48 | Split DOM-free logic out of web UI utils (stream steps, tool events, chat alerts, palette) for the app | lead | opus | M |  | 235k / 387k |  |  |  |
| `prq-watch-hook` | ad65db28 | Make the upstream watch flag catalog, schema, constants and token changes as app rows to update | parity | haiku | S |  | 141k / 232k |  |  |  |

### Backend T1 and follow-ups (22 tasks, p50 5.1M, p90 8.4M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `t1-hardening-land` | 7eb6aabf | Review and land the six done hardening commits: tunnel PC-only, log prefix, runner helper, principal() | mobile | opus | S | S | 141k / 232k |  |  |  |
| `t1-files-confine` | 446f3a31 | Confine file preview, browse, image and search to granted folders for devices and the tunnel; refuse secrets | mobile | opus | M | S | 235k / 387k | t1-hardening-land |  |  |
| `t1-providers-get` | 5f629c96 | Make GET /api/providers PC-only on the listener, since it registers a cloud provider as a side effect | mobile | opus | S | S | 141k / 232k | t1-hardening-land |  |  |
| `t1-contract` | ed1d2b3b | Device pairing models and routes in gaia.ui.models, exported to api.schemas.json with --check | mobile | opus | M | S | 235k / 387k | t1-hardening-land |  |  |
| `t1-config-flag` | fc90cf28 | device_pairing config key honored only from ~/.gaia/config.json; off state refuses every route | mobile | opus | S | S | 141k / 232k | t1-contract |  |  |
| `t1-cert` | 5db023a0 | Listener certificate and key: EC P-256, atomic 0600 file, 0700 folder, Windows ACL, kept out of diagnostics | mobile | opus | M | S | 235k / 387k | t1-contract |  |  |
| `t1-token-store` | 5ecc39aa | paired_devices table: 256-bit tokens stored hashed, constant-time compare, pending and idle expiry | mobile | opus | M | S | 235k / 387k | t1-contract |  |  |
| `t1-invitations` | 55a32fd8 | Pairing invitations: hashed, single use, 10-minute window that closes on first pairing, per-peer rate limit | mobile | opus | M | S | 235k / 387k | t1-contract |  |  |
| `t1-listener` | 7c8639ce | The TLS listener: private IPv4 only, TLS 1.2 minimum, body cap, scope stamp, loud port-in-use error | mobile | opus | L | S | 424k / 696k | t1-cert |  |  |
| `t1-device-auth` | 65187725 | Device auth on the listener for http and websocket: Bearer only, 404 outside /api, pending devices refused | mobile | opus | M | S | 235k / 387k | t1-listener, t1-token-store |  |  |
| `t1-endpoints` | e60b6ad6 | The /api/devices routes: open pairing, pair, list, allow, revoke, unpair self, status, reset pairing | mobile | opus | L | S | 424k / 696k | t1-device-auth, t1-invitations, t1-config-flag |  |  |
| `t1-route-classes` | 8aaba27c | Classify every route as phone-ok, PC-only or PC-or-device (setup); new PC-only list; every-route test | mobile | opus | L | S | 424k / 696k | t1-device-auth |  |  |
| `t1-revoke-streams` | 50654470 | Revoking a device ends its open SSE streams within a bounded time | mobile | opus | S | S | 141k / 232k | t1-endpoints |  |  |
| `t1-device-audit` | 98de549b | Log the device behind approvals, folder grants, schedules and goals approved from a phone | mobile | opus | S | S | 141k / 232k | t1-endpoints |  |  |
| `t1-notices` | b51e69ab | Security notices on the PC when a device pairs and when an address trips the rate limit | mobile | sonnet | S |  | 141k / 232k | t1-endpoints |  |  |
| `t1-tunnel-followups` | 1482ef5e | Tunnel follow-ups: autonomy gate keyed on the tunnel, never the listener; status token for the PC only | mobile | opus | S | S | 141k / 232k | t1-route-classes |  |  |
| `t1-settings-ui` | c5fe3df5 | Settings "Phones and tablets": the switch, Pair with QR, Allow and Revoke, Reset pairing, en and ar | mobile | sonnet | L |  | 424k / 696k | t1-endpoints, t1-notices |  |  |
| `t1-settings-notice` | 2ab422fb | The PC's pairing notice with Review and Deny, and the sidebar's paired-devices indicator, with test:rtl | mobile | sonnet | S |  | 141k / 232k | t1-settings-ui |  |  |
| `t1-setup-check` | e9c5acad | Lead's security check of the routes in the setup class (PC or approved device), before landing | lead | opus | M | S | 235k / 387k | t1-route-classes |  |  |
| `t1-docs` | 9c15e0c5 | Docs for pairing: agent-ui guide, agent-ui SDK endpoints and QR payload, server spec security model | mobile | sonnet | M |  | 235k / 387k | t1-settings-ui |  |  |
| `t1-rereview` | e6184c63 | Opus re-review of the finished T1 branch against every must-fix and invariant test | lead | opus | M | S | 235k / 387k | t1-settings-notice, t1-docs, t1-tunnel-followups, t1-files-confine, t1-providers-get, t1-revoke-streams, t1-device-audit, t1-setup-check |  |  |
| `t1-land` | d3363120 | Sign off and land the T1 branch through integrate.sh | lead | haiku | S |  | 141k / 232k | t1-rereview |  |  |

### Pairing (10 tasks, p50 1.9M, p90 3.1M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pair-onboarding` | b28aea3e | First-launch screens: welcome, how to pair, pairing off on the PC, waiting for Allow, uniform refusal | mobile | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, fnd-ui-overlays, prq-strings-p4c |  | MOB-02..MOB-04, MOB-08, MOB-09 |
| `pair-manual-entry` | 1fff8941 | Pair by pasting the pairing link or code when the camera can't be used | mobile | sonnet | S |  | 141k / 232k | pair-onboarding |  | MOB-06, MOB-07 |
| `pair-redeem` | afc8f409 | Redeem an invitation over the pinned transport, store the token natively, remember the PC's id and pin | mobile | opus | M | S | 235k / 387k | fnd-transport-js, t1-contract, pair-onboarding |  |  |
| `pair-qr-scanner` | ea45a3fb | Scan the pairing QR code with the camera, asking for the camera only when the person taps Scan | mobile | opus | M | S | 235k / 387k | pair-redeem, fnd-app-config |  | MOB-05 |
| `pair-pcs` | 2ead8d39 | Paired PCs: switch, forget (unpair self), and a hard failure on pin mismatch after a reset | mobile | opus | M | S | 235k / 387k | pair-redeem |  | SB-28, MOB-01, MOB-10 |
| `pair-reachability` | 576a122d | Reachability at home: which address answers, retry, and a plain message when away from home | mobile | sonnet | S |  | 141k / 232k | pair-redeem |  | MOB-11 |
| `pair-app-identity` | c33575db | App name, icon and splash from the web manifest; bundled assets instead of the service worker cache | design | sonnet | S |  | 141k / 232k | fnd-app-config |  | MOB-20..MOB-22 |
| `pair-away-decision` | e3cdad59 | Put the away-from-home choice to Rich: our relay, Tailscale or ngrok passthrough, with costs and risks | lead | opus | S | S | 141k / 232k |  | away-from-home route: Rich's decision |  |
| `pair-deeplink` | cf021c41 | Pairing deep link (scheme://pair?...) from the QR, once the app's scheme exists in a native build | mobile | opus | S | S | 141k / 232k | pair-qr-scanner |  |  |
| `pair-accept` | 2b51b90c | Parity accepts the Pairing rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (8) |  |  |

### Chats (10 tasks, p50 2.4M, p90 3.9M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `chat-drawer` | 04639c93 | Chat list drawer: groups, open a chat, status dot, private and unsent marks, list errors | mobile | sonnet | L |  | 424k / 696k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, fnd-ui-lists, prq-strings-p1 |  | SB-01..SB-04, SB-13..SB-17, SB-23, APP-12 |
| `chat-search` | b79d93f2 | Search chats by title and inside messages, with highlighted snippets | mobile | sonnet | M |  | 235k / 387k | chat-drawer |  | SB-05, SB-06 |
| `chat-row-actions` | 6c138e5d | Chat row actions: rename, pin, delete with confirm, the actions menu, mark read when seen | mobile | sonnet | M |  | 235k / 387k | chat-drawer, fnd-ui-overlays |  | SB-18..SB-21, SB-24 |
| `chat-nav-items` | 563c568f | Drawer entries: New chat, Memory, Scheduled tasks, Connectors, Documents, Skills, Settings, background runs | mobile | sonnet | S |  | 141k / 232k | chat-drawer |  | SB-07, SB-08, SB-10..SB-12, SB-22, SB-29 |
| `chat-routing` | f4f47c7a | Routing: link to a chat, reopen the last chat, list refresh on foreground, create-chat failure toast | mobile | sonnet | M |  | 235k / 387k | chat-drawer |  | APP-03..APP-07, APP-20, APP-22 |
| `chat-new` | 51a5a9c9 | New chat: created on first send, greeting, starting lock, warm-up line, send errors, didn't-start retry | mobile | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p1 |  | NC-01, NC-02, NC-04, NC-05, NC-09..NC-11, NC-13 |
| `chat-new-extras` | 18e660a5 | New chat extras: setup-failed banner, private chip, folder chip, documents, try chips, task cards | mobile | sonnet | M |  | 235k / 387k | chat-new |  | NC-03, NC-06..NC-08, NC-12, NC-14, APP-21 |
| `chat-header` | 86504afb | Chat header: rename, resource usage toggle, private toggle, session panel, documents bar | mobile | sonnet | M |  | 235k / 387k | chat-new |  | CV-01..CV-03, CV-06, CV-07 |
| `chat-retired` | 01425516 | Read-only chats of retired agents, programmatic send, and the flagship-missing notices | mobile | sonnet | S |  | 141k / 232k | chat-header |  | CV-57, CV-58, MS-AGENT-01, APP-17 |
| `chat-accept` | 54d0c02d | Parity accepts the Chats rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (9) |  |  |

### Composer and attachments (8 tasks, p50 2.3M, p90 3.7M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cmp-box` | 1cddbe4d | Composer: message box above the keyboard, too-long notice, Send and Stop, edit last, keeps focus | mobile | sonnet | L |  | 424k / 696k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p1 |  | CMP-01, CMP-06..CMP-08, CMP-14, CMP-28 |
| `cmp-queue` | 7a385180 | Queued messages while a reply runs: list, add to reply, send again, remove, Stop returns them | mobile | sonnet | M |  | 235k / 387k | cmp-box |  | CMP-09..CMP-13, CMP-15 |
| `cmp-attach` | 7a0a6cb8 | Attachment chips, paste, the + button and phone-side drop targets, wired to the picker interface | mobile | sonnet | M |  | 235k / 387k | cmp-box, shr-file-preview |  | CV-10, CMP-02..CMP-05 |
| `cmp-chips` | 5b3eb787 | Composer chips: permission mode menu, private chip on a new chat, working folder | mobile | sonnet | M |  | 235k / 387k | cmp-box, fnd-ui-overlays |  | CMP-16, CMP-17, CMP-21 |
| `cmp-context` | 9429cbbc | Context meter and breakdown sheet, spend meter, context warning, older-messages note | mobile | sonnet | M |  | 235k / 387k | cmp-box, prq-strings-p3 |  | CV-51, CV-52, CMP-18..CMP-20 |
| `cmp-model-menu` | aa60cec2 | Model chip and menu: switch, cloud consent, download from the menu, add a key (PC-only refusal) | mobile | sonnet | L |  | 424k / 696k | cmp-box, fnd-ui-overlays, prq-strings-p3 |  | CMP-22..CMP-26 |
| `cmp-voice` | 3371a42d | Record a voice message with the microphone and show transcription progress | mobile | opus | M |  | 235k / 387k | cmp-box, fnd-app-config |  | CV-50 |
| `cmp-accept` | 75170377 | Parity accepts the Composer rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (7) |  |  |

### Streaming and tool events (11 tasks, p50 2.9M, p90 4.7M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `str-stream` | 30b59288 | Streamed replies: live bubble and status line, reconnect and error classes, Stop, Continue, resume | mobile | sonnet | L |  | 424k / 696k | fnd-sse, cmp-box, fnd-shared-logic |  | CV-33, CV-35, CV-39, CV-40, CV-56, SHELL-39 |
| `str-bubbles` | 3f538de8 | Message list: loading skeleton, jump to latest, user bubbles, action row, collapse long messages | mobile | sonnet | M |  | 235k / 387k | str-stream |  | CV-08, CV-09, CV-15, CV-16, CV-22 |
| `str-markdown` | c61d25ea | Native Markdown answers: code blocks with copy, document citations, library notices | mobile | sonnet | L |  | 424k / 696k | str-bubbles |  | CV-24, CV-25, CV-27, CV-53 |
| `str-file-links` | 5aa5ff94 | File paths and retrieved chunks preview or share on the phone, never open on the PC | mobile | sonnet | M |  | 235k / 387k | str-markdown, shr-file-preview |  | CV-26, CV-46 |
| `str-errors` | 3cafeb63 | Reply errors: policy toast, action bar, connector retry, server-down, cut-off notes, report links | mobile | sonnet | M |  | 235k / 387k | str-stream |  | CV-11..CV-14, CV-29..CV-32, CV-34 |
| `str-activity` | e472f2d9 | Agent activity timeline inline in the reply, tool step rows and details, the answer footer | mobile | sonnet | M |  | 235k / 387k | str-stream |  | CV-38, CV-41, CV-42 |
| `str-steps` | 9157a44c | Step views: terminal output, plan checklist, thinking, Policy Shield row, step filter, vision offer | mobile | sonnet | M |  | 235k / 387k | str-activity, prq-strings-p3 |  | CV-43..CV-45, CV-47..CV-49 |
| `str-msg-actions` | 3e26dfb6 | Message actions: edit, resend, copy, delete with confirm, try again | mobile | sonnet | M |  | 235k / 387k | str-bubbles, fnd-ui-overlays |  | CV-17..CV-21 |
| `str-retry-compare` | 3f62ee05 | Retry with another model and the stacked answer comparison | mobile | sonnet | M |  | 235k / 387k | str-msg-actions, cmp-model-menu |  | CV-36, CV-37 |
| `str-handoffs` | 5c4a6ab5 | Connect-account resend once and the opening-message handoff | mobile | sonnet | S |  | 141k / 232k | str-stream |  | CV-54, CV-55 |
| `str-accept` | c9aa248c | Parity accepts the Streaming rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (10) |  |  |

### Rich cards (6 tasks, p50 1.4M, p90 2.3M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rc-data` | ad473a34 | Rich cards: table, key-value and list cards, the unsupported fallback and error boundary | design | sonnet | M |  | 235k / 387k | str-markdown, prq-strings-p3 |  | CV-28, RC-01..RC-03, RC-21, RC-22 |
| `rc-media` | e5dffdb6 | Image and diff cards | design | sonnet | M |  | 235k / 387k | rc-data |  | RC-04, RC-06 |
| `rc-audio` | 9025b6bf | Audio card playback through a native audio module | mobile | opus | S |  | 141k / 232k | rc-data |  | RC-05 |
| `rc-guide` | bcf41177 | Guide cards: servings, units, copy and share, tick off, timers, guided view, set counter, tip | design | sonnet | L |  | 424k / 696k | rc-data |  | RC-10..RC-18 |
| `rc-calc` | 79c1e712 | Tip and loan calculator card | design | sonnet | M |  | 235k / 387k | rc-data |  | RC-19 |
| `rc-accept` | c88eadc2 | Parity accepts the Rich cards rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (5) |  |  |

### Approvals and permissions (5 tasks, p50 1.3M, p90 2.1M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prm-prompt` | 2feee4aa | Permission prompt sheet: allow once, for the chat, trust folder, always, deny, countdown, full access | mobile | sonnet | L | S | 424k / 696k | str-stream, fnd-ui-overlays, fnd-shared-logic |  | PRM-01..PRM-05, PRM-12, PRM-23 |
| `prm-previews` | aa984ddb | Prompt details: command and text previews, path and project trust wording, what changes, calendar | mobile | sonnet | M |  | 235k / 387k | prm-prompt |  | PRM-06..PRM-11, PRM-22 |
| `prm-changes` | 43105fb1 | Changed files under an answer, review changes per turn, undo this turn | mobile | sonnet | M |  | 235k / 387k | prm-prompt, prq-strings-p4c |  | CV-60, PRM-13..PRM-16 |
| `prm-undo` | 9d770f94 | Undo conflicts, untracked work, history retention, undo all, change cards | mobile | sonnet | M |  | 235k / 387k | prm-changes |  | PRM-17..PRM-21 |
| `prm-accept` | 1077171e | Parity accepts the Approvals rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (4) |  |  |

### Questions (2 tasks, p50 0.4M, p90 0.6M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `qst-cards` | b782babb | Question and approval-needed cards: answer GAIA's questions from the card or the box | mobile | sonnet | M |  | 235k / 387k | prm-prompt, cmp-queue |  | RC-07, RC-08 |
| `qst-accept` | 1b307cec | Parity accepts the Questions rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (1) |  |  |

### Session panel (8 tasks, p50 1.9M, p90 3.1M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sp-sheet` | 97d45719 | Session panel as a sheet: sections, collapsible headers, switches | mobile | sonnet | M |  | 235k / 387k | chat-header, fnd-ui-overlays, prq-strings-p4c |  | SP-01..SP-03, SP-30, SP-32 |
| `sp-answer` | 90c18da7 | This answer: progress and errors, sources, files (preview or share), this turn, live-data warning | mobile | sonnet | M |  | 235k / 387k | sp-sheet, shr-file-preview |  | SP-04..SP-08 |
| `sp-env` | b3a7d61d | Environment: runs on, reachable folders, add and remove folders, internet, phone access, mode | mobile | sonnet | L |  | 424k / 696k | sp-sheet, doc-browser |  | SP-09..SP-17, SP-31 |
| `sp-context` | f0c86f7f | Context and performance: window fill, beyond the window, under the hood | mobile | sonnet | M |  | 235k / 387k | sp-sheet |  | SP-18..SP-21 |
| `sp-outputs` | cfc15a36 | Outputs: items, preview or share, go to the turn | mobile | sonnet | S |  | 141k / 232k | sp-sheet, shr-file-preview |  | SP-22..SP-24 |
| `sp-changes` | 1aaece7e | Changes: totals and files, review, undo all, commit and create PR | mobile | sonnet | M |  | 235k / 387k | sp-sheet, prm-changes |  | SP-25..SP-27 |
| `sp-skills` | 29b19e29 | Skills and agent info sections | mobile | sonnet | S |  | 141k / 232k | sp-sheet |  | SP-28, SP-29 |
| `sp-accept` | e32efdf1 | Parity accepts the Session panel rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (7) |  |  |

### Documents and RAG (7 tasks, p50 1.7M, p90 2.9M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `doc-library` | 1cc1a086 | Document library: target chooser, stats, empty state, rows, load and action errors | mobile | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, fnd-ui-lists, prq-strings-p4b |  | DOC-01, DOC-02, DOC-09..DOC-13 |
| `doc-states` | 53c75dcb | Indexing states: pending, progress, failed with retry, cancelled, missing, remove with Undo | mobile | sonnet | M |  | 235k / 387k | doc-library |  | DOC-14..DOC-17, DOC-20 |
| `doc-add` | e31d936c | Add documents: from the phone, by PC path, from the file browser, upload status and errors | mobile | sonnet | M |  | 235k / 387k | doc-library, shr-photo-picker |  | DOC-03..DOC-08, DOC-22 |
| `doc-attach` | 5321e225 | Attach documents to a chat, document links in answers, the ask-about-documents card | mobile | sonnet | M |  | 235k / 387k | doc-library, cmp-box |  | CMP-27, DOC-19, DOC-21, DOC-23, DOC-24 |
| `doc-browser` | 673f9ddb | PC file browser: quick links, search, type filter, breadcrumbs, hidden files, rows | mobile | sonnet | L |  | 424k / 696k | doc-library, t1-files-confine |  | CV-04, DOC-30..DOC-37 |
| `doc-preview` | 41268d59 | File preview pane, add to library, ask GAIA about these, folder preview instead of opening on the PC | mobile | sonnet | M |  | 235k / 387k | doc-browser, shr-file-preview |  | DOC-18, DOC-38..DOC-40 |
| `doc-accept` | ec57a2b5 | Parity accepts the Documents rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (6) |  |  |

### Memory (7 tasks, p50 1.7M, p90 2.9M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mem-shell` | fae5ac3d | Memory screen: header, tabs, coverage pill, maintenance menu, refresh, toasts, loading, off state | design | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p4b |  | MEM-01..MEM-08 |
| `mem-about` | e6b0cc44 | About you: add, grouped list, details, reveal sensitive items, edit inline, forget with Undo | design | sonnet | M |  | 235k / 387k | mem-shell |  | MEM-10..MEM-16 |
| `mem-profile` | d46e90ea | Profile setup: scan this PC (streamed), review and save, let GAIA describe you | design | sonnet | M |  | 235k / 387k | mem-shell, fnd-sse |  | MEM-30..MEM-33 |
| `mem-stats` | 93b5d4de | Advanced stats: cards, activity chart, tool performance, upcoming and overdue, footer | design | sonnet | M |  | 235k / 387k | mem-shell |  | MEM-40, MEM-41, MEM-45, MEM-46, MEM-52 |
| `mem-knowledge` | 05549fb7 | Knowledge browser with search, filter, add and edit, row details, conversation history | design | sonnet | L |  | 424k / 696k | mem-shell |  | MEM-42..MEM-44, MEM-47 |
| `mem-admin` | 750bc02a | Memory settings toggles with confirms, re-initialize and delete all in two steps | design | sonnet | M |  | 235k / 387k | mem-shell |  | MEM-48..MEM-51, MEM-60 |
| `mem-accept` | 0ee322e8 | Parity accepts the Memory rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (6) |  |  |

### Skills (3 tasks, p50 0.6M, p90 1.0M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `skl-browse` | e6a3857b | Skills: how it works, search, groups, rows with Try, skipped skills | lead | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p4b |  | SET-SKILL-01, SET-SKILL-08..SET-SKILL-11 |
| `skl-add` | 448a22a5 | Add skills from a link: libraries, paste, preview, code skills, confirm on the PC, result | lead | sonnet | M | S | 235k / 387k | skl-browse, t1-route-classes |  | SET-SKILL-02..SET-SKILL-07 |
| `skl-accept` | 7c38cce8 | Parity accepts the Skills rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (2) |  |  |

### Connectors and email (6 tasks, p50 1.2M, p90 2.0M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `con-list` | 1d5dde33 | Connectors: intro, search, groups, unavailable connectors, tile status | lead | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p4b |  | SET-CONN-01, CON-01..CON-05 |
| `con-oauth` | b3525741 | Accounts: device-code sign-in, Google on the PC only, own OAuth client, disconnect and revoke | lead | sonnet | M | S | 235k / 387k | con-list, t1-route-classes |  | CON-07..CON-11 |
| `con-mcp` | b77bd4a9 | MCP servers: actions menu, configure (PC-confirmed), check, enable, agent servers list | lead | sonnet | M | S | 235k / 387k | con-list, t1-route-classes |  | CON-06, CON-12..CON-14, CON-17, CON-18 |
| `con-grants` | 777704f5 | Per-agent grants, who can use it, and the personalize offer | lead | sonnet | S |  | 141k / 232k | con-list |  | CON-15, CON-16 |
| `con-email` | 2e253b72 | Email: connect-account card, connected retry, inbox pre-scan card and actions, preference chips | lead | sonnet | M |  | 235k / 387k | con-oauth, rc-data |  | RC-09, RC-20, EML-01..EML-05 |
| `con-accept` | dbd2958c | Parity accepts the Connectors rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (5) |  |  |

### Schedules and goals (5 tasks, p50 1.0M, p90 1.6M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sch-list` | f87f629f | Scheduled tasks: list with status and times, open its chat, run now, pause, delete, errors | lead | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p2 |  | SB-09, SCH-01, SCH-02, SCH-05..SCH-09 |
| `sch-create` | a909aa2e | New schedule: when to run in plain words, name and prompt, create | lead | sonnet | M |  | 235k / 387k | sch-list, fnd-ui-forms |  | SCH-03, SCH-04 |
| `sch-history` | a18df8ed | Run history, failure surfacing, and schedules running while the phone is paired | lead | sonnet | S |  | 141k / 232k | sch-list |  | SCH-10..SCH-12 |
| `sch-goals` | 5df9ef9d | Goals: suggestions to accept or reject, create, list with status and tasks, store health notice | lead | sonnet | M |  | 235k / 387k | mem-shell |  | MEM-20..MEM-23, APP-14 |
| `sch-accept` | 03cfb28d | Parity accepts the Schedules and goals rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (4) |  |  |

### Models and setup (14 tasks, p50 3.6M, p90 5.9M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fr-gate` | 60db584a | Setup gate on a phone: cold start, step rail, navigation, language, resume, running lock | lead | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p4a, t1-route-classes |  | FR-01..FR-08, APP-01, APP-02 |
| `fr-check` | 5e09c8e6 | Check this PC: rows, existing server offer (PC-only), install activity, findings, errors | lead | sonnet | M |  | 235k / 387k | fr-gate |  | FR-CHECK-01..FR-CHECK-06 |
| `fr-plan` | 0a158bb6 | Your setup: local and cloud cards, customize, blocked PC, what downloads, low space | lead | sonnet | M |  | 235k / 387k | fr-gate |  | FR-PLAN-01..FR-PLAN-07 |
| `fr-gpu` | 9ec32e42 | GPU memory step: split bar, presets, what they unlock, PC-only apply and undo, manual steps | lead | sonnet | M |  | 235k / 387k | fr-gate |  | FR-GPU-01..FR-GPU-09 |
| `fr-models` | aafa3b3c | Choose models: run on GPU or NPU, jobs, extras, checklist, default model, download total | lead | sonnet | L |  | 424k / 696k | fr-gate |  | FR-MODELS-01..FR-MODELS-13 |
| `fr-npu-key` | e405137b | NPU not ready and cloud keys: check again, get a key, prices, PC-only key entry | lead | sonnet | M |  | 235k / 387k | fr-gate |  | FR-NPU-01..FR-NPU-03, FR-KEY-01..FR-KEY-05 |
| `fr-download` | 4261cc52 | Download step: progress, rows, failures, re-download confirm, lost contact, finish, chip | lead | sonnet | L |  | 424k / 696k | fr-models, fnd-sse |  | FR-DL-01..FR-DL-11 |
| `fr-test-ready` | 3ac609b5 | Testing everything, failure explanations, ready notes and starter cards | lead | sonnet | M |  | 235k / 387k | fr-download |  | FR-TEST-01..FR-TEST-03, FR-READY-01, FR-READY-02 |
| `fr-logs-confirm` | 508f4c31 | Setup logs, troubleshooting report (PC-only), confirm and not-enough-disk sheets | lead | sonnet | S |  | 141k / 232k | fr-gate, fnd-ui-overlays |  | FR-LOG-01, FR-LOG-02, FR-CONFIRM-01, FR-CONFIRM-02 |
| `fr-settings-setup` | f9d0ea64 | Settings > Setup: summary, run again, chat model, keys, detected, server, GPU, models, context | lead | sonnet | M |  | 235k / 387k | fr-gate, set-shell |  | SET-SETUP-01..SET-SETUP-10 |
| `ms-pill` | 3fa3f609 | Model status pill and sheet: settings, log (PC-only), restart, reload confirm, model-needed dialog | lead | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p4a |  | SB-26, MS-MODEL-01..MS-MODEL-08 |
| `ms-notices` | acc03a7a | System notices: server down, NPU backdrop, resource strip, error boundary, downloads chip | lead | sonnet | M |  | 235k / 387k | ms-pill |  | SB-25, MS-DOWN-01, MS-NPU-01, MS-RES-01, MS-RES-02, MS-ERR-01, APP-15, APP-16, APP-18, APP-19 |
| `ms-logs` | cdbbb012 | Logs and troubleshooting report: PC-only states shown with the refusal text, read-only | lead | sonnet | M |  | 235k / 387k | ms-pill |  | MS-LOG-01..MS-LOG-08, MS-REP-01 |
| `fr-accept` | 7eb5c189 | Parity accepts the Models and setup rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (13) |  |  |

### Settings (15 tasks, p50 3.4M, p90 5.6M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `set-shell` | b0064e96 | Settings screens: section list, close, loading, jump to a setting, crash fallback, focus | design | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, fnd-ui-forms, prq-strings-p4a |  | SET-NAV-01..SET-NAV-06 |
| `set-general` | 4f71193d | General: language, appearance, resource usage, palettes, custom accent and tint, reset | design | sonnet | M |  | 235k / 387k | set-shell, fnd-palette-import |  | SET-GEN-01..SET-GEN-07, APP-10 |
| `set-model-use` | c5907617 | Model: in use, switch, context size, providers, privacy, how it works, prices, Local only, offline | design | sonnet | M |  | 235k / 387k | set-shell |  | SET-MODEL-01..SET-MODEL-09 |
| `set-model-keys` | 3ba6a9c6 | Provider keys: status, saved key, reconnect, remove, PC-only replace and paste, gateway, locked store | design | sonnet | M | S | 235k / 387k | set-model-use |  | SET-MODEL-10..SET-MODEL-19 |
| `set-model-list` | 0668561b | Models list: search, downloaded, available, not available, rows, download, use, remove, add | design | sonnet | L |  | 424k / 696k | set-model-use |  | SET-MODEL-20..SET-MODEL-30 |
| `set-model-downloads` | d5c82c47 | Downloads panel, disk space, checklist remove, apply changes, GPU memory | design | sonnet | M |  | 235k / 387k | set-model-list |  | SET-MODEL-31..SET-MODEL-35 |
| `set-model-spend` | 426a067f | Cloud spending: total, state banners, monthly limit | design | sonnet | S |  | 141k / 232k | set-model-use |  | SET-MODEL-36..SET-MODEL-38 |
| `set-perm` | d3800c9b | Permissions: full access default (PC-only), chats with extra access, turn off, revoke grants | design | sonnet | M | S | 235k / 387k | set-shell |  | PRM-24, SET-PERM-01..SET-PERM-08 |
| `set-messaging` | 788b8ba5 | Messaging (Discord): PC-only on the phone, shown read-only with the refusal text | design | sonnet | S |  | 141k / 232k | set-shell |  | SET-MSG-01..SET-MSG-13 |
| `set-memory` | e8138875 | Memory settings: remember across chats and open the dashboard | design | sonnet | S |  | 141k / 232k | set-shell, mem-shell |  | SET-MEM-01..SET-MEM-03 |
| `set-voice` | 4a2ca9d6 | Read aloud: voice, preview, speed, read each reply, per-message playback with native audio | mobile | opus | M |  | 235k / 387k | set-shell, str-bubbles |  | CV-23, CV-59, SET-VOICE-01..SET-VOICE-07 |
| `set-privacy` | b30be086 | Privacy: Local only (PC-only), where data lives, report, undo history, delete all chats | design | sonnet | M |  | 235k / 387k | set-shell |  | SET-PRIV-01..SET-PRIV-06 |
| `set-adv-status` | 69c0caf4 | Advanced status: server, models, disk, download, load, details, re-download, logs card | design | sonnet | M |  | 235k / 387k | set-shell |  | SET-ADV-01..SET-ADV-11 |
| `set-adv-server` | 641458d8 | Advanced server: address, loaded models, backend, reload, which server, custom model, tools, MCP, About | design | sonnet | M |  | 235k / 387k | set-shell |  | SET-ADV-12..SET-ADV-23 |
| `set-accept` | 7a316ae2 | Parity accepts the Settings rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (14) |  |  |

### Notifications and push (12 tasks, p50 2.8M, p90 4.6M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ntf-center` | 98b8e490 | Notification center: filters, items, approve and deny from the list, policy alerts, footer | mobile | sonnet | L | S | 424k / 696k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p2, prm-prompt |  | SB-27, NTF-01..NTF-07 |
| `ntf-banners` | 4fd5fa26 | Connection banners: starting, unreachable, model server stopped, download and load, small context | mobile | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, prq-strings-p1 |  | NTF-08..NTF-13, NTF-15 |
| `ntf-settings` | 06257644 | Notification settings: per-event mode, banners, sound, chat alert settings | mobile | sonnet | M |  | 235k / 387k | set-shell |  | SET-NOTIF-01..SET-NOTIF-06, NTF-16 |
| `ntf-inapp` | f4030bdf | In-app chat alert banners while the app is open | mobile | sonnet | M |  | 235k / 387k | ntf-settings, str-stream |  | NTF-17, SHELL-21 |
| `ntf-push-decision` | fd91fa90 | Put the push route to Rich: Expo push service or direct APNs and FCM from the PC, contentless payloads | lead | opus | S | S | 141k / 232k |  | push provider and accounts: Rich's decision |  |
| `ntf-push-backend` | d9366fca | Backend: per-device push tokens and contentless pushes for approvals, questions, finished runs, failures | mobile | opus | L | S | 424k / 696k | ntf-push-decision, t1-land |  |  |
| `ntf-push-client` | f6f09c8d | Push registration after pairing, permission at first use, a tap opens the chat with a parent | mobile | opus | M | S | 235k / 387k | ntf-push-backend, fnd-transport-ios, fnd-transport-android |  | SHELL-20 |
| `ntf-push-actions` | a6c4ceab | Approve and Deny from a push, sent over the pinned transport and logged with the device | mobile | opus | M | S | 235k / 387k | ntf-push-client |  | SHELL-04 |
| `ntf-badge` | 324f40c5 | App icon badge for unread chats and things waiting for you | mobile | sonnet | S |  | 141k / 232k | ntf-push-client |  | NTF-18, SHELL-01, SHELL-12 |
| `ntf-quick-action` | 154a86d0 | Home-screen quick action for New chat | mobile | sonnet | S |  | 141k / 232k | fnd-app-config, chat-new |  | SHELL-05 |
| `ntf-background` | f9ecf3c4 | Background refresh for unattended runs and foreground polling when push is off | mobile | opus | S |  | 141k / 232k | ntf-push-client |  | APP-13 |
| `ntf-accept` | a840154f | Parity accepts the Notifications rows in English and Arabic | parity | sonnet | M |  | 235k / 387k | the epic's unblocked tasks (10) |  |  |

### Share sheet, photo picker and files (5 tasks, p50 1.0M, p90 1.6M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shr-file-preview` | dced9150 | In-app preview of PC files (text, Markdown, image) from the confined preview routes | mobile | sonnet | M |  | 235k / 387k | fnd-api-client, fnd-nav, fnd-state, fnd-ui-primitives, t1-files-confine |  |  |
| `shr-share-sheet` | 9d3de3fb | Share sheet for chat exports and PC files previewed on the phone | mobile | sonnet | M |  | 235k / 387k | shr-file-preview, fnd-app-config |  | CV-05, SHELL-19 |
| `shr-photo-picker` | b37cfc54 | Photo, camera and file picker for attachments and documents, asking at first use | mobile | sonnet | M |  | 235k / 387k | fnd-app-config |  | SHELL-18 |
| `shr-links` | 17563165 | External links open in the system browser under the web UI's link policy | mobile | sonnet | S |  | 141k / 232k | fnd-nav |  | SHELL-36 |
| `shr-accept` | 379c39ef | Parity accepts the Files and sharing rows in English and Arabic | parity | sonnet | S |  | 141k / 232k | the epic's unblocked tasks (4) |  |  |

### Accessibility (5 tasks, p50 1.0M, p90 1.6M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `a11y-labels` | b202f260 | Screen reader labels, roles and order from the catalogs' aria keys across every screen | design | sonnet | M |  | 235k / 387k | chat-drawer, str-bubbles, set-shell |  |  |
| `a11y-text-size` | 092c7c4d | Largest text sizes: no clipped or overlapping layouts on every screen | design | sonnet | M |  | 235k / 387k | chat-drawer, str-bubbles, set-shell |  |  |
| `a11y-motion-contrast` | 4dbb9707 | Reduced motion and contrast floors checked from the generated tokens | design | sonnet | S |  | 141k / 232k | fnd-tokens |  |  |
| `a11y-keyboard` | a99366b7 | Hardware keyboard shortcuts on tablets and the shortcuts list | mobile | sonnet | S |  | 141k / 232k | chat-routing, set-shell |  | SET-GEN-20, APP-08 |
| `a11y-device` | d070d7f7 | VoiceOver and TalkBack pass on devices | design | sonnet | M | D | 235k / 387k | a11y-labels, a11y-text-size, nb-2 |  |  |

### Arabic RTL (4 tasks, p50 0.8M, p90 1.2M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rtl-direction` | 5b3afbfd | Direction from the locale: mirrored layout, icons and back swipe, reload on language change | mobile | sonnet | M |  | 235k / 387k | fnd-i18n, fnd-nav |  | APP-11 |
| `rtl-text` | 32cd5e4e | Arabic text rules: line heights, numbers, file and model names isolated left to right | design | sonnet | S |  | 141k / 232k | rtl-direction, fnd-type-fonts |  |  |
| `rtl-visual` | 57442652 | RTL geometry checks on the web export: overflow, mirroring, leftover English, like rtl.visual.ts | design | sonnet | M |  | 235k / 387k | rtl-direction, fnd-web-harness |  |  |
| `rtl-device` | 0a95d397 | Arabic pass on iOS and Android devices with forced RTL | design | sonnet | S | D | 141k / 232k | rtl-visual, nb-1 |  |  |

### Quality (6 tasks, p50 2.4M, p90 3.9M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `qa-visual` | cb1a7cd3 | Visual scenes for every screen in English and Arabic at 320, 390 and 768, from the web UI's fixtures | design | sonnet | L |  | 424k / 696k | fnd-web-harness |  |  |
| `qa-e2e-web` | f56394ff | End-to-end flows on the web export against a dev backend: pair, chat, approve, schedule | mobile | sonnet | L |  | 424k / 696k | fnd-dev-backend, str-stream, prm-prompt, pair-redeem |  |  |
| `qa-e2e-native` | e3b769f2 | Maestro flows on iOS and Android dev builds for the same journeys | mobile | sonnet | L | D | 424k / 696k | qa-e2e-web, nb-1, nb-2 |  |  |
| `qa-device-p1` | 49c97dbd | mobile-check pass for P1: keyboard, back, safe areas, sheets, cold links, streaming | mobile | sonnet | M | D | 235k / 387k | qa-e2e-native, nb-1 |  |  |
| `qa-device-rest` | 50e7d857 | mobile-check pass for every other screen on a phone and a tablet, with startup and long-chat scrolling | mobile | sonnet | L | D | 424k / 696k | qa-device-p1, nb-3 |  |  |
| `qa-security` | eb462a77 | Opus security re-review of the whole app: transport, token storage, logs, links, push, file preview | lead | opus | L | S | 424k / 696k | pair-pcs, nb-3, qa-e2e-native |  |  |

### Release (11 tasks, p50 2.4M, p90 3.9M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rel-parity-sweep` | 7a8915e4 | Parity's final sweep of every target row with evidence | parity | sonnet | L |  | 424k / 696k | qa-device-rest |  |  |
| `rel-accounts` | dfd3909d | Rich chooses the store accounts for TestFlight and Play internal (store uploads deferred) | release | haiku | S |  | 141k / 232k |  | Rich: choose store accounts |  |
| `rel-build-config` | 3abe9a23 | Internal dev and release build profiles (ai.amd.gaia.mobile.dev, ai.amd.gaia.mobile) for agent devices | release | sonnet | M |  | 235k / 387k | nb-1 |  |  |
| `rel-internal-build` | ea6a3a38 | Internal release-profile builds of ai.amd.gaia.mobile on the agent devices, smoke-checked | release | sonnet | M | D | 235k / 387k | rel-build-config, qa-device-p1 |  |  |
| `rel-store-assets` | 3004d7f4 | Store listing assets, privacy labels, local network and camera reasons | design | sonnet | S |  | 141k / 232k | pair-app-identity |  |  |
| `rel-testflight` | 8f36e22b | First TestFlight build to Rich, with steps checked against the build | release | sonnet | M | D | 235k / 387k | rel-accounts, rel-internal-build | Rich: choose store accounts |  |
| `rel-play-internal` | 1a7413ce | First Play internal build to Rich, with steps checked against the build | release | sonnet | M | D | 235k / 387k | rel-accounts, rel-internal-build | Rich: choose store accounts |  |
| `rel-fork-install` | 27c193de | Install the fork desktop build with pairing on Rich's PC, backups first | release | sonnet | S |  | 141k / 232k | t1-land | Rich's go to install a fork build on his PC |  |
| `rel-channel-pin` | a3160430 | Pin the desktop update channel so upstream's next release doesn't replace the fork build | release | sonnet | S |  | 141k / 232k | rel-fork-install | Rich's go to install a fork build on his PC |  |
| `rel-docs` | 63aed2f3 | Phone app guide: pairing, home network, what stays PC-only, files, notifications | mobile | sonnet | M |  | 235k / 387k | rel-parity-sweep |  |  |
| `rel-acceptance` | f229e2ae | Release's acceptance pass on the internal builds: every step and label checked before Rich gets them | release | sonnet | M | D | 235k / 387k | rel-internal-build, rel-docs, qa-security |  |  |

### Upstream offering (4 tasks, p50 0.8M, p90 1.2M)

| id | est. id | title | lane | model | size | flags | p50 / p90 | depends on | blocked by | matrix rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `up-advisory` | 69b68f27 | Draft the private advisory for the tunnel gaps fixed in the fork | lead | opus | S | S | 141k / 232k | t1-land | Rich approves upstream contact |  |
| `up-pairing-pr` | 935cdbb8 | Prepare the pairing change as an upstream-shaped branch on upstream/main with its PR text | lead | opus | M | S | 235k / 387k | t1-land | Rich approves upstream contact |  |
| `up-strings-pr` | 14029bc5 | Prepare the string moves, constants and schema exports as upstream-shaped branches | lead | sonnet | M |  | 235k / 387k | prq-strings-p4c, prq-constants | Rich approves upstream contact |  |
| `up-app-proposal` | 59a6f54e | Write the proposal for offering the phone app upstream, for Rich to approve | lead | sonnet | S |  | 141k / 232k | rel-parity-sweep | Rich approves upstream contact |  |

## Coverage check

Checked by script against `parity-matrix.md` (every `| ID |` row, the SEC appendix excluded): 613 in-scope rows (608 missing plus 5 different), 613 mapped, each to exactly one task; no task names an n/a row or an unknown id; the dependency graph has no cycles.

**Gaps: none.**

| Area | In scope | Tasks |
| --- | --- | --- |
| SB | 29 | `chat-drawer`, `chat-search`, `chat-nav-items`, `sch-list`, `chat-row-actions`, `ms-notices`, `ms-pill`, `ntf-center`, `pair-pcs` |
| NC | 14 | `chat-new`, `chat-new-extras` |
| CV | 60 | `chat-header`, `doc-browser`, `shr-share-sheet`, `str-bubbles`, `cmp-attach`, `str-errors`, `str-msg-actions`, `set-voice`, `str-markdown`, `str-file-links`, `rc-data`, `str-stream`, `str-retry-compare`, `str-activity`, `str-steps`, `cmp-voice`, `cmp-context`, `str-handoffs`, `chat-retired`, `prm-changes` |
| CMP | 28 | `cmp-box`, `cmp-attach`, `cmp-queue`, `cmp-chips`, `cmp-context`, `cmp-model-menu`, `doc-attach` |
| RC | 22 | `rc-data`, `rc-media`, `rc-audio`, `qst-cards`, `con-email`, `rc-guide`, `rc-calc` |
| PRM | 24 | `prm-prompt`, `prm-previews`, `prm-changes`, `prm-undo`, `set-perm` |
| SP | 32 | `sp-sheet`, `sp-answer`, `sp-env`, `sp-context`, `sp-outputs`, `sp-changes`, `sp-skills` |
| SET | 140 | `set-shell`, `set-general`, `a11y-keyboard`, `fr-settings-setup`, `set-model-use`, `set-model-keys`, `set-model-list`, `set-model-downloads`, `set-model-spend`, `set-perm`, `skl-browse`, `skl-add`, `con-list`, `set-messaging`, `set-memory`, `ntf-settings`, `set-voice`, `set-privacy`, `set-adv-status`, `set-adv-server` |
| FR | 71 | `fr-gate`, `fr-check`, `fr-plan`, `fr-gpu`, `fr-models`, `fr-npu-key`, `fr-download`, `fr-test-ready`, `fr-logs-confirm` |
| MS | 23 | `ms-pill`, `ms-notices`, `ms-logs`, `chat-retired` |
| DOC | 35 | `doc-library`, `doc-add`, `doc-states`, `doc-preview`, `doc-attach`, `doc-browser` |
| MEM | 37 | `mem-shell`, `mem-about`, `sch-goals`, `mem-profile`, `mem-stats`, `mem-knowledge`, `mem-admin` |
| SCH | 12 | `sch-list`, `sch-create`, `sch-history` |
| EML | 5 | `con-email` |
| MOB | 14 | `pair-pcs`, `pair-onboarding`, `pair-qr-scanner`, `pair-manual-entry`, `pair-reachability`, `pair-app-identity` |
| NTF | 17 | `ntf-center`, `ntf-banners`, `ntf-settings`, `ntf-inapp`, `ntf-badge` |
| CON | 18 | `con-list`, `con-mcp`, `con-oauth`, `con-grants` |
| APP | 22 | `fr-gate`, `chat-routing`, `a11y-keyboard`, `fnd-api-client`, `set-general`, `rtl-direction`, `chat-drawer`, `ntf-background`, `sch-goals`, `ms-notices`, `chat-retired`, `chat-new-extras` |
| SHELL | 10 | `ntf-badge`, `ntf-push-actions`, `ntf-quick-action`, `shr-photo-picker`, `shr-share-sheet`, `ntf-push-client`, `ntf-inapp`, `shr-links`, `str-stream` |

Notes for Parity on rows whose phone behavior is a judgment call: SB-04 (drag-to-resize) and CMP-14 (up-arrow edits) have touch substitutes or none, as the matrix says; MOB-01..11 are the ngrok flow's reference rows, realized by the pairing tasks; MOB-20/21 become the app's identity and bundled assets; SHELL-01/12 (tray badge) become the app icon badge, SHELL-05 a home-screen quick action; CV-26, CV-46, SP-06, SP-24 and DOC-18 are built to D2 (preview or share). The 42 PC-only rows show the R1-R4 refusal or a read-only state, per Design.
