# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""Keep the Discord bridge's ``gaia`` launcher off the machine's own install."""

import pytest


@pytest.fixture(autouse=True)
def fake_gaia_launcher(tmp_path, monkeypatch):
    """A stand-in ``gaia.exe``, so a PC without one installed still tests."""
    from gaia.messaging.discord import adapter

    launcher = tmp_path / "launcher" / "gaia.exe"
    launcher.parent.mkdir()
    launcher.write_bytes(b"MZ")
    monkeypatch.setattr(adapter, "_gaia_launcher", lambda: launcher)
    return launcher


@pytest.fixture(autouse=True)
def own_gaia_home(tmp_path, monkeypatch):
    """Each test gets its own GAIA tree. An exported ``GAIA_HOME`` outranks
    ``GAIA_CONFIG_DIR``, so it is cleared: otherwise these tests read and
    write the developer's real Discord state, bridge lock included."""
    monkeypatch.delenv("GAIA_HOME", raising=False)
    monkeypatch.setenv("GAIA_CONFIG_DIR", str(tmp_path))


@pytest.fixture(autouse=True)
def close_discord_adapters(monkeypatch, request):
    """Close every adapter a test builds, then fail on an approval timer left
    armed. An open prompt's 600 s timer would otherwise fire inside a later
    test and log into that test's temp GAIA home while it is cleaned up."""
    import threading

    from gaia.messaging.discord import adapter as da

    built = []
    real_init = da.DiscordAdapter.__init__

    def tracking_init(self, *args, **kwargs):
        real_init(self, *args, **kwargs)
        built.append(self)

    monkeypatch.setattr(da.DiscordAdapter, "__init__", tracking_init)
    yield
    for adapter in built:
        adapter.close()
    leaked = [
        t
        for t in threading.enumerate()
        if isinstance(t, threading.Timer)
        and getattr(t.function, "__func__", None) is da.DiscordAdapter._expire
    ]
    for t in leaked:
        t.cancel()
    assert not leaked, (
        f"{request.node.nodeid} left {len(leaked)} Discord approval timer(s) "
        "armed; close the adapter or decide the prompt"
    )
