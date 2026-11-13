# Mobile parity: kickoff notes (2026-11-12)

This is input for the Lead and for Rich's product decision on how GAIA gets first-class mobile support with full parity with the Agent UI. It does not make the decision. Update, same day: Rich chose **A**, a React Native (Expo) app, with the web UI staying the mobile-web path (overlay, "Owner decisions"). It was written from the code at `7a6e05c2f` (fork `main`, Agent UI 0.26.0). Rich's installed app is 0.25.0.

## What the Agent UI is today

There is one React 19 + Vite + Zustand app, `src/gaia/apps/webui`. It has about 142 component files and about 36k lines of TSX, in English and Arabic (RTL). It runs in three places:

- **The desktop app:** an Electron shell (`main.cjs`, `preload.cjs`, `services/*.cjs`). The renderer loads from `file://`.
- **A browser:** `gaia chat --ui` serves the built `dist/` from the FastAPI backend.
- **A phone:** the same build, reached through the ngrok tunnel.

The backend is `src/gaia/ui` (FastAPI). It has 27 routers and about 232 endpoints under `/api/*`. Streaming uses SSE. TypeScript types are generated from OpenAPI (`npm run gen:api-types`).

### Screens and surfaces

| Area | Where (`src/components/`) |
| --- | --- |
| First-run setup: backend choice, model checklist, downloads, GPU memory, checks, logs | `SetupScreen`, `setup/*`, `EngineInstallScreen` |
| Sidebar: chats, search, private chat, the Mobile access entry, collapse (`Ctrl/⌘B`) | `Sidebar`, `SideRail`, `SidebarResizer` |
| New chat: start cards, try chips, opening message | `NewChat`, `StartCards`, `TryChips` |
| Chat: messages, markdown, long content, agent activity, tool status, queued messages, edit and retry, retry with another model, compare answers, answer stats, read aloud | `ChatView`, `MessageBubble`, `AgentActivity`, `QueuedMessages`, `RetryWithMenu`, `AnswerComparison`, `AnswerStats`, `ReadAloudButton` |
| Composer: attachments, folder chip, model chip, permission mode, context meter, spend meter, recording | `Composer`, `FolderChip`, `ModelChip`, `PermissionModeChip`, `ContextMeter`, `SpendMeter`, `RecordingProgress` |
| Rich cards in answers: tables, lists, key-value, diff, image, audio, calculator, guide, confirmation, needs-input, connect-account | `render/*` |
| Permissions: prompts with a countdown, change previews, calendar approval, changes review, undo a turn | `PermissionPrompt`, `PermissionChangePreview`, `CalendarApproval`, `ChangesReview`, `TurnChanges` |
| Session panel: agent info, environment (folder, offline, **Phone access**, permission mode), skills, outputs, changes | `session-panel/*` |
| Documents library and indexing; file browser | `DocumentLibrary`, `IndexingProgress`, `FileBrowser` |
| Memory dashboard ("About you") | `MemoryDashboard*` |
| Scheduled tasks | `ScheduleManager` |
| Notifications, policy alerts, connector retry, connection banner, update indicator, version picker | `NotificationCenter`, `ConnectorRetryBanner`, `ConnectionBanner`, `UpdateIndicator`, `VersionPicker` |
| Settings, 12 sections: General, Setup, Model (local models, custom models, context size, cloud prices, spending limit, Lemonade server), Permissions, Skills, Connectors, Messaging (Discord and others), Memory, Notifications, Voice, Privacy, Advanced | `settings/*` |
| Model status, model-needed dialog, model server down notice, NPU backdrop, resource monitor, logs dialog, troubleshooting report | `ModelStatusPill`, `ModelNeededDialog`, `ModelServerDownNotice`, `ResourceMonitor`, `LogsDialog`, `TroubleshootingReport` |
| Email connect and pre-scan | `email/*` |

These live in the desktop shell only: the tray and its menu, keep-awake, native folder dialogs, notifications, the auto-updater, crash dialogs, the backend supervisor and installer, and window frame and keys (`services/*.cjs`).

The user-facing guide is `docs/guides/agent-ui.mdx`. Its section list is the feature checklist parity work should track.

## What mobile support exists already

- **Mobile access** (`src/gaia/ui/tunnel.py`, `routers/tunnel.py`, `components/MobileAccessModal.tsx`). An ngrok tunnel exposes the local backend. A UUID token travels in the QR code (`/?token=`). The server sets it as the `gaia_tunnel_token` cookie, or takes `Authorization: Bearer`. Each start makes a new token. ngrok must be installed and have an authtoken. Commit `b2092674a` (2026-11-12) made the setup dialog say what is needed, not a command to run.
- **PWA:** `public/manifest.json` (standalone, icons) and a service worker (`src/pwa/sw.js`, `register.ts`). The service worker registers only in production and in a secure context, so it works over the https tunnel but not over plain-http LAN. "Add to Home Screen" is documented, but access does not survive a new tunnel.
- **Responsive CSS:** breakpoints at 768 px (`useMediaQuery('(max-width: 768px)')` in `App.tsx` and `Sidebar.tsx`) and at 480, 520, 600 and 640 px, plus `hover: none` in two places. On a phone the Mobile access entry is hidden, and each chat gets one **⋯** button.
- **PC-only actions over the tunnel:** `require_local_pc` (`security.py`) and `via_tunnel` refuse anything that arrives with `X-Forwarded-*` from setup, messaging, GPU memory and chat permissions, plus saving provider keys, Lemonade control, logs and one system action. Autonomous runs pause while the tunnel is up (`GAIA_AUTONOMOUS_ALLOW_TUNNEL`).
- **Tests:** a 390×844 "phone width" screenshot in `visual/screens.visual.ts` (baselines are Windows-only), and the geometry suite `visual/rtl.visual.ts` (`npm run test:rtl`).
- **Stale doc:** `docs/guides/agent-ui.mdx` ("Mobile access says ngrok is required") still describes an install command with a Copy button, which `b2092674a` removed.

## Gaps for first-class mobile

1. **Transport and trust.** ngrok ends TLS on ngrok's servers, so a third party can read every chat. The token is a bearer UUID with no device identity and no per-device revocation. LAN access is plain http. Compare Akira's invariants (CLAUDE.md §13 there): end-to-end TLS to the computer, pinned certificates, device tokens, and a relay that only splices ciphertext. This is a security decision for Rich.
2. **Durable pairing.** Every tunnel start means a new QR code and a re-added home-screen app.
3. **Phone idioms:** system back, the soft keyboard over the composer, safe areas, sheets in place of modals, and touch targets. None of these is tested on a device today.
4. **Notifications:** no push to a phone, so scheduled tasks, permission prompts and alerts are missed while the app is closed.
5. **Files from the phone:** camera and photo upload for attachments and documents. The folder and file browser are about the PC's disk.
6. **Parity drift.** Upstream changed `src/gaia/apps/webui` in about 413 of 1,489 commits in the 30 days before 2026-11-12.

## Candidate approaches

### A. A React Native (Expo) app, reusing Akira's patterns

A new app (for example `src/gaia/apps/mobile`) built on the same `/api` and SSE contract and the generated types. It would reuse Akira's closed `@/ui` library approach, tokens, the platform file trios, a native transport module with pinned TLS, pairing, and the relay.

- **For:** truly native idioms, push notifications, a background transport, the best trust model, and store presence.
- **Against:** about 140 components rebuilt, then every upstream UI change made twice. At upstream's pace parity will drift unless the shared logic is factored out (stores, services and types into a package both apps use). It is a fork-only app that upstream is unlikely to take. It needs native builds, which are paused on this Mac since 2026-11-01 except the 03:00 release check.

### B. A responsive, installable web UI (PWA) in the existing app

Make the current `webui` phone-first where needed: phone layouts in shared components, sheets, keyboard-safe composer, safe areas and touch targets. Add device checks with Playwright at 320, 390 and 768 px and the `mobile-check` skill in mobile browsers. Fix pairing and transport on the backend.

- **For:** parity by construction (one codebase, upstream's changes arrive for free), small diffs that can go upstream, and no native builds.
- **Against:** a ceiling on native feel. iOS web push only works for an installed PWA over https. Background work is limited. Trust is still bounded by how the phone reaches the PC: a browser can't pin a certificate, so it needs a CA certificate (Akira's B1 exception) or the tunnel.

### C. A thin native shell around the web UI

An Expo or Capacitor shell that loads the same web build in a WebView. Native code supplies pairing, a pinned transport, push, the camera and share-sheet, biometrics and store presence.

- **For:** parity from B plus the native pieces B can't do, and Akira's transport and pairing work can be reused under it.
- **Against:** two layers to debug. Store review of "a website in a box" needs real native value. It still needs B's responsive work first.

### Recommendation (input, not the decision)

Start with **B** as the parity vehicle, because it is the only option that keeps up with upstream's pace. Put the transport and pairing question (gap 1) to Rich early, since it decides how the phone reaches the PC. Plan **C** as the next step for push, pinned transport and store presence. Choose **A** only if Rich wants a native-first product and accepts a shared-logic package and the drift cost.

## Next steps for the Lead

1. Set up the Python venv and webui `node_modules` (see the overlay, `~/.claude/skills/create-team/projects/gaia.md`) and get `/Users/rapuckett/Projects/gaia/.local/dev/verify.sh` green.
2. Design: run a headless screenshot audit of every surface above at 320, 390, 768 and 1280 px, from fixtures. Mobile: start a mobile idioms guide for this repo.
3. Rich's decisions: A, B or C; the transport and trust model; and whether this work is meant to go upstream.
