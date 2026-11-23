# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Unit tests never write the developer's real ``~/.gaia`` (see tests/unit/conftest.py)."""

import logging
import os
import sqlite3
from pathlib import Path

import pytest

from gaia import logger as gaia_logger
from gaia import security
from gaia.config import gaia_home
from gaia.logger import LOG_FILE_ENV

# The root conftest points HOME at a tmp dir and records the real one here.
_REAL_GAIA_HOME = Path(os.environ.get("_GAIA_TEST_REAL_HOME") or Path.home()) / ".gaia"


@pytest.fixture(scope="module")
def log_manager():
    """Install logging as the CLI does, and take it out again afterward.

    A module-level ``configure()`` left GAIA's stderr handler on the root
    logger for the whole session, printing into later tests' captures.
    """
    root = logging.getLogger()
    handlers = list(root.handlers)
    installed_here = gaia_logger.log_manager is None
    manager = gaia_logger.configure()
    yield manager
    for handler in list(root.handlers):
        if not any(handler is h for h in handlers):
            root.removeHandler(handler)
            handler.close()
    if installed_here:
        gaia_logger.log_manager = None


def _under(path: Path, root: Path) -> bool:
    path = os.path.normcase(os.path.realpath(path))
    root = os.path.normcase(os.path.realpath(root))
    return path == root or path.startswith(root + os.sep)


def test_gaia_home_is_not_the_real_one(monkeypatch):
    monkeypatch.delenv("GAIA_HOME", raising=False)
    monkeypatch.delenv("GAIA_CONFIG_DIR", raising=False)
    assert not _under(gaia_home(), _REAL_GAIA_HOME)


def test_an_edit_backup_lands_outside_the_real_home(monkeypatch, tmp_path):
    monkeypatch.delenv("GAIA_HOME", raising=False)
    monkeypatch.delenv("GAIA_CONFIG_DIR", raising=False)
    edited = tmp_path / "notes.txt"
    edited.write_text("before", encoding="utf-8")
    backup = security.backup_file(str(edited))
    assert backup is not None and Path(backup).exists()
    assert not _under(Path(backup), _REAL_GAIA_HOME)


def test_gaia_home_set_by_a_test_still_wins(monkeypatch, tmp_path):
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "mine"))
    assert gaia_home() == tmp_path / "mine"


def test_a_moved_home_still_gets_its_own_dot_gaia(monkeypatch, tmp_path):
    monkeypatch.delenv("GAIA_HOME", raising=False)
    monkeypatch.delenv("GAIA_CONFIG_DIR", raising=False)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))
    assert gaia_home() == tmp_path / ".gaia"


def test_the_log_file_is_not_the_real_one(log_manager):
    assert os.environ.get(LOG_FILE_ENV)
    assert not _under(log_manager.log_file, _REAL_GAIA_HOME)


def _unresolvable(path, *_a, **_k):
    raise OSError(1920, "The file cannot be accessed by the system", path)


def test_a_broken_realpath_does_not_break_the_database_guard(monkeypatch, tmp_path):
    # Coverage opens its data file through the same guard; a raise here left the
    # test's patch in place for every later test on the worker.
    monkeypatch.setattr(os.path, "realpath", _unresolvable)
    sqlite3.connect(str(tmp_path / "scratch.db")).close()


def test_a_broken_realpath_still_keeps_tests_out_of_the_real_home(monkeypatch):
    monkeypatch.setattr(os.path, "realpath", _unresolvable)
    with pytest.raises(pytest.fail.Exception, match="real home"):
        sqlite3.connect(str(_REAL_GAIA_HOME / "never-created.db"))
    assert not (_REAL_GAIA_HOME / "never-created.db").exists()


@pytest.mark.skipif(os.name == "nt", reason="the account home comes from pwd")
def test_a_hand_set_home_does_not_move_the_guarded_gaia_home(tmp_path):
    """A caller's HOME=<tmp> must not become the folder the guard protects."""
    import pwd
    import subprocess
    import sys

    account_gaia = Path(pwd.getpwuid(os.getuid()).pw_dir) / ".gaia"
    root = Path(__file__).resolve().parents[2]
    script = (
        "import importlib.util, sys\n"
        "from pathlib import Path\n"
        "spec = importlib.util.spec_from_file_location('root_conftest', sys.argv[1])\n"
        "mod = importlib.util.module_from_spec(spec)\n"
        "spec.loader.exec_module(mod)\n"
        "print(mod._REAL_GAIA_HOME)\n"
        "print(mod._is_real_gaia_home(Path(sys.argv[2]) / 'probe'))\n"
        "print(mod._is_real_gaia_home(Path(sys.argv[3]) / '.gaia' / 'probe'))\n"
    )
    hand_set_home = tmp_path / "home"
    hand_set_home.mkdir()
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in ("_GAIA_TEST_REAL_HOME", "GAIA_HOME", "HOME")
    }
    env["HOME"] = str(hand_set_home)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            script,
            str(root / "conftest.py"),
            str(account_gaia),
            str(hand_set_home),
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    guarded, account_is_guarded, tmp_is_guarded = result.stdout.split("\n")[:3]
    assert Path(guarded) == account_gaia
    assert account_is_guarded == "True"
    assert tmp_is_guarded == "False"
