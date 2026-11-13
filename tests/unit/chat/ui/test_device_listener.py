# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The listener paired devices reach, over a real TLS socket on 127.0.0.1.

The listener runs in its own event loop on a thread, as it shares the
backend's loop in production; the tests talk to it through a client that
checks the certificate pin before it sends anything.
"""

from __future__ import annotations

import asyncio
import logging
import socket
import ssl
import threading
import time
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.listener import DeviceGate, ListenerError
from gaia.ui.security import ListenerScopeMiddleware
from gaia.ui.server import create_app

from .pinned_client import PinMismatch, PinnedConnection, call

pytestmark = pytest.mark.allow_network  # TLS on 127.0.0.1 only

PC = ("127.0.0.1", 50000)


class _Running:
    def poll(self):
        return None


@pytest.fixture
def served(tmp_path):
    app = create_app(db_path=":memory:")
    access = DeviceAccess(app, folder=tmp_path / "devices", host="127.0.0.1", port=0)
    app.state.devices = access
    loop = asyncio.new_event_loop()
    thread = threading.Thread(
        target=loop.run_forever, name="listener-test", daemon=True
    )
    thread.start()

    def run(coroutine, timeout=30):
        return asyncio.run_coroutine_threadsafe(coroutine, loop).result(timeout)

    run(access.start())
    offer = access.open_pairing()
    try:
        yield SimpleNamespace(
            app=app,
            access=access,
            run=run,
            port=access.status()["port"],
            pin=offer["pin"],
            offer=offer,
        )
    finally:
        run(access.shutdown())
        loop.call_soon_threadsafe(loop.stop)
        thread.join(timeout=5)
        loop.close()


def _pair(served, allow=True, invite=None):
    invite = invite or served.access.open_pairing()["invite"]
    paired = served.access.redeem(invite, "Pixel 9", "android", "192.168.1.20")
    if allow:
        served.access.allow(paired["device_id"])
    return paired


def _tunnel_token(app) -> str:
    tunnel = app.state.tunnel
    tunnel._url, tunnel._token, tunnel._process = (
        "https://fake.ngrok-free.app",
        str(uuid.uuid4()),
        _Running(),
    )
    return tunnel._token


def test_client_checks_pin_before_sending(served):
    """The pin is the served leaf's SHA-256; a wrong one sends no request."""
    status, _, _ = call(served.port, served.pin, "GET", "/api/sessions")
    assert status == 401
    assert served.access.requests_served == 1

    with pytest.raises(PinMismatch):
        call(served.port, "0" * 64, "GET", "/api/sessions")
    assert served.access.requests_served == 1


def test_tls_min_version_1_2(served):
    for version in (ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_3):
        connection = PinnedConnection(
            "127.0.0.1", served.port, served.pin, max_tls=version
        )
        connection.request("GET", "/api/health")
        assert connection.getresponse().status == 401
        connection.close()

    old = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    old.check_hostname, old.verify_mode = False, ssl.CERT_NONE
    old.set_ciphers("DEFAULT:@SECLEVEL=0")
    old.minimum_version = old.maximum_version = ssl.TLSVersion.TLSv1_1
    with socket.create_connection(("127.0.0.1", served.port), timeout=5) as raw:
        with pytest.raises(ssl.SSLError) as refused:
            old.wrap_socket(raw)
    # The ClientHello went out and the listener hung up or sent the alert; a
    # client unable to offer TLS 1.1 would have failed before connecting.
    assert refused.value.reason in (
        "TLSV1_ALERT_PROTOCOL_VERSION",
        "UNEXPECTED_EOF_WHILE_READING",
    )


def _gate_scope(**overrides):
    return {
        "type": "http",
        "method": "GET",
        "path": "/api/sessions",
        "headers": [],
        "client": ("192.168.1.20", 50000),
        "server": ("192.168.1.10", 4243),
        "scheme": "https",
        **overrides,
    }


async def _through_gate(app, scope, allow_loopback=False):
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    gate = DeviceGate(app, app.state.devices, allow_loopback=allow_loopback)
    await ListenerScopeMiddleware(gate)(scope, receive, send)
    return sent


@pytest.mark.parametrize(
    "case",
    [
        "no-token",
        "tunnel-token",
        "tunnel-cookie",
        "query-token",
        "health-without-token",
        "web-ui",
        "web-ui-with-token",
        "docs",
        "docs-with-token",
        "openapi",
        "openapi-with-token",
        "pending-device",
        "body-over-the-cap",
        "public-peer",
        "relay-from-loopback",
        "websocket-without-token",
        "listener-stack-without-the-gate",
        "device-token-over-plain-http",
    ],
)
def test_listener_refuses(served, case):
    device = _pair(served)
    get = lambda path, **kw: call(
        served.port, served.pin, "GET", path, **kw
    )  # noqa: E731
    if case == "no-token":
        assert get("/api/sessions")[0] == 401
    elif case == "tunnel-token":
        assert get("/api/sessions", token=_tunnel_token(served.app))[0] == 401
    elif case == "tunnel-cookie":
        cookie = f"gaia_tunnel_token={_tunnel_token(served.app)}"
        assert get("/api/sessions", headers={"Cookie": cookie})[0] == 401
    elif case == "query-token":
        assert get(f"/api/sessions?token={_tunnel_token(served.app)}")[0] == 401
    elif case == "health-without-token":
        assert get("/api/health")[0] == 401
    elif case.startswith(("web-ui", "docs", "openapi")):
        path = {"web-ui": "/", "docs": "/docs", "openapi": "/openapi.json"}[
            case.replace("-with-token", "")
        ]
        token = device["token"] if case.endswith("with-token") else None
        status, _, body = get(path, token=token)
        assert status == 404 and b"openapi" not in body.lower()
    elif case == "pending-device":
        waiting = _pair(served, allow=False)
        status, _, body = get("/api/sessions", token=waiting["token"])
        assert status == 403 and b"device_pending" in body
    elif case == "body-over-the-cap":
        status, _, _ = call(
            served.port,
            served.pin,
            "POST",
            "/api/sessions",
            token=device["token"],
            body={"title": "x" * (9 * 1024 * 1024)},
        )
        assert status == 413
    elif case in ("public-peer", "relay-from-loopback"):
        peer = ("203.0.113.7", 443) if case == "public-peer" else ("127.0.0.1", 50000)
        headers = [(b"authorization", f"Bearer {device['token']}".encode())]
        sent = served.run(
            _through_gate(served.app, _gate_scope(client=peer, headers=headers))
        )
        assert sent[0]["status"] == 403
    elif case == "websocket-without-token":
        sent = served.run(
            _through_gate(
                served.app, _gate_scope(type="websocket", scheme="wss", method=None)
            )
        )
        assert sent == [{"type": "websocket.close", "code": 1008}]
    elif case == "listener-stack-without-the-gate":
        misbuilt = TestClient(ListenerScopeMiddleware(served.app), client=PC)
        for path in ("/", "/docs", "/openapi.json", "/api/sessions"):
            assert misbuilt.get(path).status_code == 401, path
    elif case == "device-token-over-plain-http":
        local = TestClient(served.app, client=PC)
        resp = local.get(
            "/api/sessions", headers={"Authorization": f"Bearer {device['token']}"}
        )
        assert resp.status_code == 401 and "plain http" in resp.json()["detail"]


def test_an_allowed_device_is_served(served):
    device = _pair(served)
    status, headers, _ = call(
        served.port, served.pin, "GET", "/api/sessions", token=device["token"]
    )
    assert status == 200


def test_revoke_closes_inflight_stream(served):
    device = _pair(served)
    stream = PinnedConnection("127.0.0.1", served.port, served.pin, timeout=10)
    stream.request(
        "GET",
        "/api/sessions/events",
        headers={"Authorization": f"Bearer {device['token']}"},
    )
    response = stream.getresponse()
    assert response.status == 200
    assert response.readline().startswith(b": keepalive")

    started = time.monotonic()
    assert served.access.revoke(device["device_id"])
    response.read()
    assert time.monotonic() - started < 3
    stream.close()

    status, _, _ = call(
        served.port, served.pin, "GET", "/api/sessions", token=device["token"]
    )
    assert status == 401


def test_port_in_use_fails_loudly(tmp_path):
    with socket.socket() as taken:
        taken.bind(("127.0.0.1", 0))
        taken.listen(1)
        port = taken.getsockname()[1]
        app = create_app(db_path=":memory:")
        access = DeviceAccess(
            app, folder=tmp_path / "devices", host="127.0.0.1", port=port
        )
        with pytest.raises(ListenerError) as failed:
            asyncio.run(access.start())
    assert failed.value.code == "port_in_use" and str(port) in failed.value.detail
    assert access.status()["error_code"] == "port_in_use"
    assert access.status()["listening"] is False


def test_no_token_or_invite_in_logs(served, caplog):
    caplog.set_level(logging.DEBUG)
    invite = served.access.open_pairing()["invite"]
    device = _pair(served, invite=invite)
    call(served.port, served.pin, "GET", "/api/sessions", token=device["token"])
    call(served.port, served.pin, "GET", "/api/sessions", token=device["token"] + "x")
    call(served.port, served.pin, "GET", f"/api/sessions?token={device['token']}")
    served.access.revoke(device["device_id"])

    logged = caplog.text
    secret = device["token"].removeprefix("gaiad_")
    for value in (device["token"], secret[:8], invite, invite[:8]):
        assert value not in logged
    assert device["device_id"] in logged
