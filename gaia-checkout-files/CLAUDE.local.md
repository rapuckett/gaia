# How we work here (the rapuckett/gaia fork)

Local only: this file is git-ignored through `.git/info/exclude`. The full
facts are in `~/.claude/skills/create-team/projects/gaia.md`, which wins if
this copy drifts. Upstream's CLAUDE.md follows; this file wins on the fork.

- **Nothing of ours is committed.** No Claude files, no dotfiles of ours, no
  dev scripts, no notes. Only product code that would make sense upstream.
  Our files live untracked in `/Users/rapuckett/Projects/gaia/.local/`
  (`dev/`, `notes/`, the ledger) and, for the global skills,
  `.claude/workflow.json` and `.claude/dev-kit.json`. Check `git status`
  before every commit.
- **No upstream contact.** Never push to, open a pull request on, comment on
  or file an issue on `amd/gaia` unless Rich says so. Pass
  `--repo rapuckett/gaia` to `gh`.
- **Worktrees:** every change is made in its own worktree under `.worktrees/`
  (`~/.claude/dev-kit/bin/dk-worktree-setup <path>`). The main checkout stays
  clean on `integration/rapuckett`.
- **Landing:** the `signoff` skill, then
  `/Users/rapuckett/Projects/gaia/.local/dev/integrate.sh <branch>` from the
  worktree. Never a hand push. Release PRs to the fork's `main` are opened by
  the Lead, from the main checkout.
- **Checks:** `/Users/rapuckett/Projects/gaia/.local/dev/verify.sh`
  (`--fast <base>` for a landing). Heavy jobs go through
  `/Users/rapuckett/Projects/gaia/.local/dev/heavy.sh`.
- **Cost records:** `node /Users/rapuckett/Projects/gaia/.local/dev/estimate.mjs`
  (`forecast … --record` at dispatch, `actual <id> --agent <id>` at the end).
- **No AI attribution** in commits or PRs. **US English** in what people read.
- Rich's installed GAIA (`/Applications/gaia-desktop.app`, `~/.gaia`) is a
  development install: it may be tested against, restarted or reset, and its
  data lost (Rich, 2026-11-12). Release owns it. Repeatable tests still use
  their own `GAIA_HOME`.
