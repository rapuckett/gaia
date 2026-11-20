# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""One daemon per GAIA home, decided before it touches anything.

A second daemon once started for the same home (its own GAIA_DAEMON_HOME, the
user's real GAIA_HOME), took over the first one's Lemonade Server, and stopped
it two seconds later on its way out.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from gaia.daemon import client as daemon_client
from gaia.daemon import singleton
from gaia.daemon.errors import DaemonBusyError, DaemonStartError

_SRC = Path(__file__).resolve().parents[2] / "src"
_HOLD_LOCK = textwrap.dedent("""
    import sys
    from gaia.daemon import singleton
    lock = singleton.hold_daemon_home()
    print("held", flush=True)
    sys.stdin.readline()
    """)


@pytest.fixture
def homes(monkeypatch, tmp_path):
    gaia_home = tmp_path / "gaia-home"
    gaia_home.mkdir()
    monkeypatch.setenv("GAIA_HOME", str(gaia_home))
    monkeypatch.setenv("GAIA_DAEMON_HOME", str(gaia_home / "host"))
    return gaia_home


@pytest.fixture
def other_daemon(homes):
    """Another process holding this GAIA home's daemon lock."""
    proc = subprocess.Popen(
        [sys.executable, "-c", _HOLD_LOCK],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        env={**os.environ, "PYTHONPATH": str(_SRC)},
    )
    try:
        assert proc.stdout.readline().strip() == "held"
        yield proc
    finally:
        proc.stdin.close()
        proc.wait(timeout=30)


def test_a_second_daemon_for_the_same_home_refuses_to_start(other_daemon):
    with pytest.raises(DaemonStartError) as err:
        singleton.hold_daemon_home(wait=0.2)
    assert "already running" in str(err.value)


def test_the_lock_frees_when_its_holder_exits(homes):
    first = singleton.hold_daemon_home()
    first.release()
    singleton.hold_daemon_home().release()


def test_a_daemon_home_apart_from_a_running_daemons_home_is_refused(
    homes, monkeypatch, tmp_path
):
    """GAIA_DAEMON_HOME alone moves instance.json, not Lemonade or the log."""
    host = homes / "host"
    host.mkdir()
    (host / "instance.json").write_text(
        json.dumps({"pid": os.getppid(), "port": 1, "token": "t"}), encoding="utf-8"
    )
    monkeypatch.setenv("GAIA_DAEMON_HOME", str(tmp_path / "elsewhere"))
    monkeypatch.setattr(singleton, "_is_gaia_daemon", lambda pid: True)

    with pytest.raises(DaemonStartError) as err:
        singleton.hold_daemon_home(wait=0.2)
    assert "GAIA_DAEMON_HOME" in str(err.value) and "GAIA_HOME" in str(err.value)


def test_client_never_spawns_while_another_daemon_holds_the_home(
    other_daemon, monkeypatch
):
    """No instance.json, or one that reads as gone, is not "no daemon"."""
    spawned = []
    monkeypatch.setattr(daemon_client, "read_instance", lambda *a, **k: None)
    monkeypatch.setattr(daemon_client, "missing_daemon_deps", lambda: [])
    monkeypatch.setattr(
        daemon_client, "_spawn_and_wait", lambda *a, **k: spawned.append(a)
    )

    with pytest.raises(DaemonBusyError) as err:
        daemon_client.start_or_attach(timeout=5)
    assert spawned == []
    assert "gaia daemon restart" in str(err.value)
