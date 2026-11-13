#!/usr/bin/env bash
#
# Builds the Python environment the team's checks share: <main checkout>/.venv.
# Every worktree's tests use it (the root conftest.py pins src/ to the checkout
# under test), and so does verify.sh.
#
#   <main checkout>/.local/dev/setup-venv.sh            make it, or bring it up to date
#   <main checkout>/.local/dev/setup-venv.sh --rebuild  make it again from nothing
#   <main checkout>/.local/dev/setup-venv.sh --python   print the Python version it must run
#
# The version is the one GAIA's pyproject.toml type-checks for ([tool.mypy]
# python_version), which upstream CI and the shipped app also run; on 3.14 pylint
# fails on code nobody touched. The interpreter is Homebrew's python<version>,
# else pyenv's; GAIA_VENV_PYTHON names another. Then GAIA with its dev and ui
# extras, then the tool versions util/lint.py pins (TOOL_VERSIONS): without uv,
# lint.py runs the venv's own copies. pylint gets a venv of its own inside this one
# (lint-tools), linked as bin/pylint. The installs go through the heavy-job gate.

set -euo pipefail
for v in $(env | sed -n 's/^\(GIT_[A-Za-z_]*\)=.*/\1/p'); do unset "$v"; done

die() { echo "setup-venv: $*" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
main="$(dirname "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")"
venv="$main/.venv"

want="$(sed -n '/^\[tool\.mypy\]/,/^\[/s/^python_version *= *"\([0-9]*\.[0-9]*\)".*/\1/p' "$main/pyproject.toml")"
[[ "$want" =~ ^3\.[0-9]+$ ]] || die "no [tool.mypy] python_version in $main/pyproject.toml; its format changed, so update $0"

rebuild=0
case "${1:-}" in
    --python) echo "$want"; exit 0 ;;
    --rebuild) rebuild=1 ;;
    "") ;;
    *) echo "usage: setup-venv.sh [--rebuild | --python]" >&2; exit 2 ;;
esac

minor_of() { "$1" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || true; }

if [ "$rebuild" = 0 ] && [ -x "$venv/bin/python" ]; then
    have="$(minor_of "$venv/bin/python")"
    [ "$have" = "$want" ] || die "$venv runs Python $have, not $want. Make it again: $0 --rebuild"
else
    python="${GAIA_VENV_PYTHON:-}"
    if [ -z "$python" ]; then
        for candidate in "/opt/homebrew/bin/python$want" "$HOME"/.pyenv/versions/"$want".*/bin/python"$want"; do
            if [ -x "$candidate" ] && [ "$(minor_of "$candidate")" = "$want" ]; then
                python="$candidate"
                break
            fi
        done
    fi
    [ -n "$python" ] || die "no Python $want found (Homebrew's python@$want, or a pyenv $want.x). Install one, or set GAIA_VENV_PYTHON."
    [ "$(minor_of "$python")" = "$want" ] || die "$python is not Python $want"
    echo "setup-venv: making $venv with $python ($("$python" --version 2>&1))"
    "$python" -m venv --clear "$venv"
fi

cd "$main"
"$here/heavy.sh" "$venv/bin/python" -m pip install -q -e ".[dev,ui]"
read -r -a pins <<<"$("$venv/bin/python" -I "$here/lint-pins.py" --except pylint "$main/util/lint.py")"
"$here/heavy.sh" "$venv/bin/python" -m pip install -q "${pins[@]}"
"$venv/bin/python" -I "$here/lint-pins.py" --check --except pylint "$main/util/lint.py" || die "the lint tools still differ from util/lint.py's pins"

# pylint lives apart from GAIA's packages, as upstream's uvx runs it: next to faiss-cpu
# and Pillow it reports errors in code nobody touched. util/lint.py's pin if it ever
# sets one, else the newest pylint.
tools="$venv/lint-tools"
if [ ! -x "$tools/bin/python" ] || [ "$(minor_of "$tools/bin/python")" != "$want" ]; then
    "$venv/bin/python" -m venv --clear "$tools"
fi
pin="$("$venv/bin/python" -I "$here/lint-pins.py" --get pylint "$main/util/lint.py")"
"$here/heavy.sh" "$tools/bin/python" -m pip install -q --upgrade "pylint${pin:+==$pin}"
# pip replaces bin/pylint when it installs the dev extra's copy; point it back.
ln -sfn ../lint-tools/bin/pylint "$venv/bin/pylint"
"$tools/bin/python" -I "$here/lint-pins.py" --check --only pylint "$main/util/lint.py" || die "pylint in $tools differs from util/lint.py's pin"
echo "setup-venv: $venv is ready: Python $("$venv/bin/python" --version 2>&1 | cut -d' ' -f2), ${pins[*]}, pylint $("$tools/bin/python" -I -c 'from importlib import metadata; print(metadata.version("pylint"))') apart in $tools"
