# Spec for `str-markdown` (est c61d25ea): Native Markdown answers: code blocks with copy, document citations, library notices

Generated from `parity-matrix.md` by `.local/dev/parity-spec.mjs`. 4 rows. These rows are the definition of done: Parity accepts the screen against them, in English and Arabic.

- **Labels** are quoted from main's web UI catalogs (`src/gaia/apps/webui/src/i18n/locales/en.ts`, key in backticks). Use the same keys through the app's `useT`; a label the web UI hard-codes (no key) gets a new key in en.ts and ar.ts, never a literal.
- **The web reference** is the component named in each row, under `src/gaia/apps/webui/src/components/`. Read it for behavior, order and states, and build the phone version; don't copy its DOM or CSS.
- **States** listed for a row must all be reachable and shown. **Notes** say what changes on a phone (hover-only, keyboard-only, desktop-only) and what the reference gets wrong at phone widths (don't copy those).

## Reference shots: main at phone widths

Main's own UI, rendered from the repo's fixtures (Design's audit, `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/index.md`). Files are `widths/<surface>/<320|390|768|1280>-<light|dark>-<en|ar>.png`; the contact sheet shows them all.

- `finished-answer`: `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/widths/finished-answer/` and `/Users/rapuckett/Projects/gaia/.local/audit/2026-11-12/main-fixtures/contact/finished-answer.png`

## CV-24: Assistant answer body (Markdown)

- **Labels:** (rendered content)
- **States:** streaming cursor, cleaned of tool-call JSON, Windows paths linkified
- **API:** —
- **Web reference:** MessageBubble.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** GFM tables (`md-table-wrap` scrolls sideways), headings h1 to h4 shrink to h2 to h5, lists, blockquotes, links open in a new tab, soft line breaks, right-to-left per block. Dangerous HTML elements are disallowed and URLs are sanitized.

## CV-25: Code block

- **Labels:** language tag (or "code"); "Copy" (`code.copy`) then "Copied" (`code.copied`); aria "Copy code" (`code.copyAria`); "Expand ({size})" (`code.expand`) and "Collapse" (`code.collapse`)
- **States:** collapsed past 25 lines (past 20 while streaming); always left to right
- **API:** —
- **Web reference:** MessageBubble.tsx
- **Since / PC-only / status:** 0.25 / No / missing
- **Notes:** Copy is 0.25; expand and collapse are 0.26. Horizontal scroll needed on a phone.

## CV-27: Document citation links

- **Labels:** link text is the file name; title "Open {name}" (`citation.open`) or "Open page {page}" (`citation.openPage`)
- **States:** —
- **API:** GET /api/documents/{id}/file (page in the URL)
- **Web reference:** MessageBubble.tsx
- **Since / PC-only / status:** 0.25.4 / No / missing
- **Notes:** Links for a library document named in the answer and for each cited page, including "pp. 175 and 205". Opens a new browser tab; in the desktop app it opens in the browser. A phone needs an in-app viewer or the system browser. Guide: "Analyze Any Document".

## CV-53: Library notices on a message

- **Labels:** server text lines (role=note)
- **States:** —
- **API:** —
- **Web reference:** ChatView.tsx
- **Since / PC-only / status:** 0.26 / No / missing
- **Notes:** Notes such as "added to your library as a copy" come from the server in the message record.
