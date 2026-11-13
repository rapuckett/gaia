#!/usr/bin/env bash
#
# Lands a finished, signed-off branch on the integration branch
# (.claude/workflow.json `integrationBranch`), as one merge commit pushed as a
# fast-forward. The only way that branch moves; nobody pushes it by hand.
#
#   <main checkout>/.local/dev/integrate.sh <branch>   from that branch's worktree
#   <main checkout>/.local/dev/integrate.sh --status   who holds the lock
#
# It lives in the main checkout's .local/dev/ (git-ignored through
# .git/info/exclude: nothing of the team's is committed on this fork) and
# acts on the checkout it is run from.
#
# In order:
#   1. The worktree is on <branch> with nothing uncommitted, and the owner's
#      sign-off marker (.claude/integration-signoff.json in the worktree,
#      written by the signoff skill) names it and is under 60 minutes old:
#        {"schema":1,"branch":"<branch>","commit":"<40-hex the owner saw>",
#         "signedOffAt":"<UTC ISO>","choice":"web"|"mobile"|"merge",
#         "yolo":true (optional),"fixIntegration":true (optional)}
#      After `commit` the branch may gain only merges.
#   2. A red nightly (.local/integration-red in the main checkout) refuses
#      everything but a marker with "fixIntegration": true.
#   3. The lock: mkdir /tmp/<repo>-integration-<name>.lock with an owner file
#      (pid, start time, branch, lane). A live holder is waited for; a dead
#      one is taken over.
#   4. git fetch; origin/<integration> is merged into the branch when it moved
#      (a conflict stops here, for the lane to merge by hand).
#   5. The fast checks (.local/dev/verify.sh --fast origin/<integration>).
#   6. A merge commit (first parent origin/<integration>, second the branch)
#      pushed as a fast-forward; the main checkout follows when it is clean
#      and on the integration branch. The marker is consumed, the lock freed.
#
# Exit: 0 landed, 1 refused or failed (nothing pushed), 2 usage.

set -euo pipefail
for v in $(env | sed -n 's/^\(GIT_[A-Za-z_]*\)=.*/\1/p'); do unset "$v"; done

die() { echo "integrate: $*" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
top="$(git rev-parse --show-toplevel 2>/dev/null)" || die "run this from the branch's worktree"
main="$(dirname "$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)")"
integration="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("integrationBranch") or "")' "$main/.claude/workflow.json" 2>/dev/null || true)"
[[ "$integration" =~ ^integration/[A-Za-z0-9-]+$ ]] || die "no integrationBranch in $main/.claude/workflow.json"
lock="/tmp/$(basename "$main")-integration-${integration#integration/}.lock"

# Trimmed at both ends, as dk-heavy compares it: macOS pads `ps -o lstart=` with spaces.
started_of() { ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//;s/ *$//' || true; }
holder_alive() {
    [ -f "$lock/owner" ] || return 1
    local pid started
    pid="$(sed -n 's/^pid=//p' "$lock/owner")"
    started="$(sed -n 's/^started=//p' "$lock/owner" | sed 's/ *$//')"
    [ -n "$pid" ] && [ "$(started_of "$pid")" = "$started" ]
}

if [ "${1:-}" = "--status" ]; then
    if holder_alive; then cat "$lock/owner"; else echo "free: $lock"; fi
    exit 0
fi
[ "$#" -eq 1 ] && [ "${1#-}" = "$1" ] || { echo "usage: integrate.sh <branch> | --status" >&2; exit 2; }
branch="$1"

# 1. The branch and its sign-off.
cd "$top"
[ "$(git symbolic-ref --short -q HEAD)" = "$branch" ] || die "run this from the worktree that has $branch checked out"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "$branch has uncommitted changes"
marker="$top/.claude/integration-signoff.json"
[ -f "$marker" ] || die "no sign-off marker at $marker (the signoff skill writes it)"
read -r m_branch m_commit m_age m_fix < <(python3 -I - "$marker" <<'PY'
import json, sys, datetime
m = json.load(open(sys.argv[1]))
if m.get("schema") != 1:
    sys.exit("integrate: the marker's schema is not 1")
at = datetime.datetime.strptime(m["signedOffAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
age = int((datetime.datetime.now(datetime.timezone.utc) - at).total_seconds())
print(m.get("branch", ""), m.get("commit", ""), age, "1" if m.get("fixIntegration") is True else "0")
PY
)
[ "$m_branch" = "$branch" ] || die "the marker names $m_branch, not $branch"
[ "$m_age" -le 3600 ] && [ "$m_age" -ge -300 ] || die "the sign-off is older than 60 minutes; ask again"
git merge-base --is-ancestor "$m_commit" HEAD 2>/dev/null || die "the commit the owner signed off ($m_commit) is not on $branch"
# Commits a failed attempt merged in from the integration branch are not new authored work.
[ -z "$(git rev-list --no-merges "$m_commit..HEAD" "^origin/$integration")" ] || die "$branch gained commits after the sign-off; ask again"

# 2. The line.
if [ -f "$main/.local/integration-red" ] && [ "$m_fix" != 1 ]; then
    die "$integration is red ($main/.local/integration-red): only a fix lands (\"fixIntegration\": true)"
fi

# 3. The lock.
while ! mkdir "$lock" 2>/dev/null; do
    if holder_alive; then
        echo "integrate: waiting for the lock ($(sed -n 's/^branch=//p' "$lock/owner"))" >&2
        sleep 5
    else
        rm -rf "$lock"
    fi
done
trap 'rm -rf "$lock"' EXIT
printf 'pid=%s\nstarted=%s\nbranch=%s\nlane=%s\n' "$$" "$(started_of $$)" "$branch" "${AGENT_LANE:-}" >"$lock/owner"
# The gate runs the checks under this lock as a landing, ahead of ordinary jobs.
export AGENT_HOST_HEAVY_PRIORITY="$lock"

# 4. Level with the integration branch.
git fetch -q origin
target="origin/$integration"
if ! git merge-base --is-ancestor "$target" HEAD; then
    git merge --no-edit -q "$target" || { git merge --abort; die "merging $target into $branch conflicts; merge by hand, then land again"; }
fi

# 5. The fast checks.
"$here/verify.sh" --fast "$target"

# 6. One merge commit, pushed as a fast-forward.
commit="$(git commit-tree "HEAD^{tree}" -p "$target" -p HEAD -m "Merge $branch into $integration")"
git push origin "$commit:refs/heads/$integration"
rm -f "$marker"
if [ "$(git -C "$main" symbolic-ref --short -q HEAD)" = "$integration" ] && [ -z "$(git -C "$main" status --porcelain --untracked-files=no)" ]; then
    git -C "$main" fetch -q origin && git -C "$main" merge -q --ff-only "$target" || echo "integrate: the main checkout did not follow; pull it by hand" >&2
fi
echo "integrate: landed $branch on $integration as $commit"
