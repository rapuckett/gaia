# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""``/daemon/v1/gateway/*`` — the routes that let the TUI persist a gateway token.

The TUI is Go and the credential store is Python; go-keyring and python-keyring
do not share a Credential Manager target name, so the token has to travel
through the daemon. These tests pin the parts a caller depends on: the token is
guarded by the daemon client token, an unavailable store is a 503 carrying the
platform remedy, and the token is never echoed back or logged.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from gaia.daemon.gateway_routes import build_gateway_router

# TestClient drives ASGI over a local socket; nothing leaves the machine.
pytestmark = pytest.mark.allow_network

TOKEN = "daemon-client-token"
SECRET = "gateway-token-value"


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()
    app.include_router(build_gateway_router(TOKEN))
    return TestClient(app)


@pytest.fixture()
def auth() -> dict:
    return {"Authorization": f"Bearer {TOKEN}"}


GATEWAY_URL = "https://gw.example/v1"


@pytest.fixture(autouse=True)
def _registered_gateway(monkeypatch):
    monkeypatch.setattr(
        "gaia.llm.gateway.configured_gateway_url", lambda *a: GATEWAY_URL
    )


def test_token_route_requires_the_daemon_client_token(client):
    resp = client.post("/daemon/v1/gateway/token", json={"token": SECRET})
    assert resp.status_code == 401


def test_remember_stores_the_token_and_never_returns_it(client, auth, monkeypatch):
    stored = []
    monkeypatch.setattr(
        "gaia.llm.gateway.remember_token", lambda t, u: stored.append((t, u))
    )

    resp = client.post("/daemon/v1/gateway/token", json={"token": SECRET}, headers=auth)

    assert resp.status_code == 200
    assert stored == [(SECRET, GATEWAY_URL)]
    assert SECRET not in resp.text


def test_empty_token_is_rejected_before_it_reaches_the_store(client, auth, monkeypatch):
    monkeypatch.setattr(
        "gaia.llm.gateway.remember_token",
        lambda t, u: pytest.fail("an empty token must not reach the store"),
    )

    assert (
        client.post("/daemon/v1/gateway/token", json={"token": ""}, headers=auth)
    ).status_code == 422


def test_unavailable_store_is_a_503_carrying_the_remedy(client, auth, monkeypatch):
    from gaia.llm.gateway import GatewayError

    remedy = "No usable credential store. Set LEMONADE_AMD_API_KEY instead."

    def boom(_token, _url):
        raise GatewayError(remedy)

    monkeypatch.setattr("gaia.llm.gateway.remember_token", boom)

    resp = client.post("/daemon/v1/gateway/token", json={"token": SECRET}, headers=auth)

    # 503 rather than 500: the TUI branches on it to say "this session only".
    assert resp.status_code == 503
    assert remedy in resp.json()["detail"]


def test_the_token_is_never_logged(client, auth, monkeypatch, caplog):
    monkeypatch.setattr("gaia.llm.gateway.remember_token", lambda t, u: None)

    with caplog.at_level("DEBUG"):
        client.post("/daemon/v1/gateway/token", json={"token": SECRET}, headers=auth)

    assert SECRET not in caplog.text


def test_authenticate_replays_the_stored_token_without_exposing_it(
    client, auth, monkeypatch
):
    class FakeManager:
        def ensure_authenticated(self):
            return True

    monkeypatch.setattr("gaia.llm.gateway.GatewayManager", FakeManager)

    resp = client.post("/daemon/v1/gateway/authenticate", headers=auth)

    assert resp.status_code == 200
    assert resp.json() == {"authenticated": True}


def test_authenticate_reports_false_when_nothing_is_stored(client, auth, monkeypatch):
    class FakeManager:
        def ensure_authenticated(self):
            return False

    monkeypatch.setattr("gaia.llm.gateway.GatewayManager", FakeManager)

    resp = client.post("/daemon/v1/gateway/authenticate", headers=auth)

    assert resp.json() == {"authenticated": False}


def test_forget_is_idempotent(client, auth, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "gaia.llm.gateway.forget_token", lambda: bool(calls.append(1)) or False
    )

    first = client.delete("/daemon/v1/gateway/token", headers=auth)
    second = client.delete("/daemon/v1/gateway/token", headers=auth)

    assert first.status_code == second.status_code == 200
    assert len(calls) == 2


def test_forget_on_an_unusable_store_is_a_503_not_a_500(client, auth, monkeypatch):
    """Exercises the real forget_token, not a stand-in.

    On a headless box the read inside forget_token swallows the unavailable
    backend and returns None, then the delete raises ConnectorsError — so
    mocking forget_token wholesale hides the one path that fails. The caller
    must get a structured 503, not FastAPI's 500 for an unhandled exception.
    """
    from gaia.connectors.errors import ConnectorsError

    def unusable(_name):
        raise ConnectorsError("no usable keyring backend on this host")

    monkeypatch.setattr("gaia.connectors.store.peek_secret", lambda _n: None)
    monkeypatch.setattr("gaia.connectors.store.delete_secret", unusable)

    resp = client.delete("/daemon/v1/gateway/token", headers=auth)

    assert resp.status_code == 503
    assert "keyring" in resp.json()["detail"]


# ── /configure: the TUI's gateway change, under the gateway key lock ─────────

OLD_GATEWAY = "https://old.example/v1"
NEW_GATEWAY = "https://new.example/v1"
CONFIGURE = "/daemon/v1/gateway/configure"


@pytest.fixture()
def lemonade(monkeypatch, tmp_path):
    """Lemonade holding a key for OLD_GATEWAY; records each call and whether
    another GAIA process could have taken the gateway key lock then."""
    import threading
    from unittest.mock import MagicMock

    from gaia.llm import gateway
    from gaia.version import LEMONADE_VERSION

    monkeypatch.setenv("GAIA_HOME", str(tmp_path))
    monkeypatch.setattr(gateway, "GATEWAY_STATE_FILE", tmp_path / "gateway.json")
    monkeypatch.setattr(gateway, "GATEWAY_KEY_LOCK_TIMEOUT", 0.1)
    monkeypatch.setattr(gateway, "resolve_lemonade_api_key", lambda **k: None)
    client = MagicMock()
    client.credential_base_url.return_value = "http://localhost:13305/api/v1"
    client.health_check.return_value = {"status": "ok", "version": LEMONADE_VERSION}
    real = gateway.GatewayManager
    monkeypatch.setattr(gateway, "GatewayManager", lambda: real(client=client))
    calls = []

    def lock_free() -> bool:
        took = []

        def other():
            try:
                with gateway.GATEWAY_KEY_LOCK:
                    took.append(True)
            except gateway.GatewayBusy:
                took.append(False)

        thread = threading.Thread(target=other)
        thread.start()
        thread.join(timeout=5)
        return took[0]

    def request(method, url, json=None, **kwargs):
        path = url.split("/api/v1/", 1)[1]
        calls.append((method, path, json, lock_free()))
        resp = MagicMock(status_code=200)
        body = {}
        if path == "system-info":
            entry = {"name": "amd", "base_url": OLD_GATEWAY, "runtime_key_set": True}
            body = {"cloud": {"providers": [entry]}}
        elif path == "cloud/auth":
            body = {"models_discovered": 2}
        resp.json.return_value = body
        resp.content = b"{}"
        return resp

    monkeypatch.setattr(gateway.requests, "request", request)
    return calls


def test_configure_drops_the_old_key_then_installs_under_the_lock(
    client, auth, lemonade, caplog
):
    with caplog.at_level("DEBUG"):
        resp = client.post(
            CONFIGURE,
            json={
                "base_url": NEW_GATEWAY,
                "auth_header_name": "api-key",
                "auth_header_prefix": "",
                "api_key": SECRET,
            },
            headers=auth,
        )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"configured": True, "models_discovered": True}
    assert [(m, p) for m, p, _, _ in lemonade] == [
        ("GET", "system-info"),
        ("DELETE", "cloud/auth/amd"),
        ("POST", "install"),
        ("POST", "cloud/auth"),
    ]
    assert not any(free for *_, free in lemonade), "a call ran outside the lock"
    install = lemonade[2][2]
    assert install["base_url"] == NEW_GATEWAY and "api_key" not in install
    assert (install["auth_header_name"], install["auth_header_prefix"]) == (
        "api-key",
        "",
    )
    assert lemonade[3][2] == {"provider": "amd", "api_key": SECRET}
    assert SECRET not in resp.text and SECRET not in caplog.text


def test_configure_without_a_key_sends_none(client, auth, lemonade):
    resp = client.post(
        CONFIGURE,
        json={"base_url": OLD_GATEWAY, "auth_header_name": "api-key"},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text
    assert [(m, p) for m, p, _, _ in lemonade] == [
        ("GET", "system-info"),
        ("POST", "install"),
    ]


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer not-the-daemon-token"}, {"Authorization": TOKEN}],
)
def test_configure_refuses_a_caller_without_the_daemon_token(client, lemonade, headers):
    resp = client.post(
        CONFIGURE,
        json={
            "base_url": NEW_GATEWAY,
            "auth_header_name": "api-key",
            "api_key": SECRET,
        },
        headers=headers,
    )
    assert resp.status_code == 401
    assert lemonade == []


@pytest.mark.parametrize(
    "base_url",
    ["http://new.example/v1", "https://user:pw@new.example/v1", "https:///v1"],
)
def test_configure_refuses_anything_but_a_plain_https_gateway(
    client, auth, lemonade, base_url
):
    resp = client.post(
        CONFIGURE,
        json={"base_url": base_url, "auth_header_name": "api-key", "api_key": SECRET},
        headers=auth,
    )
    assert resp.status_code == 422
    assert lemonade == []


def test_configure_waiting_on_another_processs_move_is_a_409(
    client, auth, lemonade, monkeypatch
):
    from gaia.llm import gateway

    with gateway.GATEWAY_KEY_LOCK:
        import threading

        results = []
        other = threading.Thread(
            target=lambda: results.append(
                client.post(
                    CONFIGURE,
                    json={"base_url": NEW_GATEWAY, "auth_header_name": "api-key"},
                    headers=auth,
                )
            )
        )
        other.start()
        other.join(timeout=10)
    assert results[0].status_code == 409
    assert results[0].json()["detail"] == gateway._busy_message()
    assert lemonade == []
