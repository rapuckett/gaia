# create-team

A user-level Claude Code skill that starts a team of Claude Code sessions for a repo. Type `/create-team` in a session in the repo: that session becomes the **Dev Lead**, and **Design**, **Mobile** and **SRE** (plus whatever else the project overlay lists, such as **Parity** and **Release**) open as separate sessions in VS Code Claude Code tabs (iTerm2 tabs with `--iterm`), each told who the Lead is and pointed at its job description.

## Use

```
/create-team                       # the project's active roles except lead, in this session's permission mode
/create-team sre,mobile            # only these roles
/create-team --mode acceptEdits    # a different mode (all roles share one)
/create-team --dry-run             # show the commands, open nothing
/create-team add sre               # start one more role later
/create-team list                  # the roles and which are live
```

Every role is a peer session; they message each other directly. Which roles a project runs is the `Active roles:` line in `projects/<repo-dir>.md`. For a new repo the Lead drafts that overlay and proposes the active roles in one question.

The universal machine and git safety rules are in `~/.claude/CLAUDE.md` ("Machine and git safety"); `team.md` points there instead of repeating them.

After a crash, don't use this: bring the existing sessions back with the project's lanes resume (agent-host: `scripts/dev/lanes.sh resume`). `/create-team` starts fresh ones.

## Files

| Path                     | What it is                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `SKILL.md`               | The procedure the invoking session follows.                                                       |
| `team.md`                | The shared operating agreement: who decides what, sign-off chain, escalation, messaging, safety.  |
| `roles/<role>.md`        | One generic role description per role. The first line is the role's identity.                    |
| `projects/<repo-dir>.md` | The project overlay: facts for one repo, per role. Drafted by the Lead for a new repo.            |
| `bin/launch.sh`          | Opens the tabs (`--help`). VS Code by default, `--iterm` for iTerm2; never takes focus; `--dry-run` opens nothing.                 |
| `source-cards/`          | The cards the live sessions wrote on 2026-10-12, verbatim. Provenance: don't edit.                |

## Update a role

- **Small change:** edit `roles/<role>.md` (generic) or `projects/<repo>.md` (one repo only). Keep the first line `You are the <Role> of this team.`; `launch.sh` reads the role's name from it.
- **New role:** add `roles/<name>.md` in the same shape and a row in `team.md`'s table, then add it to a project's `Active roles:` line (or start it once with `/create-team add <name>`).
- **Refresh from live sessions:** ask each running role for a new card in `source-cards/TEMPLATE.md`'s shape, save it as `source-cards/<role>-<YYYY-MM-DD>.md`, then fold the changes into `roles/` (generic) and `projects/` (THIS PROJECT ONLY).

Commit changes here: this folder is a local git repo with no remote. Never push it.
