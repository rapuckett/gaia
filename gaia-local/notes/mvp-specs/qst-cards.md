# Spec for `qst-cards` (est b782babb): Question and approval-needed cards: answer GAIA's questions from the card or the box

Generated from `parity-matrix.md` by `.local/dev/parity-spec.mjs`. 2 rows. These rows are the definition of done: Parity accepts the screen against them, in English and Arabic.

- **Labels** are quoted from main's web UI catalogs (`src/gaia/apps/webui/src/i18n/locales/en.ts`, key in backticks). Use the same keys through the app's `useT`; a label the web UI hard-codes (no key) gets a new key in en.ts and ar.ts, never a literal.
- **The web reference** is the component named in each row, under `src/gaia/apps/webui/src/components/`. Read it for behavior, order and states, and build the phone version; don't copy its DOM or CSS.
- **States** listed for a row must all be reachable and shown. **Notes** say what changes on a phone (hover-only, keyboard-only, desktop-only) and what the reference gets wrong at phone widths (don't copy those).

## Reference shots: main at phone widths

Main's own UI, rendered from the repo's fixtures (Design's audit, `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/index.md`). Files are `widths/<surface>/<320|390|768|1280>-<light|dark>-<en|ar>.png`; the contact sheet shows them all.

- `waiting-question`: `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/widths/waiting-question/` and `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/contact/waiting-question.png`

## RC-07: Approval-needed card (agent text asked for your OK)

- **Labels:** badge "Approval needed", humanized action name, the action id, the summary, "Nothing was executed. Follow the assistant's guidance below to approve this action." (hard-coded), button "Dismiss", then "Confirmation dismissed"
- **States:** shown, dismissed
- **API:** —
- **Web reference:** ConfirmationCard.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Informational; the real approval is the permission prompt (PRM-01).

## RC-08: Question card (agent asks you something)

- **Labels:** badge "Question" (`question.badge`), "Sensitive" (`question.sensitive`); option buttons (label, description as the tooltip); hint "Type your answer in the message box below, or pick one." / "Type your answer in the message box below." (`question.typeHint*`); countdown "GAIA waits {time} more for an answer." (`question.timeLeft`); sensitive field placeholder "Type your answer (hidden as {mask})" and button "Send" (`question.hiddenPlaceholder`, `question.send`); failure "Failed to send the answer." (`question.sendFailed`)
- **States:** live, submitting, answered ("You answered: {answer}" or "You answered (hidden)."), expired ("This question is no longer waiting for an answer. If you still want to answer it, say so in a new message.")
- **API:** POST /api/chat/user-input {session_id, request_id, value}
- **Web reference:** NeedsInputCard.tsx, QuestionText.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** A password-type input for sensitive answers; the answer is never shown after sending. 0.25 had the sensitive flow and expiry; the type-in-the-box hint and the visible countdown are 0.26. Question text allows a small Markdown subset and isolates direction.
