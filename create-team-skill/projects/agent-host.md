# Project overlay: agent-host

Active roles: lead, design, mobile, sre

Read after `team.md` and your `roles/<role>.md`. These facts are for this repo only. The repo's own `CLAUDE.md` is the authority; this overlay points at it and records what the lanes learned. Source: the four cards in `source-cards/` (2026-10-12).

## Shared facts

- **Repo:** GitHub `extropolis/akira`, local `~/Projects/agent-host`. The main checkout always stays on a clean `main`; work happens in worktrees under `.worktrees/` (`scripts/dev/worktree-setup.sh`, removed with `scripts/dev/worktree-prune.sh`).
- **Owner:** Rich. Owner tasks go through Diffie Central (`mcp__central__human_task`), plus one chat line. Port 8443 is his own host: never touch it.
- **Product name:** comes from `packages/brand`, never a literal.
- **Load gate:** `scripts/dev/heavy.sh` (2 slots, load ceiling 18, disk ceilings), wrapped by `gate.mjs`. Devices through `scripts/dev/device.sh`, one at a time.
- **Ledger:** `.local/agent-ledger.tsv`; `node ~/Projects/diffie-central/mods/central/bin/central.mjs ledger agent-host --since <ISO>` appends usage rows.
- **Central:** lanes recorded in `~/.claude/lanes/agent-host.json`; `central.mjs lanes agent-host` shows each lane's latest report. After a crash: `scripts/dev/lanes.sh resume` brings back existing sessions.
- **Pull requests:** the `pull-request` and `signoff` skills; sign-off marker `.claude/worktree-signoff.json` plus `central.mjs pr-signoff`. CI runs in mode `only` on self-hosted runners (agent-host-mac and Kalin's light mini).
- **Push** over HTTPS with gh credentials (the pre-push verify outlasts SSH).
- **Other humans:** Kalin (@kovtcharov) is reached only through @mentions in our PR bodies and short comments on his PRs; never change or merge his PRs.
- **Never on this Mac:** the full backend test suite, or anything that opens Notes, Reminders, Calendar or Contacts.
- **Windows:** test windows never on the external LG display; prefer headless.
- **Kernel panics** on 2026-10-11 set the low-load rule: one heavy job per lane, no parallel building sub-agents.

## Lead

- Lead peer at the time of the cards: agent-host-16.
- Host on the nzxt box via SSH and Tailscale; relay domain `relay.myakira.io`.
- Sign-off on the owner's behalf: green CI, level, required local checks, scope read; still ask on security invariants, product and brand, spend, publish and deploy, data deletion and Kalin's PRs.

## Design

- Library `app/src/ui`; tokens `packages/tokens`; style guide `docs/clients/style-guide.md`; design rules `docs/design/README.md`; gallery at `/gallery`.
- Brand from `packages/brand`, never literal. Aperture assets in `docs/design/assets/akira-aperture`.
- Dev server ports: 8600 is `main` (`scripts/dev-web.sh`); worktrees use 8610-8640.

## Mobile

- Expo SDK 57 / React Native 0.86; native module `modules/native`; app IDs `ai.extropolis.akira` (plus `.dev`).
- Docs and skills: `docs/clients/mobile-idioms.md`; skills `mobile-check`, `local-ios-simulator`, `pull-request`.
- Scripts: `scripts/dev/heavy.sh`, `scripts/dev/device.sh`; `scripts/local/sim_host.sh` (a confined test host).
- Devices: iPhone 17 Pro (70EF975D...), `mobile-ipad`, `mobile-iphone-se` (smoke only; Rich's phone), AVD `mobile-pixel` (`hw.keyboard=no`).
- Ports: Metro 8630/8672; never 8443, 8600, 8643 or 8671.
- Android builds use JDK 17 from `~/.gradle/jdks`.
- Rich's zsh aliases `dd` to `expo prebuild --clean`: use `/bin/dd`.

## SRE

- Machine: Rich's laptop, 12 cores.
- Monitor: `scripts/dev/load-monitor.sh` (15 s samples in `~/Library/Logs/agent-host-load`) and `scripts/dev/load-report.sh` (`--panics`).
- Devices: `device.sh`, one at a time, idle shutdown after 30 min.
- CI runner: the `ci-runner` account, `setup.sh` (sudo, owner-run), hooks in `/Library/AgentHostCI/hooks`; docs `docs/dev/ci-runner.md`.
- Spotlight: `docs/dev/spotlight.md` and `spotlight-check.sh`.
