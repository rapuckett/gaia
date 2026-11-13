#!/usr/bin/env bash
#
# Opens one iTerm2 tab per team role, each running a fresh Claude Code
# session that already knows its job (the /create-team skill, SKILL.md).
#
#   launch.sh --repo <dir> --lead <peerName> --mode <permissionMode> [--vscode | --iterm] [--roles a,b] [--delay 20] [--dry-run]
#
# VS Code is the default (owner, 2026-11-12: "Can we use the VS Code extension
# instead?"). The repo's folder is opened in VS Code in the background
# (`open -g -a "Visual Studio Code" <repo>`), so it is the window that gets the
# links, then each role opens as a new Claude Code editor tab through the
# extension's link
#   vscode://anthropic.claude-code/open?prompt=<start prompt>
# opened with `/usr/bin/open -g` (no focus taken). The link carries only the
# prompt: VS Code's settings decide the permission mode, and AGENT_LANE isn't
# set, so the start prompt names the lane to claim. --iterm keeps the old
# behavior below.
#
# With --iterm each tab runs
#   cd <repo> && AGENT_LANE=<role> claude --permission-mode <mode> '<start prompt>'
# with every value shell-quoted. The start prompt points the session at
# team.md, roles/<role>.md and projects/<repo dir name>.md (if it exists).
# --roles defaults to the overlay's "Active roles:" line (or, with no such
# line, every roles/*.md), minus lead: the session that runs /create-team is
# the Lead. All roles start in one permission mode, because
# sessions in different modes can't message each other.
#
# Tabs open --delay seconds apart (20): each claude start is heavy, and the
# owner's Mac kernel-panicked under load on 2026-10-11. Before each tab, if
# the repo has a load gate (scripts/dev/heavy.sh) that understands --held,
# it waits while a heavy-job slot is held (bounded, then goes ahead with a
# warning). An older gate without --held is not asked.
#
# It never brings iTerm forward: the tabs join the current window, or a new
# window is created without activating the app. --dry-run prints the
# commands and opens nothing.

set -euo pipefail

usage() {
    sed -n '6p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

case "${1:-}" in
    -h | --help)
        usage
        exit 0
        ;;
esac

command -v python3 >/dev/null 2>&1 || {
    echo "launch: python3 is required." >&2
    exit 2
}

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CREATE_TEAM_SKILL_DIR="$SKILL_DIR"

exec python3 -I - "$@" <<'PY'
import os, re, shlex, subprocess, sys, time

skill_dir = os.environ["CREATE_TEAM_SKILL_DIR"]
roles_dir = os.path.join(skill_dir, "roles")
MODES = ("acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan")
GATE_WAIT_MAX_S = 1800
GATE_POLL_S = 15


def die(message, code=2):
    print(f"launch: {message}", file=sys.stderr)
    sys.exit(code)


args = sys.argv[1:]
repo = lead = mode = None
roles = None
delay = 20
dry = False
target = None
while args:
    flag = args.pop(0)
    if flag == "--dry-run":
        dry = True
    elif flag in ("--vscode", "--iterm"):
        if target is not None and target != flag[2:]:
            die("--vscode and --iterm exclude each other.")
        target = flag[2:]
    elif flag in ("--repo", "--lead", "--mode", "--roles", "--delay"):
        if not args:
            die(f"{flag} needs a value.")
        value = args.pop(0)
        if flag == "--repo":
            repo = value
        elif flag == "--lead":
            lead = value
        elif flag == "--mode":
            mode = value
        elif flag == "--roles":
            roles = [part.strip() for part in value.split(",") if part.strip()]
        else:
            if not value.isdigit():
                die("--delay must be a whole number of seconds.")
            delay = int(value)
    else:
        die(f"unknown option {flag}.")

target = target or "vscode"
if not repo or not lead or not mode:
    die("--repo, --lead and --mode are required.")
repo = os.path.realpath(os.path.expanduser(repo))
if not os.path.isdir(repo):
    die(f"{repo} is not a folder.")
if not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", lead):
    die("--lead must be the Lead's peer name, such as myrepo-16.")
if mode not in MODES:
    die(f"--mode must be one of {', '.join(MODES)}.")

repo_name = os.path.basename(repo)
overlay = os.path.join(skill_dir, "projects", f"{repo_name}.md")


def active_roles():
    # The overlay's "Active roles: a, b, c" line; None when there is none.
    try:
        with open(overlay) as handle:
            for text in handle:
                match = re.match(r"\s*Active roles:\s*(.*)$", text)
                if match:
                    return [part.strip() for part in match.group(1).split(",") if part.strip()]
    except FileNotFoundError:
        return None
    return None


known = sorted(name[:-3] for name in os.listdir(roles_dir) if name.endswith(".md"))
if roles is None:
    active = active_roles()
    roles = [name for name in (active if active is not None else known) if name != "lead"]
unknown = [name for name in roles if name not in known]
if unknown:
    die(f"no such role: {', '.join(unknown)}. Known: {', '.join(known)}.")
if "lead" in roles:
    die("lead is the session running /create-team; it is not launched.")
if len(set(roles)) != len(roles):
    die("a role is listed twice.")
if not roles:
    die("no roles to launch.")

home = os.path.expanduser("~")


def shown(path):
    # The prompt names files the way the role cards do (~/.claude/...).
    return "~" + path[len(home):] if path.startswith(home + os.sep) else path


def title_of(role):
    # The role file's first line is "You are the <Role> of this team."
    with open(os.path.join(roles_dir, f"{role}.md")) as handle:
        match = re.match(r"You are the (.+) of this team\.", handle.readline().strip())
    return match.group(1) if match else role


def prompt_for(role):
    return (
        f"You are the {title_of(role)} of this team. The Dev Lead is {lead}. "
        f"Read {shown(os.path.join(skill_dir, 'team.md'))}, "
        f"{shown(os.path.join(roles_dir, role + '.md'))} and, if it exists, "
        f"{shown(overlay)}, then run your START-UP and report to the Lead. "
        f"Your lane is {role}."
    )


gate = os.path.join(repo, "scripts", "dev", "heavy.sh")
gate_has_held = False
if os.path.isfile(gate) and os.access(gate, os.X_OK):
    try:
        with open(gate, errors="replace") as handle:
            gate_has_held = re.search(r"^\s*--held\)", handle.read(), re.M) is not None
    except OSError:
        gate_has_held = False


def slot_held():
    # heavy.sh --held: exit 0 when a slot is held, 1 when none is.
    result = subprocess.run([gate, "--held"], cwd=repo, capture_output=True)
    return result.returncode == 0


def wait_for_gate(role):
    if not gate_has_held:
        return
    waited = 0
    while slot_held():
        if waited >= GATE_WAIT_MAX_S:
            print(f"warning: a heavy-job slot is still held after {waited} s; opening {role} anyway.", file=sys.stderr)
            return
        if waited % 60 == 0:
            print(f"waiting for {role}: a heavy-job slot is held ({waited} s so far).")
        time.sleep(GATE_POLL_S)
        waited += GATE_POLL_S


# No `activate`: the tabs join the current iTerm2 window, or a window is
# created, and the app is never brought forward. The tab is made with the
# default profile (its login shell) and the line is typed into it with
# `write text`: `create ... command` would run the line without a shell, so
# `cd x && claude` would fail, and the tab would close when claude exits. The
# line arrives as an argument, so it needs no AppleScript escaping.
APPLESCRIPT = """on run argv
    set theCommand to item 1 of argv
    set theName to item 2 of argv
    tell application "iTerm2"
        if (count of windows) > 0 then
            tell current window
                set newTab to (create tab with default profile)
                tell current session of newTab
                    set name to theName
                    write text theCommand
                end tell
            end tell
        else
            set newWindow to (create window with default profile)
            tell current session of newWindow
                set name to theName
                write text theCommand
            end tell
        end if
    end tell
end run
"""

if dry:
    if gate_has_held:
        print(f"# gate: {gate} --held would be checked before each tab ({'held now' if slot_held() else 'free now'}).")
    elif os.path.isfile(gate):
        print(f"# gate: {gate} has no --held; not waited on.")
    print(f"# overlay: {overlay} {'exists' if os.path.isfile(overlay) else 'does not exist'}.")

OPEN = "/usr/bin/open"
if target == "vscode":
    import urllib.parse
    if dry:
        print(f"# target: VS Code ({OPEN} -g -a 'Visual Studio Code' {shlex.quote(repo)}, then one link per role).")
    else:
        result = subprocess.run([OPEN, "-g", "-a", "Visual Studio Code", repo], capture_output=True, text=True)
        if result.returncode != 0:
            die(f"VS Code refused to open {repo}: {result.stderr.strip()}", 1)
        time.sleep(5)
    opened = 0
    for role in roles:
        uri = "vscode://anthropic.claude-code/open?prompt=" + urllib.parse.quote(prompt_for(role), safe="")
        if dry:
            print(f"{role}: {OPEN} -g {shlex.quote(uri)}")
            continue
        if opened:
            time.sleep(delay)
        wait_for_gate(role)
        result = subprocess.run([OPEN, "-g", uri], capture_output=True, text=True)
        if result.returncode != 0:
            die(f"VS Code refused the link for {role}: {result.stderr.strip()}", 1)
        print(f"opened {role} in VS Code")
        opened += 1
    sys.exit(0)

opened = 0
for role in roles:
    line = (
        f"cd {shlex.quote(repo)} && AGENT_LANE={shlex.quote(role)} "
        f"claude --permission-mode {shlex.quote(mode)} {shlex.quote(prompt_for(role))}"
    )
    if dry:
        print(f"{role}: {line}")
        continue
    if opened:
        time.sleep(delay)
    wait_for_gate(role)
    result = subprocess.run(["osascript", "-e", APPLESCRIPT, line, f"{repo_name} - {role}"], capture_output=True, text=True)
    if result.returncode != 0:
        die(f"iTerm2 refused the tab for {role}: {result.stderr.strip()}", 1)
    print(f"opened {role}")
    opened += 1
PY
