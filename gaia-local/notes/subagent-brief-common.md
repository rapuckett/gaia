# Rules for every gaia sub-agent (read first)

The Lead keeps this file. Every brief points here; the brief wins where it differs.

## Where you work
- Repo: Rich's fork of AMD's GAIA, main checkout `/Users/rapuckett/Projects/gaia`, integration branch `integration/rapuckett`.
- Work only in your own worktree under `/Users/rapuckett/Projects/gaia/.worktrees/<lane>-<task>`. Create it with `git -C /Users/rapuckett/Projects/gaia worktree add .worktrees/<lane>-<task> -b <lane>/<task> integration/rapuckett`, then `~/.claude/dev-kit/bin/dk-worktree-setup <path>` if you need the web UI's `node_modules`.
- `node_modules` only ever comes from `dk-worktree-setup` (`npm ci`). Never copy or clone it from another checkout, and never run `npm install` in the web UI or the app unless your branch changes that `package.json`. A lockfile that changes without its `package.json` fails `verify --fast`.
- Run `pytest` with `GAIA_SKIP_WEBUI_BUILD=1` in its environment. Otherwise a test can trigger GAIA's real web UI build, which runs `npm install` and rewrites the web UI's lockfile.
- Python comes from the main checkout's venv: `/Users/rapuckett/Projects/gaia/.venv/bin/python` (3.12). Run `pytest` from your worktree root; the root conftest pins imports to your checkout.

## What gets committed
- **Only product code that would make sense upstream.** No Claude files, notes, dev scripts or dotfiles of ours. Check `git status` before every commit.
- Plain conventional-commit messages, US English, **no AI attribution and no Co-Authored-By trailer**. Code comments follow upstream's CLAUDE.md: short, and only when the why isn't obvious.
- Commit on your branch. **Don't push, don't land, don't merge.** The Lead reviews and lands.

## How the code must be
- Follow the repo's `CLAUDE.md`: fail loudly with actionable errors (no silent fallbacks), extend the existing base classes, update every doc that describes a changed behavior, and keep `amd-gaia.ai` links with their `/docs/` prefix.
- **Reuse GAIA's constants; never hardcode a string it already defines** (Rich). UI copy goes in `src/gaia/apps/webui/src/i18n/locales/{en,ar}.ts` (both languages). API shapes come from `types/api.schemas.json` through `gen:api-types`. Values come from `utils/constants.ts`, `utils/apiBase.ts`, `gaia.config`, `gaia.llm.lemonade_client` and `gaia.ui.models`. Facts about this PC come from `/api/system/status` at runtime. A value you can't import gets a drift test.
- **Be frugal with unit tests** (Rich). Test only material behavior: contracts, security invariants, shipped bugs, logic with real branches. No tests that restate the code, check a constant, assert a mock was called, or snapshot trivial UI. Prefer one behavior-level test.
- A UI change: follow `.claude/skills/reviewing-agent-ui/SKILL.md`. Run `test:rtl`, then read the screenshots in English and Arabic.

## The machine
- **MVP tasks** (the items of milestone `m0-mvp-simulator` in `/Users/rapuckett/Projects/gaia/.local/milestones.json`, or a brief that says "MVP") set `AGENT_HOST_HEAVY_CLASS=release` on every gated run, so they go ahead of non-MVP work. Other tasks leave it unset.
- Heavy jobs go through the gate, one at a time: `/Users/rapuckett/Projects/gaia/.local/dev/heavy.sh <cmd>`. That means test suites, Playwright, builds, `npm ci`, the full lint, evals and device boots. Formatters on a few files and small scripts run directly.
- Checks before you report: **don't run `verify.sh`** (the landing runs it, with priority; running it twice wastes the machine's only heavy slot). Instead run, from your worktree, with the venv first on PATH (`export PATH=/Users/rapuckett/Projects/gaia/.venv/bin:$PATH`, since lint.py calls `black` and `isort` by name): `python util/lint.py --black --isort` on Python changes, `python util/check_added_lines.py` if it exists, your own changed and new test files (`pytest <files>`, `npx vitest run <files>`, the app's `npm run -s typecheck` and `lint`), and `heavy.sh` only around anything suite-sized. Run long jobs in the background and read results with `tail` or `grep`; never paste whole logs.
- **Never touch Rich's installed GAIA:** `/Applications/gaia-desktop.app`, `~/.gaia`, its ports (check `ps`), Lemonade 9000/56984, llama-server 8001. A dev backend gets its own `GAIA_HOME` in your scratchpad, on ports 4210-4229. Vite dev runs on 5180-5199.
- Never `git stash` and never `--no-verify`. Tests that run git clear every inherited `GIT_*` variable. Stop processes only by a PID you recorded. Never print secrets or `.env` files. Throwaway files go in your scratchpad.
- **No binary or toolchain installs:** no `npx playwright install`, browser downloads, `brew`, `nvm install`, Xcode or SDK components. They're machine-wide, and Playwright's install prunes other projects' cached browsers. Use the cached headless shells in `~/Library/Caches/ms-playwright` (set `GAIA_VISUAL_CHROMIUM`). If something truly needs a new binary, stop and report it. Package downloads (npm, pip, Gradle, Pods) from the shared caches are fine.
- No upstream contact of any kind (amd/gaia). Pass `--repo rapuckett/gaia` to `gh`.

## The final report, exactly
```
Outcome: <one paragraph>
Branch+PR: <branch> in <worktree>, commits <shas + subjects>
Tests: <commands run and their result lines>
Blockers: <none or what>
Usage: <approx tool uses and minutes>
```
