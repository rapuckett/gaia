# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""State written after import lands under ``GAIA_HOME``, never the real ``~/.gaia``."""

from gaia.agents.base.memory_store import resolve_memory_db_path
from gaia.connectors.activations import activate_agent
from gaia.connectors.grants import grant_agent
from gaia.schedule.store import Schedule, TomlScheduleStore

GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly"


def test_connectors_schedules_and_memory_follow_gaia_home(tmp_path, monkeypatch):
    fake_home = tmp_path / "home"
    gaia_home = tmp_path / "elsewhere"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.setenv("USERPROFILE", str(fake_home))
    monkeypatch.setenv("GAIA_HOME", str(gaia_home))
    monkeypatch.delenv("GAIA_MEMORY_DB", raising=False)
    monkeypatch.delenv("GAIA_CONFIG_DIR", raising=False)

    grant_agent("google", "builtin:chat", [GMAIL_READONLY])
    activate_agent("google", "builtin:chat")
    TomlScheduleStore().add(Schedule(name="nightly", cron="0 3 * * *", prompt="hi"))
    memory_db = resolve_memory_db_path()

    assert (gaia_home / "connectors" / "grants.json").is_file()
    assert (gaia_home / "connectors" / "activations.json").is_file()
    assert (gaia_home / "schedules.toml").is_file()
    assert memory_db == gaia_home / "memory.db"
    assert not (fake_home / ".gaia").exists()
