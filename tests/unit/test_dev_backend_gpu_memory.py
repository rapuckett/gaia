# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""GAIA_DEV_BACKEND_GPU_GB sizes the dev backend's fake PC so a model can be tight."""

import os

import pytest
from fastapi.testclient import TestClient

from gaia.installer.model_choice import memory_fit
from gaia.llm.lemonade_client import (
    DEFAULT_MODEL_NAME,
    LARGE_DEFAULT_MODEL_NAME,
    find_model_requirement,
)
from gaia.llm.model_fit import capacity_from_system_info
from gaia.testing import dev_backend

TIGHT_GPU_GB = 32.0


def _fit(model_id, gpu_gb):
    info = dev_backend.fake_system_info([DEFAULT_MODEL_NAME], gpu_gb)
    size = find_model_requirement(model_id).size_gb
    return memory_fit(model_id, size, capacity_from_system_info(info))


def test_recommended_value_makes_qwen_tight_and_gemma_a_plain_fit():
    qwen = _fit(LARGE_DEFAULT_MODEL_NAME, TIGHT_GPU_GB)
    gemma = _fit(DEFAULT_MODEL_NAME, TIGHT_GPU_GB)

    assert qwen["fits"] and qwen["tight"]
    assert gemma["fits"] and not gemma["tight"]


def test_unset_keeps_the_discrete_gpu_with_need_plus_margin():
    info = dev_backend.fake_system_info([DEFAULT_MODEL_NAME])

    assert info == dev_backend.fake_system_info([DEFAULT_MODEL_NAME], None)
    (gpu,) = info["devices"]["amd_gpu"]
    assert gpu["vram_gb"] > dev_backend.GPU_MEMORY_MARGIN_GB
    assert "amd_igpu" not in info["devices"] and "Physical Memory" not in info
    assert not _fit(DEFAULT_MODEL_NAME, None)["tight"]


def test_catalog_lists_qwen_as_not_downloaded_only_with_show_all():
    app = dev_backend.build_fake_llm([], DEFAULT_MODEL_NAME, [DEFAULT_MODEL_NAME])
    client = TestClient(app)

    plain = {m["id"] for m in client.get("/api/v1/models").json()["data"]}
    every = {
        m["id"]: m for m in client.get("/api/v1/models?show_all=true").json()["data"]
    }

    assert LARGE_DEFAULT_MODEL_NAME not in plain
    assert every[LARGE_DEFAULT_MODEL_NAME]["downloaded"] is False


def test_fake_llm_serves_the_configured_size():
    app = dev_backend.build_fake_llm([], DEFAULT_MODEL_NAME, [], TIGHT_GPU_GB)
    info = TestClient(app).get("/api/v1/system-info").json()

    assert info["devices"]["amd_igpu"][0]["vram_gb"] == TIGHT_GPU_GB


@pytest.mark.parametrize("raw", ["big", "0", "-4", "nan", "inf", "5000", ""])
def test_invalid_env_value_is_a_startup_error_naming_the_variable(
    raw, monkeypatch, tmp_path, capsys
):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "home"))
    monkeypatch.setenv(dev_backend.GPU_MEMORY_ENV, raw)

    code = dev_backend.main(["--port", "4299", "--home", str(tmp_path / "home")])

    assert code == dev_backend.EX_USAGE
    err = capsys.readouterr().err
    assert dev_backend.GPU_MEMORY_ENV in err and "number of GB" in err


def test_invalid_flag_names_the_flag(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "home"))

    code = dev_backend.main(
        ["--port", "4299", "--home", str(tmp_path / "home"), "--gpu-memory-gb", "x"]
    )

    assert code == dev_backend.EX_USAGE
    assert "--gpu-memory-gb" in capsys.readouterr().err


def test_downloaded_extra_makes_qwen_downloaded_and_still_tight():
    ids = dev_backend.parse_downloaded(LARGE_DEFAULT_MODEL_NAME, "x")
    app = dev_backend.build_fake_llm([], DEFAULT_MODEL_NAME, ids, TIGHT_GPU_GB)
    client = TestClient(app)

    every = {
        m["id"]: m for m in client.get("/api/v1/models?show_all=true").json()["data"]
    }
    info = client.get("/api/v1/system-info").json()
    size = find_model_requirement(LARGE_DEFAULT_MODEL_NAME).size_gb
    fit = memory_fit(LARGE_DEFAULT_MODEL_NAME, size, capacity_from_system_info(info))

    assert every[LARGE_DEFAULT_MODEL_NAME]["downloaded"] is True
    assert fit["fits"] and fit["tight"]


def test_downloaded_parses_a_list_and_drops_duplicates():
    ids = dev_backend.parse_downloaded(
        f" {LARGE_DEFAULT_MODEL_NAME}, {DEFAULT_MODEL_NAME},{LARGE_DEFAULT_MODEL_NAME}",
        "x",
    )

    assert ids == [LARGE_DEFAULT_MODEL_NAME, DEFAULT_MODEL_NAME]


@pytest.mark.parametrize("raw", ["Nope-GGUF", f"{DEFAULT_MODEL_NAME},Nope", ""])
def test_unknown_downloaded_env_is_a_startup_error(raw, monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "home"))
    monkeypatch.setenv(dev_backend.DOWNLOADED_ENV, raw)

    code = dev_backend.main(["--port", "4299", "--home", str(tmp_path / "home")])

    assert code == dev_backend.EX_USAGE
    err = capsys.readouterr().err
    assert dev_backend.DOWNLOADED_ENV in err and "lemonade_client.py" in err


def test_flag_beats_env_and_unknown_flag_id_names_the_flag(
    monkeypatch, tmp_path, capsys
):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "home"))
    monkeypatch.setenv(dev_backend.DOWNLOADED_ENV, "Nope")
    seen = {}

    def fake_run(*args):
        seen["extra"] = args[-1]
        return 0

    monkeypatch.setattr(dev_backend, "run", fake_run)

    code = dev_backend.main(
        [
            "--port",
            "4299",
            "--home",
            str(tmp_path / "home"),
            "--downloaded",
            LARGE_DEFAULT_MODEL_NAME,
        ]
    )
    assert code == 0 and seen["extra"] == [LARGE_DEFAULT_MODEL_NAME]

    code = dev_backend.main(
        ["--port", "4299", "--home", str(tmp_path / "home"), "--downloaded", "Bad"]
    )
    assert code == dev_backend.EX_USAGE
    assert "--downloaded" in capsys.readouterr().err
