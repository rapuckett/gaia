# Mobile lane: notes for upcoming sprint tasks

_The Mobile lane's working notes, 2026-11-12 on. Fold each into its task's brief at dispatch. Never committed._

## fnd-i18n (a1a5f80a)

- **Parity (Parity, matrix row APP-11, via the Lead):** Arabic shows each message's English after it in brackets (`ar.ts` `showEnglishInBrackets: true`). Each half is direction-isolated, `compose()` brackets a multi-message line once, and `translateBare()` leaves joining words bare. All three live in webui's `i18n/registry.ts`, so call it; never rewrite it.
- **Move webui's `translator()`** (about ten pure lines in `i18n/useT.ts`, wrapping `translate`, `pluralKey`, `withHint`, `compose` and `translateBare`) into its own DOM-free module. Webui's `useT.ts` re-exports it, and the app imports it. It's a small upstreamable refactor, and it leaves no copy. `useT.ts` itself stays webui-only, because it reads the chat store.
- Design may recommend that the app drop the brackets (they nearly double text length on a phone). That's Rich's call through the Lead, so build parity first.

## Mobile access explicit Start (d0647472), dispatched 2026-11-12

- The privacy line never mentions the GAIA app or pairing, which stay out of reach until proven. Design reviews the copy on the branch.

## Approve on the PC (a T1 follow-up, its own sprint item)

- The list is in `2026-11-12-t1-backend-plan.md` ("Full parity"): keys, logs and the report, Lemonade and GPU memory, connector authorization and grants, messaging, the default full access, and skill and agent installs. The NPU memlock fix stays PC-only unless the follow-up can carry the PC's admin prompt.

## T1 when it resumes (paused 2026-11-12 at abe1a092b, branch mobile/phone-pairing)

- First, one `verify.sh --fast origin/integration/rapuckett` on the merged tree; it should reach tsc and vitest this time.
- **Before landing:** the web UI must send `session_id` on file reads away from the PC (`previewFile` and friends in `services/api.ts`), or file previews over Mobile access break.
- For the re-review: `documents/upload-path` and `index-folder` still read PC files from phones.
- The Windows firewall rule goes to the installer (Release). The Settings UI and the guide wait for the strings in `2026-11-12-device-pairing-strings.md`, and the web UI must handle the `device_paired` and `security_alert` events.
- Tip: `python -m gaia.ui.export_openapi` picks up the main checkout unless `PYTHONPATH=<worktree>/src` is set.
- The run is recorded against t1-endpoints (e60b6ad6). The Lead marks the other items it closed.

## nb-3 (34193367)

- Plan it to pass without push if the Apple developer and Expo accounts are still open: push delivery is checked only once Rich has them. Rich chose the Expo push service, with contentless payloads that make the app fetch over the pinned connection, and no push keys on the PC.
