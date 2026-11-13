#!/usr/bin/env bash
#
# Start/stop the isolated dev backend (python -m gaia.testing.dev_backend) for
# the mobile app's e2e tests. Run from a worktree; its src/ is what runs.
#
#   dev-backend.sh start [--home DIR] [--script FILE] [--port P] [--llm-port P2]
#   dev-backend.sh stop <pid>
#   dev-backend.sh status
#
# Ports are always inside 4210-4229. Stops only the PID it is given (and its
# children), and only if that PID is a dev_backend process.

set -euo pipefail

MAIN=/Users/rapuckett/Projects/gaia
PY="$MAIN/.venv/bin/python"
LO=4210
HI=4229

die() { echo "dev-backend: $*" >&2; exit 1; }

in_range() { [ "$1" -ge "$LO" ] && [ "$1" -le "$HI" ]; }

port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

is_dev_backend() {
    ps -o command= -p "$1" 2>/dev/null | grep -qF "gaia.testing.dev_backend"
}

cmd_start() {
    local home="" script="" port="" llm_port=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --home) home="${2:?--home needs a directory}"; shift 2 ;;
            --script) script="${2:?--script needs a file}"; shift 2 ;;
            --port) port="${2:?--port needs a number}"; shift 2 ;;
            --llm-port) llm_port="${2:?--llm-port needs a number}"; shift 2 ;;
            *) die "unknown option: $1" ;;
        esac
    done
    [ -x "$PY" ] || die "no Python at $PY"
    local root
    root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "run from a gaia worktree"
    [ -f "$root/src/gaia/testing/dev_backend.py" ] || die "$root has no gaia.testing.dev_backend"

    local free=() p
    if [ -z "$port" ] || [ -z "$llm_port" ]; then
        for p in $(seq "$LO" "$HI"); do
            port_free "$p" && free+=("$p")
            [ "${#free[@]}" -ge 2 ] && break
        done
        [ "${#free[@]}" -ge 2 ] || die "fewer than two free ports in $LO-$HI"
        port="${port:-${free[0]}}"
        llm_port="${llm_port:-${free[1]}}"
        [ "$port" != "$llm_port" ] || { llm_port="${free[1]}"; }
    fi
    for p in "$port" "$llm_port"; do
        [[ "$p" =~ ^[0-9]+$ ]] || die "port $p is not a number"
        in_range "$p" || die "port $p is outside $LO-$HI"
        port_free "$p" || die "port $p is already in use"
    done

    if [ -z "$home" ]; then
        home="$(mktemp -d "${TMPDIR:-/tmp}/gaia-dev-backend.XXXXXX")"
    else
        mkdir -p "$home"
    fi
    home="$(cd "$home" && pwd -P)"

    local args=(--port "$port" --llm-port "$llm_port" --home "$home")
    [ -n "$script" ] && args+=(--script "$script")
    local log="$home/dev-backend.log"
    : > "$log"
    # A scrubbed environment: nothing of the caller's GAIA/Lemonade settings leaks in.
    env -i HOME="$HOME" PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" PYTHONPATH="$root/src" \
        nohup "$PY" -m gaia.testing.dev_backend "${args[@]}" >"$log" 2>&1 &
    local pid=$!
    echo "$pid" > "$home/dev-backend.pid"

    local i
    for i in $(seq 1 180); do
        if grep -q '^READY ' "$log"; then
            grep '^READY ' "$log"
            echo "pid=$pid"
            echo "home=$home"
            return 0
        fi
        kill -0 "$pid" 2>/dev/null || { cat "$log" >&2; die "backend exited before it was ready"; }
        sleep 0.5
    done
    kill "$pid" 2>/dev/null || true
    die "backend not ready after 90s; see $log"
}

cmd_stop() {
    local pid="${1:?usage: stop <pid>}"
    [[ "$pid" =~ ^[0-9]+$ ]] || die "pid must be a number"
    is_dev_backend "$pid" || die "pid $pid is not a gaia.testing.dev_backend process; not touching it"
    local kids
    kids="$(pgrep -P "$pid" || true)"
    kill -TERM "$pid"
    local i
    for i in $(seq 1 30); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid"
    fi
    local k
    for k in $kids; do
        kill -0 "$k" 2>/dev/null && kill -TERM "$k"
    done
    echo "stopped $pid"
}

cmd_status() {
    local pid found=0
    for pid in $(pgrep -f "gaia.testing.dev_backend" || true); do
        is_dev_backend "$pid" || continue
        found=1
        echo "pid=$pid $(lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $9}' | tr '\n' ' ')"
    done
    [ "$found" = 1 ] || echo "no dev backend running"
}

case "${1:-}" in
    start) shift; cmd_start "$@" ;;
    stop) shift; cmd_stop "$@" ;;
    status) cmd_status ;;
    *) die "usage: start|stop <pid>|status" ;;
esac
