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


# -- stopping: a live daemon's Lemonade Server is never stopped by anyone else --

_SERVER_PID = 4242


@pytest.fixture
def owner_process():
    """A live process recorded as the server's owner daemon."""
    proc = subprocess.Popen(
        [sys.executable, "-c", "import sys; sys.stdin.readline()"],
        stdin=subprocess.PIPE,
    )
    try:
        yield proc
    finally:
        proc.stdin.close()
        proc.wait(timeout=30)


@pytest.fixture
def running_server(homes, monkeypatch):
    """GAIA's server recorded as running in *homes*; returns (record, kills)."""
    from gaia.llm import lemonade_embedded as embedded_mod
    from gaia.llm.lemonade_embedded import (
        OTHER,
        OWN,
        EmbeddedLemonade,
        EmbeddedStatus,
    )

    monkeypatch.delenv("LEMONADE_BASE_URL", raising=False)
    monkeypatch.setattr(
        "gaia.llm.lemonade_client.configured_lemonade_url", lambda: None
    )
    kills = []

    def record(owner_pid=None, owner_started=None):
        state = {"pid": _SERVER_PID, "port": 1, "api_key": "k"}
        state.update(owner_pid=owner_pid, owner_started=owner_started)
        EmbeddedLemonade()._write_state(state)

        def status(self):
            return EmbeddedStatus(
                installed=True,
                running=True,
                version=self.version,
                port=1,
                pid=_SERVER_PID,
                owner_pid=owner_pid,
                owner_started=owner_started,
            )

        monkeypatch.setattr(EmbeddedLemonade, "status", status)

    monkeypatch.setattr(
        EmbeddedLemonade, "_identify", lambda *a: OTHER if kills else OWN
    )
    monkeypatch.setattr(EmbeddedLemonade, "_health", lambda *a, **k: None)
    monkeypatch.setattr(
        embedded_mod.EmbeddedLemonade,
        "_kill_tree",
        staticmethod(lambda pid: kills.append(pid)),
    )
    return record, kills


def _stop_embedded():
    from gaia.llm.lemonade_embedded import EmbeddedLemonade

    EmbeddedLemonade().stop()


def _stop_left_running():
    from gaia import cli

    cli._stop_gaia_lemonade_left_running()


def _embedded_stop_command():
    from types import SimpleNamespace

    from gaia import cli

    cli.handle_lemonade_embedded_command(SimpleNamespace(embedded_action="stop"))


def _kill_lemonade():
    from gaia import cli

    if cli.kill_lemonade() != 0:
        raise SystemExit(1)


_STOP_PATHS = [
    _stop_embedded,
    _stop_left_running,
    _embedded_stop_command,
    _kill_lemonade,
]


@pytest.mark.parametrize("stop", _STOP_PATHS, ids=lambda f: f.__name__)
def test_no_stop_path_stops_a_server_whose_owner_daemon_runs(
    running_server, owner_process, stop, capsys
):
    import psutil

    from gaia.llm.lemonade_embedded import EmbeddedLemonadeError

    record, kills = running_server
    record(owner_process.pid, psutil.Process(owner_process.pid).create_time())

    with pytest.raises((EmbeddedLemonadeError, SystemExit)) as err:
        stop()
    assert kills == []
    said = str(err.value) + capsys.readouterr().out
    assert f"daemon pid {owner_process.pid}" in said
    assert "GAIA_HOME" in said and "GAIA_DAEMON_HOME" in said


@pytest.mark.parametrize("stop", _STOP_PATHS, ids=lambda f: f.__name__)
def test_no_stop_path_stops_a_server_while_another_daemon_holds_its_home(
    running_server, other_daemon, stop, capsys
):
    """Unclaimed yet, but that daemon is about to serve with it."""
    from gaia.llm.lemonade_embedded import EmbeddedLemonadeError

    record, kills = running_server
    record()

    with pytest.raises((EmbeddedLemonadeError, SystemExit)) as err:
        stop()
    assert kills == []
    assert "daemon.lock" in str(err.value) + capsys.readouterr().out


def test_the_owner_daemon_still_stops_its_own_server(running_server):
    record, kills = running_server
    record(os.getpid(), None)
    lock = singleton.hold_daemon_home()
    try:
        _stop_embedded()
    finally:
        lock.release()
    assert kills == [_SERVER_PID]


def test_a_server_whose_owner_exited_is_stopped(running_server):
    record, kills = running_server
    gone = subprocess.Popen([sys.executable, "-c", "pass"])
    gone.wait(timeout=30)
    record(gone.pid, 1.0)
    _stop_embedded()
    assert kills == [_SERVER_PID]


def test_daemon_stop_with_only_gaia_daemon_home_set_touches_nothing(
    monkeypatch, tmp_path, capsys
):
    """A test's cleanup once stopped the user's Lemonade this way."""
    from gaia import cli
    from gaia.llm.lemonade_embedded import EmbeddedLemonade

    touched = []
    monkeypatch.delenv("GAIA_HOME", raising=False)
    monkeypatch.setenv("GAIA_DAEMON_HOME", str(tmp_path / "test-host"))
    monkeypatch.setattr(
        "gaia.daemon.instance.read_instance", lambda *a: touched.append("read")
    )
    monkeypatch.setattr(
        EmbeddedLemonade, "stop", lambda *a, **k: touched.append("stop")
    )

    with pytest.raises(SystemExit) as err:
        cli._handle_daemon_stop()
    assert err.value.code == 1
    assert touched == []
    out = capsys.readouterr().out
    assert "GAIA_DAEMON_HOME" in out and "GAIA_HOME is unset" in out
