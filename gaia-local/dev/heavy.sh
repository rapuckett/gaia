#!/usr/bin/env bash
#
# This repo's door to the machine-wide heavy-job gate (dev-kit's dk-heavy, the
# same slots and lock as agent-host's scripts/dev/heavy.sh). Test suites,
# builds, Playwright runs, evals and device boots go through it, so the Mac
# never runs more than one heavy job at once.
#
#   scripts/dev/heavy.sh [--foreground|--background|--light] <command...>
#   scripts/dev/heavy.sh --status [--json]
#   scripts/dev/heavy.sh --held
#
# The gate's path is AGENT_HOST_HEAVY_SH, else ~/.claude/dev-kit/bin/dk-heavy.
# A missing gate is an error, never a silent ungated run: an ungated heavy job
# is how this Mac kernel-panicked.

set -euo pipefail

gate="${AGENT_HOST_HEAVY_SH:-$HOME/.claude/dev-kit/bin/dk-heavy}"
if [ ! -x "$gate" ]; then
    echo "heavy: no gate at $gate (install dev-kit: ~/Projects/dev-kit/install.sh)" >&2
    exit 2
fi
exec "$gate" "$@"
