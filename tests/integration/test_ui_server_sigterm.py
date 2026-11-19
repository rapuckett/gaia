# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""The Agent UI server exits promptly on SIGTERM while event streams are open."""

import os
import signal
import socket
import subprocess
import sys
import time

import pytest
import requests

pytestmark = pytest.mark.skipif(
    sys.platform == "win32", reason="POSIX SIGTERM semantics"
)

HEADERS = {"X-Gaia-UI": "1"}


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.parametrize(
    "stream_path", ["/api/sessions/events", "/api/connectors/events"]
)
def test_sigterm_with_event_stream_open(tmp_path, stream_path):
    port = _free_port()
    home = tmp_path / "home"
    home.mkdir()
    env = dict(os.environ)
    env.update(
        {
            "HOME": str(home),
            "USERPROFILE": str(home),
            "GAIA_HOME": str(home / ".gaia"),
            # A remote Lemonade means no daemon or model server is started.
            "LEMONADE_BASE_URL": "http://10.255.255.1:13305",
        }
    )
    log_path = tmp_path / "server.log"
    with open(log_path, "wb") as log:
        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "gaia.ui.server",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    base = f"http://127.0.0.1:{port}"
    response = None
    try:
        deadline = time.monotonic() + 60
        while True:
            assert proc.poll() is None, log_path.read_text(errors="replace")
            try:
                if requests.get(f"{base}/api/health", timeout=2).ok:
                    break
            except requests.RequestException:
                pass
            assert time.monotonic() < deadline, "server never came up"
            time.sleep(0.3)

        response = requests.get(
            f"{base}{stream_path}", headers=HEADERS, stream=True, timeout=10
        )
        assert response.status_code == 200
        if stream_path == "/api/sessions/events":
            chunks = response.iter_content(
                chunk_size=1
            )  # dropping it closes the stream
            assert next(chunks) == b":"
        else:
            # connector events send nothing until one fires; the headers suffice
            assert response.headers["content-type"].startswith("text/event-stream")

        proc.send_signal(signal.SIGTERM)
        try:
            code = proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pytest.fail(
                "server still running 5 s after SIGTERM:\n"
                + log_path.read_text(errors="replace")[-2000:]
            )
        output = log_path.read_text(errors="replace")
        # uvicorn re-raises the signal once it has shut down cleanly.
        assert code in (0, -signal.SIGTERM), output[-2000:]
        assert "Waiting for connections to close" not in output
        assert "timeout graceful shutdown exceeded" not in output
        assert "closing 1 open event stream(s)" in output, output[-3000:]
    finally:
        if response is not None:
            response.close()
        if proc.poll() is None:
            proc.kill()
            proc.wait()
