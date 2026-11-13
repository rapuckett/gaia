# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Device pairing: the switch, the certificate, tokens and invitations."""

from __future__ import annotations

from gaia import env as gaia_env
from gaia.config import GaiaConfig


def test_device_pairing_not_enabled_by_env_or_dotenv(tmp_path, monkeypatch):
    """Only the user's own config file opens a listener on the network."""
    project = tmp_path / "project"
    project.mkdir()
    (project / ".env").write_text(
        "GAIA_DEVICE_PAIRING=1\nDEVICE_PAIRING=true\ndevice_pairing=true\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(project)
    monkeypatch.setattr(gaia_env, "_install_tree_dotenv", lambda: None)
    for name in ("GAIA_DEVICE_PAIRING", "DEVICE_PAIRING", "device_pairing"):
        monkeypatch.setenv(name, "1")
    gaia_env.load_env()

    assert GaiaConfig.load().device_pairing is False

    GaiaConfig.save_key("device_pairing", "true")
    assert GaiaConfig.load().device_pairing is True
