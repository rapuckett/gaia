# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""A file whose own events were lost is still reported, from its folder's.

Under load FSEvents coalesces or drops per-file events and reports only that a
folder changed (or must be rescanned). The handler filtered by extension and
ignored folder events, so a document or skill copied in on a busy Mac was
never seen. A folder event now rescans that folder against what the watcher
already knows.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from gaia.utils import file_watcher
from gaia.utils.file_watcher import FileChangeHandler

WINDOW = 0.1


def _file_event(path: Path) -> SimpleNamespace:
    return SimpleNamespace(src_path=str(path), is_directory=False)


def _dir_event(path: Path) -> SimpleNamespace:
    return SimpleNamespace(src_path=str(path), is_directory=True)


@pytest.fixture
def watched(tmp_path):
    (tmp_path / "old.txt").write_text("old")
    (tmp_path / "skip.bin").write_text("not watched")
    seen = []
    handler = FileChangeHandler(
        on_created=lambda p: seen.append(("created", Path(p).name)),
        on_modified=lambda p: seen.append(("modified", Path(p).name)),
        extensions=[".txt"],
        debounce_seconds=WINDOW,
    )
    handler.watch_root(tmp_path, recursive=False)
    yield tmp_path, handler, seen
    handler.close()


def test_a_new_file_seen_only_through_its_folder_is_reported_once(watched):
    root, handler, seen = watched
    (root / "new.txt").write_text("new")
    (root / "new.bin").write_text("filtered out")
    handler.on_modified(_dir_event(root))
    assert handler.wait_idle(10)
    # Its own event arriving late, and another folder event, report nothing more.
    handler.on_created(_file_event(root / "new.txt"))
    handler.on_modified(_dir_event(root))
    assert handler.wait_idle(10)
    assert seen == [("created", "new.txt")]


def test_a_file_changed_without_its_own_event_is_reported_as_modified(watched):
    root, handler, seen = watched
    (root / "old.txt").write_text("old, then rewritten")
    handler.on_modified(_dir_event(root))
    assert handler.wait_idle(10)
    assert seen == [("modified", "old.txt")]


def test_a_rescan_of_an_unchanged_folder_reports_nothing(watched):
    root, handler, seen = watched
    handler.on_modified(_dir_event(root))
    assert handler.wait_idle(10)
    assert seen == []


def test_a_new_subfolder_seen_only_through_its_parent_is_looked_into(tmp_path):
    """A skill folder copied in, with its own and its files' events all lost."""
    (tmp_path / "existing").mkdir()
    (tmp_path / "existing" / "SKILL.md").write_text("old")
    seen = []
    handler = FileChangeHandler(
        on_created=seen.append, extensions=[".md"], debounce_seconds=WINDOW
    )
    handler.watch_root(tmp_path, recursive=True)
    try:
        nested = tmp_path / "new-skill" / "docs"
        nested.mkdir(parents=True)
        (nested / "guide.md").write_text("new")
        handler.on_modified(_dir_event(tmp_path))
        assert handler.wait_idle(10)
        assert [Path(p).name for p in seen] == ["guide.md"]
    finally:
        handler.close()


@pytest.mark.skipif(sys.platform != "darwin", reason="FSEvents is macOS only")
def test_an_fsevents_must_rescan_flag_becomes_a_folder_event(tmp_path):
    """watchdog drops kFSEventStreamEventFlagMustScanSubDirs; GAIA's emitter
    turns it into a folder event the handler rescans."""
    import _watchdog_fsevents as _fsevents
    from watchdog.observers.api import EventQueue, ObservedWatch

    must_scan_subdirs = 0x1
    queue = EventQueue()
    emitter = file_watcher._RescanningFSEventsEmitter(
        queue, ObservedWatch(str(tmp_path), recursive=True)
    )
    native = _fsevents.NativeEvent(os.path.realpath(tmp_path), 0, must_scan_subdirs, 1)
    emitter.queue_events(0, [native])
    event, _watch = queue.get_nowait()
    assert event.is_directory
    assert event.src_path == os.path.realpath(tmp_path)
    assert getattr(event, "rescan_subdirs", False)
