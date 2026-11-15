# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The dev backend serves the real Agent UI chat path from a scripted LLM."""

import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import httpx
import pytest

import gaia

UI_HEADERS = {"X-Gaia-UI": "1"}


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _setup_ready(port: int) -> bool:
    resp = httpx.get(
        f"http://127.0.0.1:{port}/api/setup/check",
        params={"skip_chat_model": "false"},
        headers=UI_HEADERS,
        timeout=120,
    )
    return resp.json()["ready"]


def test_fresh_flag_starts_not_set_up(tmp_path):
    port, llm_port = _free_port(), _free_port()
    proc = _start(tmp_path, port, llm_port, "--fresh")
    try:
        assert _setup_ready(port) is False
        assert not (tmp_path / "home" / "chat" / "initialized").exists()
    finally:
        _stop(proc)


def test_fresh_refuses_a_home_that_is_already_set_up(tmp_path, monkeypatch, capsys):
    from gaia.testing import dev_backend

    monkeypatch.setattr(os, "environ", dict(os.environ))
    home = tmp_path / "home"
    dev_backend.isolate_environment(home, "http://127.0.0.1:1/api/v1")
    dev_backend.mark_set_up()

    code = dev_backend.main(["--port", "4299", "--home", str(home), "--fresh"])

    assert code == dev_backend.EX_USAGE
    err = capsys.readouterr().err
    assert "Use an empty --home for --fresh" in err
    assert str(home) in err


def _stop(proc):
    proc.terminate()
    try:
        assert proc.wait(timeout=30) == 0
    except subprocess.TimeoutExpired:
        proc.kill()
        pytest.fail("dev backend ignored SIGTERM")


def _start(tmp_path, port, llm_port, *extra):
    script = tmp_path / "script.json"
    script.write_text(json.dumps(["The scripted answer."]))
    env = {
        k: v for k, v in os.environ.items() if not k.startswith(("GAIA_", "LEMONADE_"))
    }
    env["PYTHONPATH"] = str(Path(gaia.__file__).resolve().parents[1])
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "gaia.testing.dev_backend",
            "--port",
            str(port),
            "--llm-port",
            str(llm_port),
            "--home",
            str(tmp_path / "home"),
            "--script",
            str(script),
            *extra,
        ],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        seen = []
        for line in proc.stdout:
            seen.append(line)
            if line.startswith("READY "):
                break
        else:
            pytest.fail("backend exited before READY:\n" + "".join(seen[-20:]))
    except BaseException:
        proc.kill()
        raise
    return proc


def test_scripted_reply_streams_through_real_chat_api(tmp_path):
    port, llm_port = _free_port(), _free_port()
    proc = _start(tmp_path, port, llm_port)
    try:
        assert _setup_ready(port) is True
        base = f"http://127.0.0.1:{port}"
        session = httpx.post(
            f"{base}/api/sessions", json={"title": "e2e"}, headers=UI_HEADERS
        ).json()
        with httpx.stream(
            "POST",
            f"{base}/api/chat/send",
            json={"session_id": session["id"], "message": "hi", "stream": True},
            headers=UI_HEADERS,
            timeout=120,
        ) as resp:
            events = [
                json.loads(line[len("data: ") :])
                for line in resp.iter_lines()
                if line.startswith("data: ")
            ]
        assert any(
            e.get("type") == "answer" and e.get("content") == "The scripted answer."
            for e in events
        ), events[-3:]
        # Memory is off by default (no embedder behind the fake LLM): no warning.
        assert not any("Memory is unavailable" in json.dumps(e) for e in events), [
            e for e in events if "Memory" in json.dumps(e)
        ]
    finally:
        _stop(proc)


def _speak(port, **body):
    return httpx.post(
        f"http://127.0.0.1:{port}/api/speech",
        json={"text": "Hello there.", "voice": "af_bella", "speed": 100, **body},
        headers=UI_HEADERS,
        timeout=120,
    )


def test_read_aloud_returns_wav_in_the_default_state(tmp_path):
    port, llm_port = _free_port(), _free_port()
    proc = _start(tmp_path, port, llm_port)
    try:
        resp = _speak(port)
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "audio/wav"
        assert resp.content[:4] == b"RIFF" and len(resp.content) > 44
    finally:
        _stop(proc)


def test_read_aloud_fails_with_no_voice_under_fresh(tmp_path):
    port, llm_port = _free_port(), _free_port()
    proc = _start(tmp_path, port, llm_port, "--fresh")
    try:
        resp = _speak(port)
        assert resp.status_code == 502
        assert "has no model 'kokoro-v1'" in resp.json()["detail"]
    finally:
        _stop(proc)


def test_fake_speech_validates_the_request():
    from fastapi.testclient import TestClient

    from gaia.audio.lemonade_tts import DEFAULT_TTS_MODEL, TTS_SAMPLE_RATE
    from gaia.testing import dev_backend

    client = TestClient(
        dev_backend.build_fake_llm([{"text": "x"}], "m", [DEFAULT_TTS_MODEL])
    )
    url = "/api/v1/audio/speech"
    good = {"model": DEFAULT_TTS_MODEL, "input": "hi", "voice": "af_bella"}

    ok = client.post(url, json=good)
    assert ok.status_code == 200
    assert ok.headers["content-type"] == f"audio/l16;rate={TTS_SAMPLE_RATE}"
    assert len(ok.content) == 2 * int(1.5 * TTS_SAMPLE_RATE)
    assert client.post(url, json={**good, "model": "nope"}).status_code == 404
    assert client.post(url, json={**good, "voice": "nobody"}).status_code == 500


def test_local_models_list_the_chat_model_as_fitting(tmp_path):
    from gaia.llm.lemonade_client import DEFAULT_MODEL_NAME

    port, llm_port = _free_port(), _free_port()
    proc = _start(tmp_path, port, llm_port)
    try:
        resp = httpx.get(
            f"http://127.0.0.1:{port}/api/providers/local/models",
            headers=UI_HEADERS,
            timeout=120,
        )
        assert resp.status_code == 200, resp.text
        rows = {m["id"]: m for m in resp.json()["models"]}
        assert rows[DEFAULT_MODEL_NAME]["fits"] is True
        assert resp.json()["capacity_error"] is None
    finally:
        _stop(proc)


def test_fake_system_info_is_what_model_fit_reads():
    from fastapi.testclient import TestClient

    from gaia.llm.lemonade_client import DEFAULT_MODEL_NAME
    from gaia.llm.model_fit import capacity_from_system_info
    from gaia.testing import dev_backend

    client = TestClient(dev_backend.build_fake_llm([{"text": "x"}], DEFAULT_MODEL_NAME))
    resp = client.get("/api/v1/system-info")

    assert resp.status_code == 200
    capacity = capacity_from_system_info(resp.json())
    assert capacity.memory_gb > dev_backend.GPU_MEMORY_MARGIN_GB
    assert not capacity.has_npu
