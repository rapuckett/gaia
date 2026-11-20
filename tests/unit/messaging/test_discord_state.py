# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""The bridge's files: the one-copy lock and what status reports."""

from __future__ import annotations

import os
import time

import pytest

from gaia.messaging.discord import state


@pytest.fixture(autouse=True)
def gaia_home(tmp_path, monkeypatch):
    monkeypatch.setenv("GAIA_CONFIG_DIR", str(tmp_path))
    monkeypatch.delenv("GAIA_HOME", raising=False)


def test_a_second_bridge_cannot_take_the_lock():
    with state.BridgeLock():
        assert state.is_running()
        with pytest.raises(state.BridgeAlreadyRunning):
            state.BridgeLock().acquire()
    assert not state.is_running()


def test_a_live_state_without_the_lock_reads_as_stopped():
    with state.BridgeLock():
        state.write_status(state.STATE_CONNECTED)
    status = state.read_status()
    assert status.state == state.STATE_STOPPED
    assert "unexpectedly" in status.detail


def test_a_spawned_bridge_reads_as_starting_before_it_takes_the_lock():
    state.write_status(state.STATE_STARTING, "Starting…", pid=os.getpid())
    assert state.read_status().state == state.STATE_STARTING


def test_a_start_that_never_took_the_lock_stops_reading_as_starting(monkeypatch):
    state.write_status(state.STATE_STARTING, "Starting…", pid=os.getpid())
    later = time.time() + state.STARTING_GRACE_SECONDS + 1
    monkeypatch.setattr(state.time, "time", lambda: later)
    assert state.read_status().state == state.STATE_STOPPED


def test_a_corrupt_config_fails_loudly():
    state.config_path().parent.mkdir(parents=True, exist_ok=True)
    state.config_path().write_text("{not json", encoding="utf-8")
    with pytest.raises(state.BridgeStateError, match="not valid JSON"):
        state.load_config()


def test_a_zeroed_status_file_is_set_aside_and_the_bridge_can_still_start():
    state.status_path().parent.mkdir(parents=True, exist_ok=True)
    state.status_path().write_bytes(b"\0" * 200)
    assert state.read_status().state == state.STATE_STOPPED
    state.write_status(state.STATE_STOPPED, "ok")
    assert state.read_status().detail == "ok"
    assert list(state.status_path().parent.glob("status.json.damaged-*"))


def test_writes_reach_the_disk_before_the_rename(monkeypatch):
    order = []
    real_fsync, real_replace = os.fsync, os.replace
    monkeypatch.setattr(
        state.os, "fsync", lambda fd: (order.append("fsync"), real_fsync(fd))
    )
    monkeypatch.setattr(
        state.os, "replace", lambda a, b: (order.append("replace"), real_replace(a, b))
    )
    state.write_json(state.discord_dir() / "x.json", {"a": 1})
    assert order == ["fsync", "replace"]


def test_status_keeps_fields_a_write_does_not_name():
    state.write_status(state.STATE_STOPPED, last_message_id="42")
    state.write_status(state.STATE_STOPPED, "again")
    assert state.read_status().last_message_id == "42"


def test_disconnect_does_not_bring_the_setup_offer_straight_back(monkeypatch):
    from gaia.messaging import onboarding as offer
    from gaia.messaging.discord import cli, credentials

    monkeypatch.setattr(credentials, "clear", lambda: None)
    monkeypatch.setattr(cli, "detect_discord", lambda: True)
    cli.disconnect()
    decision = offer.load_state(cli._onboarding_path(), "Discord")
    assert not offer.should_offer(decision, detected=True)


def test_pair_keeps_the_pairing_when_the_bridge_will_not_stop(monkeypatch):
    from types import SimpleNamespace

    from gaia.messaging.discord import cli

    config = state.BridgeConfig(bot_id="9", owner_id="111", dm_channel_id="5")
    state.save_config(config)
    monkeypatch.setattr(cli, "stop", lambda **_: False)
    assert cli.main(SimpleNamespace(discord_action="pair")) == 1
    assert state.load_config().owner_id == "111"


def test_a_background_start_refuses_foreground_only_limits(capsys):
    from types import SimpleNamespace

    from gaia.messaging.discord import cli

    args = SimpleNamespace(
        discord_action="start", detach=True, deny_gated_tools=True, upload_root=None
    )
    assert cli.main(args) == 2
    assert "foreground only" in capsys.readouterr().err


def _connected(autostart=True):
    config = state.BridgeConfig(bot_id="9", owner_id="111", dm_channel_id="5")
    config.autostart = autostart
    state.save_config(config)


def test_the_users_stop_keeps_the_apps_from_bringing_it_back(monkeypatch):
    from gaia.messaging.discord import cli

    _connected()
    started = []
    monkeypatch.setattr(cli, "start_detached", lambda **_: started.append(1) or 0)
    assert cli.run_stop(emit=lambda _: None) == 0
    assert state.load_config().autostart is False
    assert cli.ensure_started() is None and started == []


def test_a_stop_inside_a_restart_does_not_turn_autostart_off():
    from gaia.messaging.discord import cli

    _connected()
    assert cli.stop()
    assert state.load_config().autostart is True


def test_a_start_turns_autostart_back_on(monkeypatch):
    from gaia.messaging.discord import cli

    _connected(autostart=False)
    monkeypatch.setattr(cli, "_start_detached_locked", lambda **_: 0)
    assert cli.start_detached(emit=lambda _: None) == 0
    assert state.load_config().autostart is True


def test_recovery_text_names_no_command():
    from gaia.messaging.discord import adapter

    assert "gaia discord" not in adapter.RESTART_HINT
    assert "Stop, then Start" in adapter.RESTART_HINT
    assert "never tell them to run a command" in adapter.DISCORD_REPLY_NOTE


def test_setup_with_no_terminal_says_so_instead_of_a_traceback(monkeypatch):
    """`gaia discord setup` with stdin closed (a pipe, CI, a service) ended in
    an EOFError traceback from getpass."""
    from gaia.messaging.discord import cli

    def no_terminal(_prompt):
        raise EOFError

    def never(_token):
        raise AssertionError("nothing was typed, so nothing may be connected")

    monkeypatch.setattr(cli, "connect", never)
    lines = []
    code = cli.run_setup(prompt=no_terminal, emit=lines.append, open_browser=False)

    assert code == 1
    assert "gaia discord connect" in lines[-1]
    assert not state.is_running()


def test_setup_with_an_empty_token_is_refused_not_connected(monkeypatch):
    from gaia.messaging.discord import cli

    started = []
    monkeypatch.setattr(cli, "start_detached", lambda **_: started.append(1) or 0)
    lines = []
    code = cli.run_setup(prompt=lambda _p: "", emit=lines.append, open_browser=False)

    assert code == 1
    assert lines[-1].startswith("\n❌")
    assert started == []


def _linked(**links):
    config = state.BridgeConfig(bot_id="9", owner_id="111", dm_channel_id="5", **links)
    state.save_config(config)


@pytest.fixture
def cleared(monkeypatch):
    """The keyring token's deletions, recorded instead of made."""
    from gaia.messaging.discord import credentials

    calls = []
    monkeypatch.setattr(credentials, "clear", lambda: calls.append("clear"))
    monkeypatch.setattr(state, "forget_always", lambda: calls.append("always") or 0)
    return calls


def test_a_connect_from_a_device_links_the_token_to_it(monkeypatch):
    from gaia.messaging.discord import cli, credentials, transport

    identity = {
        "bot_id": "9",
        "bot_name": "GAIA",
        "application_id": "1",
        "bot_public": False,
    }
    monkeypatch.setattr(transport, "verify_token", lambda token: identity)
    monkeypatch.setattr(cli, "_connector_bot_id", lambda: None)
    monkeypatch.setattr(credentials, "save", lambda token: None)
    cli.connect("tok", started_by="phone")
    assert state.load_config().token_device_id == "phone"
    cli.reset_pairing(started_by="tablet")
    config = state.load_config()
    assert (config.pairing_device_id, config.token_device_id) == ("tablet", "phone")
    cli.connect("tok")
    assert state.load_config().token_device_id == ""


def test_unlinking_the_tokens_device_disconnects_the_bridge(cleared):
    from gaia.messaging.discord import cli

    _linked(token_device_id="phone", pairing_device_id="tablet")
    assert cli.unlink_devices(["tablet-2"]) is None
    assert cli.unlink_devices(["phone"]) == "disconnected"
    config = state.load_config()
    assert (config.bot_id, config.owner_id, config.token_device_id) == ("", "", "")
    assert cleared == ["clear", "always"]


def test_a_device_that_only_paired_resets_the_pairing_and_keeps_the_token(cleared):
    from gaia.messaging.discord import cli

    _linked(pairing_device_id="tablet")
    assert cli.unlink_devices(["tablet"]) == "reset"
    config = state.load_config()
    assert (config.bot_id, config.owner_id) == ("9", "")
    assert cleared == ["always"]


def test_a_stuck_bridge_keeps_the_token_and_says_so(monkeypatch, cleared):
    from gaia.messaging.discord import cli

    _linked(token_device_id="phone")
    monkeypatch.setattr(cli, "stop", lambda **_: False)
    with pytest.raises(cli.PairingKept, match="stayed connected"):
        cli.unlink_devices(["phone"])
    assert state.load_config().token_device_id == "phone" and cleared == []


def test_a_keyring_that_wont_forget_the_token_keeps_the_link(monkeypatch):
    import keyring.errors

    from gaia.messaging.discord import cli, credentials

    _linked(token_device_id="phone")

    def locked():
        raise keyring.errors.KeyringLocked("locked")

    monkeypatch.setattr(credentials, "clear", locked)
    with pytest.raises(cli.PairingKept, match="couldn't remove its token"):
        cli.unlink_devices(["phone"])
    assert state.load_config().token_device_id == "phone"


def test_a_start_disconnects_a_token_whose_device_is_gone(monkeypatch, cleared):
    """No device table means no device is paired, so the link is stale."""
    from gaia.messaging.discord import cli

    _linked(token_device_id="expired-phone")
    monkeypatch.setattr(
        cli, "start_detached", lambda **_: pytest.fail("started the bridge")
    )
    config = state.load_config()
    config.autostart = True
    state.save_config(config)
    assert cli.ensure_started() is None
    assert not state.load_config().connected and cleared == ["clear", "always"]


def test_a_status_read_resets_a_pairing_by_a_device_no_longer_allowed(cleared):
    from gaia.messaging.discord import cli

    _linked(pairing_device_id="pending-tablet")
    assert cli.unlink_stale_devices(["phone"]) == "reset"
    assert state.load_config().owner_id == ""
    _linked(pairing_device_id="phone")
    assert cli.unlink_stale_devices(["phone"]) is None
    assert state.load_config().owner_id == "111"
