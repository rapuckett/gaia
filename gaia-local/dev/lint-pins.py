#!/usr/bin/env python3
"""The tool versions GAIA's util/lint.py pins (TOOL_VERSIONS), read without running it.

    lint-pins.py [--except T,..] <util/lint.py>           the pins as pip requirements on one line
    lint-pins.py --get TOOL <util/lint.py>                 one tool's pinned version, or nothing
    lint-pins.py --check [--only T,..|--except T,..] <util/lint.py>
                                                           exit 1, saying what to install, when this
                                                           Python has a pinned tool at another version

lint.py runs the pinned versions through uvx. Without uv it runs whatever copy the
venv has, and a newer one (isort 9) fails on files nobody touched. Run it with the
Python whose packages you mean: the main venv's, or lint-tools' for the tools that
live apart from GAIA's packages (pylint).
"""

import argparse
import ast
import sys
from importlib import metadata


def pins(path):
    with open(path, encoding="utf-8") as source:
        tree = ast.parse(source.read(), path)
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [getattr(node, "target", None)]
        if any(isinstance(t, ast.Name) and t.id == "TOOL_VERSIONS" for t in targets) and node.value:
            value = ast.literal_eval(node.value)
            if isinstance(value, dict) and value and all(isinstance(v, str) for v in value.values()):
                return value
    sys.exit(f"lint-pins: no TOOL_VERSIONS dict of versions in {path}; its format changed, so update {__file__}")


def tools(text):
    return {t.strip() for t in text.split(",") if t.strip()}


def main(argv):
    parser = argparse.ArgumentParser(prog="lint-pins.py")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--get", metavar="TOOL")
    which = parser.add_mutually_exclusive_group()
    which.add_argument("--only", type=tools, metavar="T,..")
    which.add_argument("--except", dest="skip", type=tools, metavar="T,..")
    parser.add_argument("lint_py")
    args = parser.parse_args(argv)

    wanted = pins(args.lint_py)
    if args.get:
        print(wanted.get(args.get, ""))
        return 0
    if args.only is not None:
        wanted = {t: v for t, v in wanted.items() if t in args.only}
    if args.skip:
        wanted = {t: v for t, v in wanted.items() if t not in args.skip}
    if not args.check:
        print(" ".join(f"{tool}=={version}" for tool, version in sorted(wanted.items())))
        return 0
    wrong = []
    for tool, version in sorted(wanted.items()):
        try:
            have = metadata.version(tool)
        except metadata.PackageNotFoundError:
            have = "none"
        if have != version:
            wrong.append((tool, have, version))
    if wrong:
        has = ", ".join(f"{tool} {have}" for tool, have, _ in wrong)
        fix = " ".join(f"{tool}=={version}" for tool, _, version in wrong)
        print(
            f"{args.lint_py} pins {fix}, but {sys.prefix} has {has}; without uv, lint.py runs "
            f"that copy. Fix: {sys.prefix}/bin/pip install {fix}"
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
