# Project overlay: diffusitron-react-native

Active roles: lead, design, mobile, sre

Read after `team.md` and your `roles/<role>.md`. Facts for this repo only; its `CLAUDE.md` (780 lines) is the authority. Drafted 2026-10-18 from the repo, read-only. Roles are a proposal until the owner confirms them with the one AskUserQuestion in SKILL.md step c.

## Shared facts

- **Repo:** GitHub `supernervous/diffusitron-react-native`, local `~/Projects/diffusitron-react-native`. Expo / React Native app (iOS, Android, web at `app.diffusitron.ai`), Firebase backend (`firebase/`, multi-codebase functions, `deploy.sh`), Vercel for web, store builds made locally with fastlane and Xcode (no EAS; eas.json is absent). Shared package `@supernervous/shared` (`scripts/shared.sh`).
- **Owner:** Rich. His own dev server is on 8081 (the repo says never assume 8081) and the user manages service start/stop (CLAUDE.md: never start or stop dev servers for him).
- **How work lands (repo rule, CLAUDE.md "Worktree sign-off", "Never a PR"):** no pull requests, ever (`gh pr` is blocked by a global hook). Implement in a worktree, verify tsc + lint + tests, then the 3-option AskUserQuestion (verify on RN simulator via `scripts/inspect-worktree.sh`, verify on web via `scripts/dev-web.sh <port> --worktree` + `scripts/debug-browser.sh <port>`, or just merge and delete). Write `.claude/worktree-signoff.json` after the answer and `.claude/merge-lock.json` around the `git merge --no-ff` into the main checkout. Worktrees sit beside the repo (`../diffusitron-rn-wt-*`, `../diffusitron-react-native-wt-*`), `.claude/worktrees/` and `.superpowers/sdd/`. A spec or plan doc lands promptly, not parked.
- **Release:** `scripts/release.sh web|ship|publish|status` pushes `main` to trigger the Vercel build, then promotes (deploy: owner call). Firebase changes: say the `deploy.sh --env=dev|prod --only ...` command in the reply every time.
- **Checks:** `npm run typecheck`, `npm run lint`, `npm test` (pre-commit hook runs the unit tests plus `scripts/git-hooks/secret-leak-guard.sh`). No `npm run verify`, no pre-push hook, no nightly.
- **Load gate:** `scripts/heavy.sh` wraps jest and delegates to agent-host's `scripts/dev/heavy.sh` (path in `AGENT_HOST_HEAVY_SH`); skipped when `CI` is set. Builds, simulators and web exports are not gated.
- **Ledger:** `.local/agent-ledger.tsv` does not exist yet (no `.local/` dir here); create it when the first sub-agent row is logged.
- **Central:** `~/.claude/lanes/diffusitron-react-native.json` exists (lane `follow-post-notifications` only). Hooks `report-status.sh` and `repo-state-check.sh` already call `central.mjs` from the sibling diffie-central checkout. `diffie-central` calls `firebase/functions-ops`.
- **CI:** two GitHub-hosted workflows, `.github/workflows/verify.yml` (endpoint integrity, `ubuntu-latest`) and `coverage.yml` (jest + Codecov, `ubuntu-latest`), both on PR and push to main.
- **Ports:** 8500 is this repo's canonical `main` web server (`scripts/dev-web.sh`, moved from 8600 on 2026-10-18; agent-host owns 8600, 8443, 18080). Worktree servers use explicit ports (CLAUDE.md example 8700). Avoid 8443, 18080, 8643, 8671 (agent-host). Browsers only through `scripts/debug-browser.sh` (records to `~/.claude/launch-registry.jsonl`); stop with `--stop <port>`.
- **Style of replies (CLAUDE.md "Output Preferences"):** terse, tentative, no absolutist or exuberant words, say "address" not "fix". Its Gen X / zoomer slang line is a repo preference, not a team rule.
- **Never commit:** Firebase config files, service-account JSON, keystores (several sit untracked in the repo root: do not print or move them).

## Lead

- Runs sign-off and the merge lock; only the Lead merges to `main`. Subagent briefs must state the no-stash rule explicitly (CLAUDE.md, 2026-09-23 incident). `enforce-subagent-impl.sh` already reminds every prompt to implement in a worktree through sub-agents; never ask whether to use a sub-agent.
- Use `AskUserQuestion` for any real question (hook `ask-question.sh` mirrors it to Central).

## Design

- Shared docs first: CLAUDE.md "Check the shared docs before writing business logic or UI"; `docs/` holds the guides (haptics, modal conversion, landscape, iPad). Theme system under CLAUDE.md "Theme System"; `useCardStyles()` / `Card*` for surfaces. No closed `@/ui` library or tokens package like agent-host's.
- Web server for looks: 8500 for `main`, `scripts/prod-web.sh <port> [--worktree]` for performance and animation (dev server is not a perf reference).

## Mobile

- Expo (see `app.config.js`), iOS bundle `ai.extropolis.Diffusitron`; React Native Firebase v22+ modular API only; env builds dev / TestFlight-dev / prod (CLAUDE.md "Environment Configuration").
- Scripts: `scripts/run-on-simulator.sh`, `scripts/inspect-worktree.sh` / `stop-worktree-inspection.sh`; docs `docs/worktree-visual-inspection.md`, `docs/android-platform-notes.md`.
- Skills here: only `integration-expo`. The global `mobile-check`, `signoff` and `pull-request` skills apply (since 2026-10-18); `signoff` runs in direct mode here (no `.claude/workflow.json`, so no PRs: merge lock + `git merge --no-ff`).
- Android needs JDK 17 (`~/.gradle/jdks/...`); the Mac default is 22.

## SRE

- Machine: Rich's Mac; kernel-panic history is agent-host's (2026-10-11): one heavy job at a time, even though this repo's only gate covers jest.
- Orphaned browsers and dev servers are a known problem here (CLAUDE.md "Clean up any browser/dev-server process"): kill only by recorded PID/launch-registry.
- CI minutes: both workflows bill on GitHub-hosted runners.

- **Checks (2026-10-18):** no GitHub-hosted CI. `npm run verify` (`verify:fast` runs in pre-push, `verify:full` nightly at 04:30 by the LaunchAgent com.diffusitron.nightly-verify, its own worktree, line stop through central.mjs). Heavy work goes through the one machine-wide gate via `scripts/heavy.sh` (`HEAVY_GATE`).
