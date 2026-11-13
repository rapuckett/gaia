# GAIA mobile team: local files (moved 2026-11-13)

Files that live outside git on the original Mac, saved so the team can resume elsewhere. This is not product code; don't merge this branch.

| Folder here | Goes back to |
| --- | --- |
| `gaia-local/` | `<gaia checkout>/.local/` (notes, dev scripts, ledger, estimates, milestones) |
| `gaia-checkout-files/` | `<gaia checkout>/CLAUDE.local.md`, `.claude/workflow.json`, `.claude/dev-kit.json` |
| `create-team-skill/` | `~/.claude/skills/create-team/` |
| `memory/` | `~/.claude/projects/<project key>/memory/` |

These were left out on purpose and are only in the private bundle `gaia-handoff-2026-11-13.tgz`: the T1 security review, the T1 backend plan, the transport options and the parity backlog. They describe security gaps in upstream GAIA that haven't been reported.

Code is on `mobile` (the integration branch plus 12 work branches merged) and `mobile-wip/<lane>/<task>` (every work branch, with in-progress work committed as "wip"). Five branches conflict with the combined branch and are only in `mobile-wip/*`: lead/schema-export, mobile/native-deps, mobile/shell, mobile/mobile-access-start, mobile/phone-pairing.
