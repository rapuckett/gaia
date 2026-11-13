# Spec for `chat-new` (est 51a5a9c9): New chat: created on first send, greeting, starting lock, warm-up line, send errors, didn't-start retry

Generated from `parity-matrix.md` by `.local/dev/parity-spec.mjs`. 8 rows. These rows are the definition of done: Parity accepts the screen against them, in English and Arabic.

- **Labels** are quoted from main's web UI catalogs (`src/gaia/apps/webui/src/i18n/locales/en.ts`, key in backticks). Use the same keys through the app's `useT`; a label the web UI hard-codes (no key) gets a new key in en.ts and ar.ts, never a literal.
- **The web reference** is the component named in each row, under `src/gaia/apps/webui/src/components/`. Read it for behavior, order and states, and build the phone version; don't copy its DOM or CSS.
- **States** listed for a row must all be reachable and shown. **Notes** say what changes on a phone (hover-only, keyboard-only, desktop-only) and what the reference gets wrong at phone widths (don't copy those).

## Reference shots: main at phone widths

Main's own UI, rendered from the repo's fixtures (Design's audit, `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/index.md`). Files are `widths/<surface>/<320|390|768|1280>-<light|dark>-<en|ar>.png`; the contact sheet shows them all.

- `new-chat`: `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/widths/new-chat/` and `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/contact/new-chat.png`

## NC-01: New-chat screen (chat is created on first send)

- **Labels:** landmark "New chat" (`newChat.label`)
- **States:** idle, sending (composer docks to the bottom), starting, error
- **API:** POST /api/sessions then POST /api/chat/send (via App's `onSend`)
- **Web reference:** NewChat.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** 0.25 showed only the composer. The draft survives a reload (`useSavedDraft`). The NPU backdrop animation (NpuBackdrop.tsx, other file) reacts to sending, downloading and loading.

## NC-02: Time-of-day greeting

- **Labels:** "Good morning. What should we work on?", "Good afternoon. What should we work on?", "Good evening. What should we work on?" (`newChat.greeting.*`)
- **States:** hours before 05:00 read as evening
- **API:** —
- **Web reference:** NewChat.tsx
- **Since / PC-only / status:** 0.25.4 / No / missing
- **Notes:** Phone layout bug in main at 320 px: the menu button overlaps the greeting heading, in English and Arabic (Design's main-fixtures audit, .local/audit/2026-11-12/main-fixtures/widths/new-chat/320-*). The app must not; in Arabic, main shows the English greeting in brackets under the Arabic one

## NC-04: Composer (shared control)

- **Labels:** see CMP table
- **States:** —
- **API:** —
- **Web reference:** Composer.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** `leftControls` = permission chip and private chip, `rightControls` = model chip.

## NC-05: "Starting" lock

- **Labels:** placeholder "GAIA is starting…" (`composer.starting`)
- **States:** composer disabled
- **API:** GET /api/system/status (App poll)
- **Web reference:** NewChat.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** 0.25 wording was the shared `STARTING_REASON` constant.

## NC-09: Warm-up progress line

- **Labels:** "Getting GAIA ready… {s}s", "Loading {model}… {s}s", "Loading {model} on {where}… {s}s" with {where} = "your GPU", "your NPU" or "the CPU" (`newChat.warmup.*`, `device.*`)
- **States:** role=status; hidden while starting
- **API:** POST /api/system/warm-up, GET /api/system/warm-up (useWarmUp)
- **Web reference:** NewChat.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** 0.25 only had "Getting GAIA ready… {warming}s".

## NC-10: Send error

- **Labels:** server or request error text
- **States:** role=alert; the typed text is restored to the box
- **API:** —
- **Web reference:** NewChat.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** When messages were typed while the chat was being created they go back into the box joined by a blank line.

## NC-11: Messages typed while the chat is being created

- **Labels:** (no label)
- **States:** held, then queued in the new chat; if the first send failed they appear as failed queue items "The first message was not sent."
- **API:** —
- **Web reference:** NewChat.tsx
- **Since / PC-only / status:** 0.26 / No / missing
- **Notes:** Invisible plumbing; keep the behavior.

## NC-13: "Assistant didn't start" notice with retry

- **Labels:** "GAIA’s assistant didn’t start yet." (`newChat.assistantUnavailable`), "Try again" (`newChat.tryAgain`), disclosure "Details" (`newChat.details`)
- **States:** expanded detail in a `<pre>`
- **API:** GET /api/onboarding/start, repeated every 15 s while shown
- **Web reference:** NewChat.tsx
- **Since / PC-only / status:** 0.25.4 / No / missing
- **Notes:** Retries in the background only while the tab is visible.
