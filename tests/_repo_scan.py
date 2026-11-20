# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""One cached walk of the repo for the scan-the-source ratchet tests.

Each ratchet used to ``rglob`` its own roots, descending into every
``node_modules`` and build directory before filtering them out. The tree is
walked once per process here, and a file's text is read once, so the ratchets
share the cost. A query returns exactly what ``root.rglob("*<suffix>")``
would: regular files at any depth, symlinked directories not followed.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Iterable, List

REPO_ROOT = Path(__file__).resolve().parents[1]
# Every top-level directory a ratchet scans; anything else is never walked.
_TREE_ROOTS = ("src", "util", "tests", "hub", "docs", "tui")


@lru_cache(maxsize=None)
def _tree() -> tuple:
    files = []

    def walk(directory: str) -> None:
        try:
            entries = list(os.scandir(directory))
        except OSError:
            return
        for entry in entries:
            if entry.is_dir(follow_symlinks=False):
                walk(entry.path)
            elif entry.is_file():
                files.append(entry.path)

    for top in _TREE_ROOTS:
        walk(str(REPO_ROOT / top))
    return tuple(sorted(files))


@lru_cache(maxsize=None)
def _query(root: str, suffix: str, skip_dirs: frozenset) -> tuple:
    prefix = root + os.sep
    repo_prefix = str(REPO_ROOT) + os.sep
    found = []
    for path in _tree():
        if not (path.startswith(prefix) and path.endswith(suffix)):
            continue
        if skip_dirs and not skip_dirs.isdisjoint(
            path[len(repo_prefix) :].split(os.sep)
        ):
            continue
        found.append(Path(path))
    return tuple(found)


def files_under(
    root: Path, suffix: str = "", skip_dirs: Iterable[str] = ()
) -> List[Path]:
    """Sorted regular files under ``root`` whose name ends with ``suffix``.

    A file is dropped when any component of its repo-relative path, its own
    name included, is in ``skip_dirs``.
    """
    return list(_query(str(root), suffix, frozenset(skip_dirs)))


@lru_cache(maxsize=None)
def read_text(path: Path) -> str:
    """UTF-8 text of ``path``, read once per process."""
    return Path(path).read_text(encoding="utf-8")
