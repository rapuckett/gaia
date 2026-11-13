# Spec for `str-bubbles` (est 3f538de8): Message list: loading skeleton, jump to latest, user bubbles, action row, collapse long messages

Generated from `parity-matrix.md` by `.local/dev/parity-spec.mjs`. 5 rows. These rows are the definition of done: Parity accepts the screen against them, in English and Arabic.

- **Labels** are quoted from main's web UI catalogs (`src/gaia/apps/webui/src/i18n/locales/en.ts`, key in backticks). Use the same keys through the app's `useT`; a label the web UI hard-codes (no key) gets a new key in en.ts and ar.ts, never a literal.
- **The web reference** is the component named in each row, under `src/gaia/apps/webui/src/components/`. Read it for behavior, order and states, and build the phone version; don't copy its DOM or CSS.
- **States** listed for a row must all be reachable and shown. **Notes** say what changes on a phone (hover-only, keyboard-only, desktop-only) and what the reference gets wrong at phone widths (don't copy those).

## Reference shots: main at phone widths

Main's own UI, rendered from the repo's fixtures (Design's audit, `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/index.md`). Files are `widths/<surface>/<320|390|768|1280>-<light|dark>-<en|ar>.png`; the contact sheet shows them all.

- `finished-answer`: `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/widths/finished-answer/` and `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/contact/finished-answer.png`
- `running-tool`: `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/widths/running-tool/` and `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/contact/running-tool.png`

## CV-08: Message list loading skeleton

- **Labels:** aria "Loading messages" (hard-coded)
- **States:** shown while the first page loads
- **API:** GET /api/sessions/{id}/messages (paged)
- **Web reference:** ChatView.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** —

## CV-09: Scroll-to-bottom button

- **Labels:** title and aria "Scroll to bottom" (hard-coded)
- **States:** shown when scrolled up
- **API:** —
- **Web reference:** ChatView.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Follow-scroll while streaming stops when the reader scrolls up (`useFollowScroll`).

## CV-15: User message bubble

- **Labels:** hover title "Sent {time}" (`msg.sent`)
- **States:** normal, editing, collapsed (CV-22)
- **API:** —
- **Web reference:** MessageBubble.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** The full timestamp is a hover tooltip only. A phone needs a visible timestamp or long-press.

## CV-16: Message action row (appears below a message)

- **Labels:** see CV-17 to CV-23
- **States:** hidden until hover or focus (opacity 0); always visible on the latest answer and while a reply is being read aloud; hidden while streaming
- **API:** —
- **Web reference:** MessageBubble.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** **Hover-only affordance** on every older message. Needs long-press, an overflow menu or always-on icons on a phone. 0.25 had Resend, Copy and Delete only.

## CV-22: Collapse long user messages

- **Labels:** "Show all ({size})" via `msg.showAll` hint, "Show less" (`msg.showLess`)
- **States:** collapsed at more than 15 lines or 1,500 characters
- **API:** —
- **Web reference:** LongContent.tsx, MessageBubble.tsx
- **Since / PC-only / status:** 0.25.4 / No / missing
- **Notes:** Collapses scroll back into view on close. Constants: `USER_COLLAPSE_LINES` 15, `USER_COLLAPSE_CHARS` 1500. The server-side reply-length rules are in CV-40.
