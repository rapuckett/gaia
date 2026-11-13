---
name: create-team
description: Spin up the owner's Claude Code team for this repo - this session becomes the Dev Lead and the project's other active roles (Design, Mobile, SRE...) open as peer sessions in VS Code Claude tabs (iTerm2 with --iterm), each already briefed on its job and how the team works together. Also adds one more role later, or lists the roles and which are live. Use when the owner says "create team", "/create-team", "spin up the team", "start the lanes", "start the team", "add the SRE" or "which lanes are running". Not for bringing back crashed sessions (use the project's lanes resume).
argument-hint: "[roles, e.g. sre,mobile] [--mode <permissionMode>] [--dry-run] | add <role> | list"
---

# /create-team

This session becomes the **Dev Lead**. Every other active role opens as a fresh peer session in its own VS Code Claude Code tab (or an iTerm2 tab with `--iterm`), in the same repo and the same permission mode, and reports to you. Peers can message each other directly.

Everything lives in `~/.claude/skills/create-team/`: `team.md` (the shared agreement), `roles/<role>.md` (one per role), `projects/<repo-dir>.md` (the project overlay, with its `Active roles:` line), `bin/launch.sh` (opens the tabs).

`<repo-dir>` is the basename of the main checkout's top folder (not a worktree's).

## Forms

| Form                                               | Does                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/create-team`                                     | Become the Lead and launch the overlay's active roles (all but `lead`).                 |
| `/create-team sre,mobile [--mode m] [--dry-run]`   | The same, for just these roles.                                                         |
| `/create-team add <role> [--mode m] [--dry-run]`   | Start one more role session for this repo, later (you must already be the Lead).        |
| `/create-team list`                                | Show the roles and which are live. Opens nothing.                                       |

## Resume vs create

After a crash or restart, bring the **existing** sessions back with the project's lanes resume (in agent-host: `scripts/dev/lanes.sh resume`; it reads the lanes mirror). `/create-team` starts **fresh** sessions with no history. If the mirror lists lanes whose sessions could be resumed, ask the owner (AskUserQuestion) which they want before launching anything.

The lanes mirror: `~/.claude/lanes/<repo-dir>.json` = `{ "schema": 1, "lanes": { "<lane>": { "sessionId", "cwd", "permissionMode", "model", "lastSeenAt" (ms) } } }`. A session's lane comes from an explicit report claim, then `AGENT_LANE`, then the mirror entry for its sessionId, then its title suffix.

## Procedure: create (no subcommand)

### a. Parse the arguments

- **Roles:** an optional comma list (`sre,mobile`). Default: the overlay's `Active roles:` line, minus `lead`. Unknown role (no `roles/<role>.md`): stop and list the known ones.
- **`--mode <permissionMode>`:** default is **this session's own mode** (your system context says it, for example "bypass permissions mode is active"; the lanes mirror records it too). Sessions in different modes can't message each other, so every role uses one mode. If you can't tell, ask the owner.
- **`--dry-run`:** do everything except open tabs; show the owner the commands.

### b. Become the Lead

1. Read `team.md`, `roles/lead.md`, and `projects/<repo-dir>.md` if it exists.
2. Claim lane `lead`: call `mcp__central__report` with `lane: "lead"`, `state: "working"`, `summary: "Lead: starting the team"`. If that tool isn't available, tell the owner the lane can't be claimed (Central isn't installed or the report tool hasn't landed) and carry on.
3. Find your own peer name (ListAgents shows it); the other roles need it.

### c. Draft the overlay if there is none

If `projects/<repo-dir>.md` doesn't exist, write one from the repo: its `CLAUDE.md`/`AGENTS.md`, README, package files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`...), test and build commands, `scripts/`, CI config, any load gate and any ledger. Shape it like `projects/agent-host.md`: the `Active roles:` line first, then **Shared facts** (repo, remote, owner, gate, ledger, how PRs land, ports to avoid), then one short section per active role with only what that role needs here. Facts, not policy (policy is `team.md`). Include what the global `signoff`, `pull-request` and `mobile-check` skills need: how work lands (PRs, an integration branch and its landing script, or direct merges and the merge lock), the verify command, dev-server and browser scripts, device scripts and ports to avoid.

Propose the active roles with **one** AskUserQuestion: the recommended set first (for example, no Mobile in a repo with no app, no Design in a repo with no UI), then the alternatives. `lead` is always in. Write the answer into the `Active roles:` line. Ask nothing else.

### d. Launch the other roles

```sh
~/.claude/skills/create-team/bin/launch.sh --repo <main checkout> --lead <your peer name> --mode <mode> [--roles a,b] [--dry-run]
```

- Without `--roles` it launches the overlay's active roles minus `lead`. It opens one tab per role, 20 s apart (`--delay`), waits while the repo's heavy-job gate reports a held slot (if the gate supports `--held`), and never brings VS Code or iTerm forward. In VS Code the permission mode comes from VS Code's Claude Code settings, not `--mode`. Tell the owner tabs are about to open (a heads-up, not a question).
- For a dry run, show the printed commands and stop here.
- Confirm each role joined: ListAgents every 30 s or so, up to about 5 minutes after the last tab. A role has joined when a new peer in this repo appears (and, with Central, its lane shows in the mirror or in `central.mjs lanes <repo-dir>`).
- Send each a one-line welcome: "Welcome, <Role>. I'm <your peer name>, the Dev Lead; report to me when your START-UP is done." If one is still missing after the wait, tell the owner which tab to look at.

### e. Run the Lead's START-UP and report

Run the START-UP in `roles/lead.md`. Then tell the owner, in plain language and briefly:

- who is running: each role, its peer name and its tab (`<repo-dir> - <role>`);
- what each will do first (from its role's START-UP and the overlay);
- anything that needs them (filed as a Central human_task, mentioned once).

## Procedure: add <role>

1. Check `roles/<role>.md` exists and the role isn't live already (as in **list**). If it is live, say so and stop.
2. If you aren't the Lead yet in this session, do step **b** first.
3. Run `launch.sh --repo <main checkout> --lead <your peer name> --mode <mode> --roles <role>` (mode as in step **a**).
4. Confirm it joined and welcome it, as in step **d**.
5. If the role isn't in the overlay's `Active roles:` line, ask the owner (one AskUserQuestion) whether to make it permanent; if yes, add it there and a short section for it.

## Procedure: list

Opens nothing. Show one row per role: every role in the overlay's `Active roles:` line, plus any other lane in the mirror.

| Column  | From                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Role    | `Active roles:` (mark roles only in the mirror as "not active")                                        |
| Live    | yes if ListAgents shows a peer for it in this repo, or the mirror's `sessionId` has a running session  |
| Peer    | the ListAgents name                                                                                    |
| Mode    | the mirror's `permissionMode` (flag any that differ from the Lead's)                                   |
| Last seen | the mirror's `lastSeenAt` (milliseconds since the epoch), as a local time                            |
| Covered by | for a role that isn't live, who covers its work meanwhile: the Lead (through sub-agents) unless the overlay names another lane |

A session is running when a `~/.claude/sessions/*.json` has that `sessionId` and its `pid` is alive. A missing mirror means Central hasn't recorded lanes here: say so and show ListAgents only.

## Rules for this skill

- Never launch the `lead` role: this session is the Lead.
- Never launch a role that is already live; check first.
- Don't edit `source-cards/`: it is the provenance. Change roles by editing `roles/*.md` and the overlay (see README.md).
