# Brief for a Parity MVP screen builder (milestone m0-mvp-simulator)

You build ONE screen of GAIA's React Native (Expo) phone app, in `src/gaia/apps/mobile`. The task's spec is
`/Users/rapuckett/Projects/gaia/.local/notes/mvp-specs/<task>.md`: its matrix rows are the definition of done.

## Read first, in this order
1. `/Users/rapuckett/Projects/gaia/.local/notes/subagent-brief-common.md`: the rules for every gaia sub-agent.
   This brief wins where it differs.
2. `/Users/rapuckett/Projects/gaia/.local/notes/2026-11-12-mvp-plan.md`: the MVP's rules, conventions, file
   ownership and the data hooks.
3. `/Users/rapuckett/Projects/gaia/.local/notes/2026-11-12-mobile-ui-api.md`: the `@/ui` contract (Design's).
4. Your spec, then the web reference components it names, under `src/gaia/apps/webui/src/components/`.
5. The app's `README.md` and the files you'll sit beside: `src/app/`, `src/features/`, `src/data/`, `src/i18n/`.

## Where
- Worktree: `git -C /Users/rapuckett/Projects/gaia worktree add .worktrees/parity-<task> -b parity/<task> origin/integration/rapuckett`,
  then install with `npm ci` in the LIGHT slot (SRE's rule: installs don't need the heavy slot when 25 GiB or
  more is free; check with `df -g /`). Run it in `src/gaia/apps/webui` and then in `src/gaia/apps/mobile`:
  `~/.claude/dev-kit/bin/dk-heavy --light npm ci --prefer-offline --no-audit --no-fund`. With less than 25 GiB
  free, use `AGENT_HOST_HEAVY_CLASS=release ~/.claude/dev-kit/bin/dk-worktree-setup <worktree>` instead.
  Every heavy-slot step of MVP work goes at the `release` class.
- **Never `npx playwright install`.** It prunes browsers other projects need. For the web-export shots, use
  the cached headless shell:
  `GAIA_VISUAL_CHROMIUM=$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  passed to Playwright as `executablePath`. Never copy `node_modules`, and never `npm install` unless you change a `package.json`.
- You own only your feature folder (named in your task) and your thin route file in `src/app/`. Don't touch
  `src/app/_layout.tsx`, `src/api`, `src/data`, `src/state`, `src/ui` or `app.config.ts`. A missing hook or UI
  piece is a blocker to report, never something to build yourself. Exception: one re-export line in
  `src/ui/icons.ts` for a Lucide icon, said in your report.
- UI from `@/ui` and `@/ui/icons` only, never react-native's View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, FlatList or Modal. Data only through the `src/data` hooks. Copy only through the app's `useT`,
  with the web UI's existing keys; a label the web UI hard-codes gets a new key in BOTH
  `src/gaia/apps/webui/src/i18n/locales/en.ts` and `ar.ts`. Never a literal string, model name, port or URL:
  runtime facts come from `useSystemStatus()`.
- **Before adding any key, look for one that exists.** Design's strings work is moving the web UI's
  hard-coded labels into the catalogs (e.g. `chat.loadingMessages`, `chat.scrollToBottom`). Search
  `origin/integration/rapuckett`'s en.ts, and Design's branches that aren't landed yet
  (`git show origin/design/i18n-p1:src/gaia/apps/webui/src/i18n/locales/en.ts`, and the same for
  `design/strings-p2`), for the same English. Reuse its key, and say in your report when you used a key from a
  branch that hasn't landed. A duplicate key for the same text is a defect.

## Done means
- Every row of your spec: the same labels (keys), order and states as the web reference, with the phone
  substitutes its Notes ask for. A row you can't finish goes in your report with the reason. Don't fake one.
- Arabic works: the layout mirrors through `@/ui`, and file names, model names and numbers with units go in `Ltr`.
- Tests, frugally (Rich's rule): one behavior-level jest test per real branch of logic, such as grouping,
  states or error handling, against `src/api/fake.ts`. No snapshot or restating tests.
- **Node 22 for everything** (SRE, 2026-11-12: vitest crashes on .nvmrc's Node 20). Put it first on PATH,
  `export PATH=$HOME/.nvm/versions/node/v22.18.0/bin:$PATH`, and start every gated job with `env`,
  because the gate re-picks Node 20 for jobs that start with npm, npx or node.
- Checks, each through the gate at the MVP class (SRE's rule: MVP work goes ahead at the gate):
  `AGENT_HOST_HEAVY_CLASS=release /Users/rapuckett/Projects/gaia/.local/dev/heavy.sh env npm run typecheck`,
  then `... env npm run lint` and `... env npm test`, all run in `src/gaia/apps/mobile`. If you added catalog
  keys, also run the web UI's catalog tests the same way from `src/gaia/apps/webui`: `... env npx vitest run src/i18n`
  (key parity between en and ar, the gloss, and the hard-coded-text baseline). If `floodgate get` says
  `parked`, drop `AGENT_HOST_HEAVY_CLASS` (release would pass a parked gate). Then the web export in headless Playwright at 390
  and 320 wide, English and Arabic, light and dark, one shot per state your rows list where the fake client
  can produce it. Save the shots as `<state>-<width>-<theme>-<en|ar>.png` under
  `/Users/rapuckett/Projects/gaia/.local/audit/mvp/<task>/` (Design reviews new UI from these before it lands). Say what a browser check can't prove; no devices.
- Before you finish, merge (never rebase) `origin/integration/rapuckett` into your branch and rerun the checks.
- Commit on `parity/<task>` with a conventional-commit message, US English, no AI attribution and no
  Co-Authored-By. Don't push, land or merge into integration: Parity reviews and lands.

## Final report, exactly
```
Outcome: <one paragraph: rows done, rows not done and why, any hook or @/ui gap>
Branch+PR: parity/<task> in <worktree>, commits <shas + subjects>
Tests: <commands and their result lines>
Blockers: <none or what>
Usage: <approx tool uses and minutes>
```
