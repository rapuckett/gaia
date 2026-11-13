---
name: parity-lane-setup
description: "Parity lane in gaia - where the matrix, inventory, upstream watch and its state live, and what the parity target is"
metadata:
  node_type: memory
  type: project
  originSessionId: 64ce907e-adb5-4898-816f-81d54e1da246
  modified: 2026-11-13T03:18:04.338Z
---

The Parity lane (set up 2026-11-12) tracks the React Native (Expo) phone app against GAIA's Agent UI. Everything lives untracked in `/Users/rapuckett/Projects/gaia/.local/` (excluded via `.git/info/exclude`, never committed):

- Matrix: `.local/notes/parity-matrix.md` (v1: 669 rows, 613 targets), built once by `.local/dev/parity-matrix-build.mjs` from the inventory in `.local/notes/parity-inventory/{chat,settings,library}.md` (frozen at `7a6e05c2f`). Edit the matrix by hand now; the builder refuses to overwrite it without `--force`.
- Backlog: `.local/notes/parity-backlog.md` (v1 sent to the Lead 2026-11-12), with decisions D1 (setup on the phone) and D2 (PC-opening file actions) waiting on Rich.
- Upstream watch: `node .local/dev/parity-upstream-watch.mjs --fetch --record` (state in `.local/notes/upstream-watch-state.json`, log in `.local/notes/upstream-watch.md`). It classifies commits since `lastChecked` and diffs the sources the app must follow: i18n en/ar keys, `types/api.schemas.json`, `utils/constants.ts`, `utils/apiBase.ts`, CSS tokens, and Python constants (Rich's reuse-constants rule, 2026-11-12).

- Tools in `.local/dev/`: `parity-matrix-set.mjs` (set status, notes or evidence by ID or `PREFIX-*`, quote the pattern in zsh, `--if <status>` to filter; it keeps the summary true), `parity-since-0254.mjs` (Since = first release: 0.25, 0.25.4 or 0.26), `parity-literal-scan.mjs` and `parity-literal-report.mjs` (visible English that bypasses the catalogs, ranked by backlog tier), `parity-sprint-sync.mjs --fetch --write` (rows go `in progress` when their task's branch exists and get a "landed" note on merge; lists ready acceptance tasks; odd branch names go in `.local/notes/parity-landed-map.tsv`), and `parity-accept-check.mjs --task <epic>-accept --app <src>` (do the rows' keys, labels and routes appear in the app).
- Sprint `mobile-parity` (`.local/notes/2026-11-12-mobile-parity-sprint.md`): Parity owns 19 tasks, the 17 `*-accept` tasks plus `rel-parity-sweep` (and `prq-watch-hook`, done). Rows reach `done` only through acceptance (`.local/notes/parity-acceptance.md`); record each run with `estimate.mjs actual <sprint est id> --agent <id>`. Session crons don't survive a restart: re-create the 30-minute queue check and the daily watch.
- Since 2026-11-12 each lane lands its own reviewed branches on `integration/rapuckett` (Lead's call, to push hard): read the whole diff, read `test:rtl` shots in English and Arabic for UI and let Design glance at new UI, land through the `signoff` skill (yolo: marker with choice "merge") and `integrate.sh <branch>` from the worktree, then send the Lead a one-line FYI with the merge sha. Branches are `<lane>/<task>`.
- MVP push (Rich, 2026-11-12, via the Lead): acceptance paused. Parity builds `chat-drawer`, `chat-new` and `qst-cards` for Mobile's milestone `m0-mvp-simulator` (plan: `.local/notes/2026-11-12-mvp-plan.md`). Specs come from `.local/dev/parity-spec.mjs <task>` and go to `.local/notes/mvp-specs/`.
- Rich's decisions (via the Lead, 2026-11-12): the phone runs full first-run setup; file actions preview or share on the phone and never open on the PC (5 rows `different`); unattended work keeps running while the phone listener is on; Google accounts connect on the PC only; the 56 desktop-shell rows are out.

**Why:** the parity target is main's Agent UI (0.26.x), not Rich's installed `gaia-desktop`. He ran 0.25.0 (no i18n catalog, no Arabic; catalogs arrived in #6165, 2026-10-30) and moved to **0.25.4 at 15:09 on 2026-11-12**, which has the en catalog and most of main's features, so his version moves: check it before quoting his labels.

**How to apply:** quote labels from main's `en.ts`; treat installed-app screenshots (Design captures them into `.local/audit/`) as supporting evidence only; backend-only upstream commits need no parity work because the phone app shares the API. Related: [[installed-gaia-unsafe-gets]].
