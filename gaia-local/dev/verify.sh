#!/usr/bin/env bash
#
# The team's local checks for this fork (no GitHub-hosted CI runs here).
#
#   <main checkout>/.local/dev/verify.sh                 the full run: what the nightly runs
#   <main checkout>/.local/dev/verify.sh --fast <base>   the landing checks: only the parts
#                                                        the change since <base> touches
#
# Run it from the checkout to check (a worktree, or the nightly's); it lives in
# the main checkout's git-ignored .local/dev/.
#
# Python runs from the main checkout's .venv (worktrees share it: the root
# conftest.py pins src/ to the checkout under test); setup-venv.sh beside this
# script builds it. The web UI and the mobile app need node_modules in the
# checkout (~/.claude/dev-kit/bin/dk-worktree-setup). Node is upstream CI's major,
# not .nvmrc's. Test suites, builds and the full lint
# (pylint and flake8 each take every core) go through the heavy-job gate.

set -euo pipefail
# Tests run git: an inherited GIT_DIR once rewrote a real repo's config.
for v in $(env | sed -n 's/^\(GIT_[A-Za-z_]*\)=.*/\1/p'); do unset "$v"; done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
top="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git rev-parse --show-toplevel)"
main="$(dirname "$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$top" rev-parse --path-format=absolute --git-common-dir)")"
venv="$main/.venv"
webui="$top/src/gaia/apps/webui"
mobile="$top/src/gaia/apps/mobile"
heavy="$here/heavy.sh"
setup="$here/setup-venv.sh"
# util/select_tests.py's coverage map: the nightly writes it, --fast reads it.
map="$main/.local/test_map.json"
# The gate's worker cap: one heavy job at a time, using up to this many cores.
workers="${AGENT_HOST_HEAVY_JOBS:-4}"

mode=full
base=""
if [ "${1:-}" = "--fast" ]; then
    [ -n "${2:-}" ] || { echo "usage: verify.sh [--fast <base>]" >&2; exit 2; }
    mode=fast
    base="$2"
elif [ "$#" -gt 0 ]; then
    echo "usage: verify.sh [--fast <base>]" >&2
    exit 2
fi

if [ ! -x "$venv/bin/python" ]; then
    echo "verify: no Python environment at $venv. Set it up once: $setup" >&2
    exit 2
fi
want="$("$setup" --python)"
have="$("$venv/bin/python" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if [ "$have" != "$want" ]; then
    echo "verify: $venv runs Python $have, but GAIA's pyproject.toml targets $want, as upstream CI and the shipped app do; other versions fail on code nobody touched. Make it again: $setup --rebuild" >&2
    exit 2
fi
export PATH="$venv/bin:$PATH"
cd "$top"
# Upstream CI runs its Node jobs on this major (node-version in .github/workflows), not .nvmrc's v20.
node_major=22
node_bin="$(for d in "$HOME"/.nvm/versions/node/v"$node_major".*/bin; do if [ -x "$d/node" ]; then printf '%s\n' "$d"; fi; done | sort -V | tail -n 1)"
if [ -z "$node_bin" ]; then
    echo "verify: no Node $node_major under ~/.nvm/versions/node, the Node upstream CI runs the web UI and app on. Install one: nvm install $node_major" >&2
    exit 2
fi
export PATH="$node_bin:$PATH"
# dk-heavy re-picks .nvmrc's Node for a job that starts with npm, npx or node; env keeps this one.
node_job=(env)

py=1
web=1
mob=0
if [ -f "$mobile/package.json" ]; then mob=1; fi
if [ "$mode" = fast ]; then
    changed="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git diff --name-only "$base"...HEAD)"
    # A lockfile changed without its package.json is npm re-resolving it, and an older npm
    # than the one that wrote it drops fields such as libc. Never land that by accident.
    for lock in $(grep -E '(^|/)package-lock\.json$' <<<"$changed" || true); do
        pkg="${lock%package-lock.json}package.json"
        if ! grep -qxF "$pkg" <<<"$changed"; then
            echo "verify: $lock changed but $pkg didn't, so npm re-resolved the lockfile. Restore it: git checkout $base -- $lock (to change dependencies, change $pkg in the same branch)." >&2
            exit 2
        fi
    done
    grep -qE '\.py$|^(pyproject\.toml|setup\.py)$' <<<"$changed" || py=0
    grep -q '^src/gaia/apps/webui/' <<<"$changed" || web=0
    grep -qE '^src/gaia/apps/mobile/|^src/gaia/apps/webui/src/types/api\.schemas\.json$|^src/gaia/apps/webui/src/styles/' <<<"$changed" || mob=0
    echo "verify --fast: $(grep -c . <<<"$changed" || true) files since $base (python: $py, web UI: $web, mobile: $mob)"
    [ "$py$web$mob" != 000 ] || echo "verify --fast: no check here covers these files"
fi

if [ "$py" = 1 ]; then
    # Without uv, util/lint.py runs the venv's own isort and mypy instead of its pins.
    if ! command -v uvx >/dev/null 2>&1 && ! drift="$(python -I "$here/lint-pins.py" --check --except pylint util/lint.py)"; then
        echo "verify: ${drift:-lint-pins.py failed (see above)}" >&2
        exit 2
    fi
    echo "== Python lint"
    if [ "$mode" = fast ]; then
        python util/lint.py --black --isort
        python util/check_added_lines.py --base "$base"
    else
        # pylint must be setup-venv.sh's copy apart from GAIA's packages, as uvx would run it.
        if ! command -v uvx >/dev/null 2>&1; then
            if [ "$(readlink "$venv/bin/pylint" 2>/dev/null)" != ../lint-tools/bin/pylint ] \
                || ! drift="$("$venv/lint-tools/bin/python" -I "$here/lint-pins.py" --check --only pylint util/lint.py)"; then
                echo "verify: $venv/bin/pylint isn't the copy in $venv/lint-tools${drift:+: $drift}. Run $setup" >&2
                exit 2
            fi
        fi
        "$heavy" python util/lint.py --all
    fi
    echo "== Python unit tests"
    # A test that reaches gaia.ui.build unmocked npm-installs into a worktree without
    # node_modules and re-saves the web UI's lockfile; unit tests never build the UI.
    export GAIA_SKIP_WEBUI_BUILD=1
    if [ "$mode" = fast ]; then
        # util/select_tests.py picks the test files the change can reach, from the
        # nightly's coverage map; with no map, or a map over 3 days old, it picks them all.
        sel="$(mktemp -t gaia-verify-sel)"
        python util/select_tests.py select --base "$base" --map "$map" --out "$sel"
        if [ -s "$sel" ]; then
            "$heavy" python -m pytest @"$sel" -q -p no:cacheprovider -n "$workers" --dist=worksteal
        else
            echo "verify --fast: no unit test reaches these changes"
        fi
        rm -f "$sel"
    else
        # The full run also rebuilds the coverage map that --fast selects tests from.
        cov="$(mktemp -d -t gaia-verify-cov)"
        COVERAGE_FILE="$cov/.coverage" "$heavy" python -m pytest tests/unit -q -p no:cacheprovider \
            -n "$workers" --dist=worksteal --cov=src/gaia --cov=hub/agents --cov-context=test --cov-report=
        python util/select_tests.py build-map --coverage "$cov/.coverage" --out "$map.new"
        mv "$map.new" "$map"
        rm -rf "$cov"
    fi
fi

if [ "$web" = 1 ]; then
    if [ ! -d "$webui/node_modules" ]; then
        echo "verify: no node_modules in $webui; run ~/.claude/dev-kit/bin/dk-worktree-setup first." >&2
        exit 2
    fi
    cd "$webui"
    echo "== Web UI types"
    npx tsc --noEmit -p .
    echo "== Web UI tests"
    if [ "$mode" = fast ]; then
        "$heavy" "${node_job[@]}" npx vitest run --changed "$base" --maxWorkers="$workers"
    else
        "$heavy" "${node_job[@]}" npx vitest run --maxWorkers="$workers"
        # The newest cached headless shell, when the webui's Playwright wants one not downloaded.
        if [ -z "${GAIA_VISUAL_CHROMIUM:-}" ]; then
            rev=-1
            for shell in "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell; do
                r="${shell#*/chromium_headless_shell-}"
                r="${r%%/*}"
                if [ -x "$shell" ] && [[ "$r" =~ ^[0-9]+$ ]] && [ "$r" -gt "$rev" ]; then
                    rev="$r"
                    GAIA_VISUAL_CHROMIUM="$shell"
                fi
            done
            [ -z "${GAIA_VISUAL_CHROMIUM:-}" ] || export GAIA_VISUAL_CHROMIUM
        fi
        echo "== Web UI RTL screens${GAIA_VISUAL_CHROMIUM:+ (Chromium: $GAIA_VISUAL_CHROMIUM)}"
        "$heavy" "${node_job[@]}" npm run test:rtl
    fi
fi

if [ "$mob" = 1 ]; then
    if [ ! -d "$mobile/node_modules" ]; then
        echo "verify: no node_modules in $mobile; run ~/.claude/dev-kit/bin/dk-worktree-setup first." >&2
        exit 2
    fi
    cd "$mobile"
    echo "== Mobile types"
    npm run -s typecheck
    echo "== Mobile lint"
    npm run -s lint
    # Every gen:* script checks its generated files with --check (Rich, 2026-11-12).
    gens="$(node -e 'const s = require("./package.json").scripts || {}; console.log(Object.keys(s).filter((k) => k.startsWith("gen:")).join("\n"))')"
    for gen in $gens; do
        echo "== Mobile $gen --check"
        npm run -s "$gen" -- --check
    done
    echo "== Mobile tests"
    "$heavy" "${node_job[@]}" npx jest --maxWorkers="$workers"
fi

echo "verify ($mode): passed"
