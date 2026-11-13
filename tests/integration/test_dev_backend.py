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


def test_scripted_reply_streams_through_real_chat_api(tmp_path):
    script = tmp_path / "script.json"
    script.write_text(json.dumps(["The scripted answer."]))
    port, llm_port = _free_port(), _free_port()
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
    finally:
        proc.terminate()
        try:
            code = proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
            pytest.fail("dev backend ignored SIGTERM")
    assert code == 0
