# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""The agent the desktop app starts can run the ``gaia`` the app ships (#7968).

The Windows app ships ``gaia.exe`` in ``resources/core`` and puts nothing on the
user's PATH, so the automations skill refused to load in every chat.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from gaia import env as gaia_env
from gaia.skills.binaries import resolve_binary_policies
from gaia.skills.errors import SkillPermissionError
from gaia.skills.format import parse_skill_file

AUTOMATIONS = (
    Path(__file__).resolve().parents[2] / "hub" / "skills" / "automations" / "SKILL.md"
)
GAIA_NAME = "gaia.exe" if sys.platform == "win32" else "gaia"


def _app(tmp_path: Path) -> Path:
    """A packaged app's layout: ``resources/core/gaia(.exe)`` beside ``_internal``."""
    core = tmp_path / "GAIA" / "resources" / "core"
    (core / "_internal").mkdir(parents=True)
    exe = core / GAIA_NAME
    exe.write_bytes(b"")
    exe.chmod(0o755)
    return exe


@pytest.fixture
def frozen_app(tmp_path, monkeypatch):
    exe = _app(tmp_path)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(exe))
    return exe


def _user_path(tmp_path: Path) -> str:
    """A PATH with no ``gaia`` on it, as on a PC with only the desktop app."""
    bin_dir = tmp_path / "user-bin"
    bin_dir.mkdir(exist_ok=True)
    return str(bin_dir)


def test_appends_the_shipped_core(frozen_app, tmp_path):
    env = {"PATH": _user_path(tmp_path)}
    gaia_env.expose_shipped_gaia(env)
    assert env["PATH"].split(os.pathsep) == [
        _user_path(tmp_path),
        str(frozen_app.parent),
    ]
    found = shutil.which("gaia", path=env["PATH"])
    assert found and Path(found).resolve() == frozen_app.resolve()


def test_defaults_to_this_process_environment(frozen_app, tmp_path, monkeypatch):
    monkeypatch.setenv("PATH", _user_path(tmp_path))
    gaia_env.expose_shipped_gaia()
    assert os.environ["PATH"].split(os.pathsep)[-1] == str(frozen_app.parent)


def test_keeps_windows_spelling_of_path(frozen_app, tmp_path):
    env = {"Path": _user_path(tmp_path)}
    gaia_env.expose_shipped_gaia(env)
    assert list(env) == ["Path"]
    assert env["Path"].split(os.pathsep)[-1] == str(frozen_app.parent)


def test_untouched_when_gaia_already_resolves(frozen_app, tmp_path):
    other = tmp_path / "other-bin"
    other.mkdir()
    (other / GAIA_NAME).write_bytes(b"")
    (other / GAIA_NAME).chmod(0o755)
    env = {"PATH": os.pathsep.join([_user_path(tmp_path), str(other)])}
    before = dict(env)
    gaia_env.expose_shipped_gaia(env)
    gaia_env.expose_shipped_gaia(env)
    assert env == before


def test_quiet_when_its_own_gaia_is_already_first(frozen_app, caplog):
    env = {"PATH": str(frozen_app.parent)}
    with caplog.at_level("WARNING", logger="gaia.env"):
        gaia_env.expose_shipped_gaia(env)
    assert env == {"PATH": str(frozen_app.parent)}
    assert not [r for r in caplog.records if r.levelname == "WARNING"]


def test_warns_when_another_installs_gaia_is_first(frozen_app, tmp_path, caplog):
    other = tmp_path / "old-pip" / "Scripts"
    other.mkdir(parents=True)
    (other / GAIA_NAME).write_bytes(b"")
    (other / GAIA_NAME).chmod(0o755)
    env = {"PATH": str(other)}
    with caplog.at_level("WARNING", logger="gaia.env"):
        gaia_env.expose_shipped_gaia(env)
    assert env == {"PATH": str(other)}
    warning = next(r.getMessage() for r in caplog.records if r.levelname == "WARNING")
    assert str(other / GAIA_NAME) in warning
    assert str(frozen_app) in warning
    assert "versions differ" in warning


def test_an_empty_path_gets_only_the_core(frozen_app):
    env: dict = {}
    gaia_env.expose_shipped_gaia(env)
    assert env == {"PATH": str(frozen_app.parent)}


def test_windows_looks_for_gaia_exe(tmp_path, monkeypatch):
    core = tmp_path / "core"
    core.mkdir()
    (core / "gaia").write_bytes(b"")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(core / "gaia-agent.exe"))
    monkeypatch.setattr(sys, "platform", "win32")
    assert gaia_env._own_gaia_folder() is None
    (core / "gaia.exe").write_bytes(b"")
    assert gaia_env._own_gaia_folder() == core


def _venv(tmp_path: Path, monkeypatch, recorded: bool) -> Path:
    """A venv whose ``bin`` holds python and a ``gaia`` script."""
    import importlib.metadata

    bin_dir = tmp_path / "venv" / "bin"
    bin_dir.mkdir(parents=True)
    for name in ("python", GAIA_NAME):
        (bin_dir / name).write_bytes(b"")
        (bin_dir / name).chmod(0o755)
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.setattr(sys, "executable", str(bin_dir / "python"))

    class Dist:
        files = [importlib.metadata.PackagePath(f"../../../bin/{GAIA_NAME}")]

        @staticmethod
        def locate_file(path):
            site = tmp_path / "venv" / "lib" / "python3" / "site-packages"
            return site / path if recorded else tmp_path / "elsewhere" / path

    monkeypatch.setattr(importlib.metadata, "distribution", lambda name: Dist())
    return bin_dir


def test_appends_the_venv_bin_that_holds_gaias_own_script(tmp_path, monkeypatch):
    bin_dir = _venv(tmp_path, monkeypatch, recorded=True)
    env = {"PATH": "/usr/bin:/bin"}
    gaia_env.expose_shipped_gaia(env)
    assert env["PATH"].split(os.pathsep) == ["/usr/bin", "/bin", str(bin_dir)]
    assert shutil.which("python3", path=env["PATH"]) != str(bin_dir / "python")


def test_ignores_a_gaia_that_amd_gaia_did_not_install(tmp_path, monkeypatch):
    _venv(tmp_path, monkeypatch, recorded=False)
    env = {"PATH": "/usr/bin:/bin"}
    gaia_env.expose_shipped_gaia(env)
    assert env == {"PATH": "/usr/bin:/bin"}


def test_untouched_when_not_frozen(tmp_path, monkeypatch):
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.setattr(sys, "executable", str(_app(tmp_path)))
    env = {"PATH": _user_path(tmp_path)}
    gaia_env.expose_shipped_gaia(env)
    assert env == {"PATH": _user_path(tmp_path)}


def test_untouched_when_no_gaia_sits_beside_the_executable(tmp_path, monkeypatch):
    other = tmp_path / "agent" / "gaia-agent.exe"
    other.parent.mkdir()
    other.write_bytes(b"")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(other))
    env = {"PATH": _user_path(tmp_path)}
    gaia_env.expose_shipped_gaia(env)
    assert env == {"PATH": _user_path(tmp_path)}


def test_the_spawned_agent_gets_the_core_on_path(frozen_app, tmp_path, monkeypatch):
    """The daemon (frozen ``gaia``) starts the chat agent with core on PATH."""
    from gaia.daemon.sidecars import manager as mgr
    from gaia.daemon.sidecars.errors import SidecarSpawnError
    from gaia.daemon.sidecars.spec import builtin_specs

    calls = []

    def fake_popen(*_args, **kwargs):
        calls.append(kwargs)
        raise OSError("spawn captured")

    monkeypatch.setattr(subprocess, "Popen", fake_popen)
    monkeypatch.setenv("PATH", _user_path(tmp_path))
    # Dev mode delivers the secret by file, so no installed binary is needed.
    monkeypatch.setenv("GAIA_GAIA_AGENT_MODE", "dev")
    m = mgr.AgentSidecarManager(
        builtin_specs()["gaia"], cache_dir=tmp_path, log_dir=tmp_path / "logs"
    )
    with pytest.raises(SidecarSpawnError):
        m._spawn_process(["sidecar"], {}, 9127)

    path = next(v for k, v in calls[0]["env"].items() if k.upper() == "PATH")
    assert path.split(os.pathsep)[-1] == str(frozen_app.parent)
    found = shutil.which("gaia", path=path)
    assert found and Path(found).resolve() == frozen_app.resolve()


def _automations_permissions():
    return parse_skill_file(AUTOMATIONS).parsed_permissions()


@pytest.mark.usefixtures("frozen_app")
def test_automations_loads_with_the_shipped_core(tmp_path, monkeypatch):
    agent_env = gaia_env.expose_shipped_gaia({"PATH": _user_path(tmp_path)})
    monkeypatch.setenv("PATH", agent_env["PATH"])
    policies = resolve_binary_policies(
        _automations_permissions(), skill_name="automations"
    )
    assert [p.binary for p in policies] == ["gaia"]


def test_automations_refuses_honestly_without_gaia(tmp_path, monkeypatch):
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.setenv("PATH", _user_path(tmp_path))
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SkillPermissionError) as excinfo:
        resolve_binary_policies(_automations_permissions(), skill_name="automations")
    message = str(excinfo.value)
    assert "needs the 'gaia' command" in message
    assert "could not find 'gaia' in any folder on the PATH" in message
    assert "Do not suggest a reinstall" in message
    assert "Reinstall GAIA" not in message
    assert "cannot do what they asked" in message
    assert "saving a memory" in message


def test_backend_and_daemon_startup_expose_gaia_after_the_login_path(monkeypatch):
    """``gaia chat --ui`` (the desktop backend) and the daemon both repair PATH."""
    import inspect
    import types

    import gaia.cli as cli
    from gaia.daemon import server
    from gaia.ui import server as ui_server

    order = []
    monkeypatch.setattr(cli, "use_os_trust_store", lambda: None)
    monkeypatch.setattr(cli, "apply_login_path", lambda: order.append("login"))

    def exposed(*_args):
        order.append("gaia")
        raise SystemExit(0)

    monkeypatch.setattr(cli, "expose_shipped_gaia", exposed)

    class Parser:
        def parse_args(self):
            return types.SimpleNamespace(action="chat")

    monkeypatch.setattr(cli, "build_parser", lambda: Parser())
    with pytest.raises(SystemExit):
        cli.main()
    assert order == ["login", "gaia"]

    source = inspect.getsource(server.run)
    assert source.index("apply_login_path()") < source.index("expose_shipped_gaia()")
    assert "expose_shipped_gaia()" in inspect.getsource(ui_server.main)
