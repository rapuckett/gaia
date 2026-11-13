# Spec for `chat-drawer` (est 04639c93): Chat list drawer: groups, open a chat, status dot, private and unsent marks, list errors

Generated from `parity-matrix.md` by `.local/dev/parity-spec.mjs`. 11 rows. These rows are the definition of done: Parity accepts the screen against them, in English and Arabic.

- **Labels** are quoted from main's web UI catalogs (`src/gaia/apps/webui/src/i18n/locales/en.ts`, key in backticks). Use the same keys through the app's `useT`; a label the web UI hard-codes (no key) gets a new key in en.ts and ar.ts, never a literal.
- **The web reference** is the component named in each row, under `src/gaia/apps/webui/src/components/`. Read it for behavior, order and states, and build the phone version; don't copy its DOM or CSS.
- **States** listed for a row must all be reachable and shown. **Notes** say what changes on a phone (hover-only, keyboard-only, desktop-only) and what the reference gets wrong at phone widths (don't copy those).

## Reference shots: main at phone widths

Main's own UI, rendered from the repo's fixtures (Design's audit, `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/index.md`). Files are `widths/<surface>/<320|390|768|1280>-<light|dark>-<en|ar>.png`; the contact sheet shows them all.

- `sidebar-drawer`: `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/widths/sidebar-drawer/` and `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/contact/sidebar-drawer.png`

## SB-01: Sidebar container; becomes a slide-in drawer at 768 px wide or narrower

- **Labels:** aria "Chats" (`sidebar.label`)
- **States:** open, collapsed (desktop only), phone drawer
- **API:** —
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Phone mode (`useMediaQuery('(max-width: 768px)')`) already exists in the web UI: drawer, row actions behind a "⋯" menu, drawer closes after a pick. The native app's equivalent is a drawer or tab.

## SB-02: Brand mark and "GAIA" wordmark

- **Labels:** "GAIA" (hard-coded; robot image)
- **States:** collapsed shows icon only
- **API:** —
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Decorative.

## SB-03: Collapse / expand toggle (on a phone it is a close X for the drawer)

- **Labels:** "Collapse sidebar", "Expand sidebar"; title adds the Ctrl+B shortcut
- **States:** —
- **API:** —
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Persisted collapse state is desktop only.

## SB-04: Drag-to-resize handle

- **Labels:** aria "Resize sidebar" (hard-coded)
- **States:** dragging
- **API:** —
- **Web reference:** SidebarResizer.tsx
- **Since / PC-only / status:** 0.25.4 / No / missing
- **Notes:** Desktop pointer feature: 200 to 420 px, default 260, double-click resets, drag below the minimum collapses it, Arrow/Home/End keys, width in localStorage. No touch equivalent needed.; Arabic 0.25.4 shows this in English (Design's Arabic pass, .local/audit/2026-11-12/installed-0.25.4): English only in the Arabic ARIA: "Resize sidebar". it bypasses the catalogs (see 2026-11-12-webui-visible-literals.md; the prq-strings tasks move it)

## SB-13: Chat list in groups

- **Labels:** group headings "Needs you", "Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older" (`sidebar.group.*`); nav aria "Recent chats" (`sidebar.recent`)
- **States:** empty "No chats yet." (`sidebar.empty`)
- **API:** GET /api/sessions (loaded by App)
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** 0.25 had Today to Older only. "Needs you" and "Pinned" are 0.26. A chat appears in one group only.; Arabic direction bug in the reference at 390,1280 px (0.25.4 Arabic pass, .local/audit/2026-11-12/installed-0.25.4/index.md): home, sidebar: "Bidi: the period of \"(No chats yet.)\" lands on the wrong side" (empty-state line of the Recent chats list). The app must get this right; check main

## SB-14: Row: open a chat

- **Labels:** aria is built from title, status, "{n} not sent" or "{n} to send", "unread"
- **States:** active, unread, moved
- **API:** GET /api/sessions/{id}, GET /api/sessions/{id}/messages (ChatView)
- **Web reference:** Sidebar.tsx (SessionRow)
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Unread rows are bold and cleared when the chat is focused (`POST /api/sessions/{id}/read`, SB-24).

## SB-15: Row status dot and place in line

- **Labels:** "Running", "Waiting for the GPU", "Waiting for you", "Done", "Failed" (`row.status.*`); suffix "{ordinal} in line" (hard-coded)
- **States:** running, queued, waiting on a question or permission, done (until read), failed (until next turn)
- **API:** —
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25.4 / No / missing
- **Notes:** 0.25 only showed a spinner (aria "Running") on running rows.

## SB-16: Row: private-chat icon

- **Labels:** aria "Private chat" (`row.private`)
- **States:** —
- **API:** —
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** —

## SB-17: Row: unsent-message note

- **Labels:** "{n} not sent", "{n} to send" (hard-coded), joined with the place in line by " · "
- **States:** failed (red) vs waiting
- **API:** —
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25.4 / No / missing
- **Notes:** Counts that chat's message queue (CMP-11 to CMP-13).

## SB-23: List-level errors

- **Labels:** hard-coded "Could not delete the chat.", "Could not rename the chat.", "Could not mark the chat read: {error}", pin errors
- **States:** role=alert
- **API:** —
- **Web reference:** Sidebar.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Delete error is 0.25; the rest 0.26.

## APP-12: Sidebar behavior

- **Labels:** collapsible (`Ctrl+B`), `max-width: 768px` closes it by default; overlay scrim; "Open sidebar" hamburger
- **States:** —
- **API:** none
- **Web reference:** `App.tsx`
- **Since / PC-only / status:** 0.25 / no / missing
- **Notes:** Arabic 0.25.4 shows this in English (Design's Arabic pass, .local/audit/2026-11-12/installed-0.25.4): English only in the Arabic ARIA: "Open sidebar". it bypasses the catalogs (see 2026-11-12-webui-visible-literals.md; the prq-strings tasks move it)
