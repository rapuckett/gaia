# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""A paired phone finishes an OAuth PKCE sign-in the PC started for it.

The phone catches the redirect on its own loopback and hands the code back;
the PC keeps the verifier, exchanges the code and saves the connection.
"""

from __future__ import annotations

import asyncio
import logging
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from starlette.testclient import TestClient

from gaia.connectors import flow
from gaia.connectors.errors import UnknownFlowError
from gaia.ui import security
from gaia.ui.security import (
    DEVICE_AUTH_SCOPE_KEY,
    DEVICE_SCOPE_KEY,
    LAN_LISTENER,
    LISTENER_SCOPE_KEY,
    DevicePrincipal,
)

pytestmark = pytest.mark.allow_network  # TestClient and a mocked token endpoint

UI = {"X-Gaia-UI": "1"}
PHONE = DevicePrincipal("phone-1", True)
CALLERS = {
    "phone": PHONE,
    "other_phone": DevicePrincipal("phone-2", True),
    "pending": DevicePrincipal("tablet-1", False),
}
TOKEN_URL = "https://oauth2.googleapis.com/token"
SECRET_REFRESH = "refresh-SECRET-0123456789"
SECRET_ACCESS = "access-SECRET-0123456789"
CODE = "4/0AQSTgQ-auth-code-SECRET-0123456789"
CLIENT_SECRET = "GOCSPX-client-SECRET-0123456789"


def _as_caller(app):
    """One ASGI app, so every caller shares one event loop and one pending flow."""

    async def stamped(scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope["headers"])
            who = headers.get(b"x-test-caller", b"pc").decode()
            if who in CALLERS:
                scope = {
                    **scope,
                    LISTENER_SCOPE_KEY: LAN_LISTENER,
                    DEVICE_AUTH_SCOPE_KEY: True,
                    DEVICE_SCOPE_KEY: CALLERS[who],
                }
        await app(scope, receive, send)

    return stamped


@pytest.fixture
def google_provider(monkeypatch):
    """The shared provider, with a client secret, as a real Google client has."""
    from gaia.connectors.providers import _registry
    from gaia.connectors.providers import get as get_provider

    monkeypatch.setenv("GAIA_GOOGLE_CLIENT_ID", "test.apps.example")
    monkeypatch.setenv("GAIA_GOOGLE_CLIENT_SECRET", CLIENT_SECRET)
    _registry.clear()
    provider = get_provider("google")
    assert provider.client_secret == CLIENT_SECRET
    return provider


@pytest.fixture
def client(google_provider, monkeypatch):
    from gaia.ui.routers import connectors
    from gaia.ui.server import create_app

    browser = []
    monkeypatch.setattr("webbrowser.open", lambda *a, **k: browser.append(a) or True)
    audited = []
    monkeypatch.setattr(
        connectors,
        "audit_approval",
        lambda request, what: audited.append((security.principal(request), what)),
    )
    app = create_app(db_path=":memory:")
    with TestClient(_as_caller(app), client=("127.0.0.1", 50000)) as c:
        c.browser, c.audited = browser, audited
        yield c
        for flow_id in list(flow._pending):
            c.portal.call(flow.cancel_flow, flow_id)


def _post(client, caller, path, body):
    headers = {**UI, "x-test-caller": caller}
    if caller == "tunnel":
        headers["X-Forwarded-For"] = "203.0.113.7"
    return client.post(path, json=body, headers=headers)


def _start_on_phone(client, port=51234):
    resp = _post(
        client, "phone", "/api/connectors/google/authorize", {"redirect_port": port}
    )
    assert resp.status_code == 200, resp.text
    info = resp.json()
    params = parse_qs(urlparse(info["authorization_url"]).query)
    return info["flow_id"], params


def test_a_phone_sign_in_redirects_to_the_phone_and_binds_nothing_on_the_pc(client):
    flow_id, params = _start_on_phone(client, port=51234)

    assert params["redirect_uri"] == ["http://127.0.0.1:51234/callback"]
    pending = flow._pending[flow_id]
    assert pending.runner is None
    assert pending.owner_device_id == PHONE.device_id
    assert pending.redirect_uri == "http://127.0.0.1:51234/callback"
    assert params["state"] == [pending.state]
    assert client.browser == []
    assert client.audited == [
        ("device:phone-1", "sign-in started for google"),
    ]


@pytest.mark.parametrize(
    "caller, body, status",
    [
        ("pc", {"redirect_port": 51234}, 422),
        ("phone", {}, 403),
        ("phone", {"redirect_port": 51234, "grant_agents": ["installed:email"]}, 403),
        ("phone", {"redirect_port": 80}, 422),
        ("pending", {"redirect_port": 51234}, 403),
        ("tunnel", {"redirect_port": 51234}, 403),
    ],
)
def test_who_may_not_start_a_phone_sign_in(client, caller, body, status):
    resp = _post(client, caller, "/api/connectors/google/authorize", body)
    assert resp.status_code == status, resp.text
    assert flow._pending == {}


@pytest.mark.parametrize("caller", ["other_phone", "pc", "pending", "tunnel"])
def test_only_the_phone_that_started_it_may_finish_it(client, caller):
    flow_id, params = _start_on_phone(client)
    resp = _post(
        client,
        caller,
        f"/api/connectors/flows/{flow_id}/complete",
        {"code": CODE, "state": params["state"][0]},
    )
    assert resp.status_code == 403, resp.text
    assert flow_id in flow._pending, "a refused caller must not end the sign-in"


def test_a_wrong_state_ends_the_sign_in(client):
    flow_id, _ = _start_on_phone(client)
    path = f"/api/connectors/flows/{flow_id}/complete"

    resp = _post(client, "phone", path, {"code": CODE, "state": "forged"})
    assert resp.status_code == 400, resp.text
    assert flow_id not in flow._pending

    assert _post(client, "phone", path, {"code": CODE, "state": "x"}).status_code == 404


@respx.mock
def test_the_phone_finishes_with_the_pcs_verifier_and_sees_no_secret(client, caplog):
    from gaia.connectors.store import peek_connection

    token = respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": SECRET_ACCESS,
                "refresh_token": SECRET_REFRESH,
                "expires_in": 3600,
                "scope": "openid",
                # Payload {"email": "alice@example.com", "sub": "alice-sub"}; unsigned.
                "id_token": "h.eyJlbWFpbCI6ICJhbGljZUBleGFtcGxlLmNvbSIsICJzdWIiOiAiYWxpY2Utc3ViIn0.s",
            },
        )
    )
    respx.route(host="testserver").pass_through()
    flow_id, params = _start_on_phone(client, port=51234)
    verifier = flow._pending[flow_id].code_verifier
    path = f"/api/connectors/flows/{flow_id}/complete"

    with caplog.at_level(logging.DEBUG):
        resp = _post(client, "phone", path, {"code": CODE, "state": params["state"][0]})

    assert resp.status_code == 200, resp.text
    summary = resp.json()
    assert summary["id"] == "google" and summary["configured"] is True
    assert summary["account_id"] == "alice@example.com"
    sent = parse_qs(token.calls.last.request.content.decode())
    assert sent["grant_type"] == ["authorization_code"]
    assert sent["code"] == [CODE]
    assert sent["code_verifier"] == [verifier]
    assert sent["redirect_uri"] == ["http://127.0.0.1:51234/callback"]
    assert sent["client_secret"] == [CLIENT_SECRET]
    assert peek_connection("google")["refresh_token"] == SECRET_REFRESH
    for secret in (CODE, verifier, SECRET_ACCESS, SECRET_REFRESH, CLIENT_SECRET):
        assert secret not in resp.text
        assert secret not in caplog.text
    assert client.audited[-1] == ("device:phone-1", "sign-in finished for google")

    assert _post(client, "phone", path, {"code": CODE, "state": "x"}).status_code == 404


async def test_a_phone_sign_in_expires(google_provider, monkeypatch):
    monkeypatch.setattr(flow, "_FLOW_TIMEOUT_SECONDS", 0.05)
    info = await flow.start_authorization(
        "google", scopes=[], redirect_port=51234, owner_device_id="phone-1"
    )
    await asyncio.sleep(0.2)
    with pytest.raises(UnknownFlowError):
        await flow.complete_device_authorization(
            info["flow_id"], device_id="phone-1", code=CODE, state="x"
        )


@pytest.mark.parametrize(
    "caller, status",
    [
        ("other_phone", 403),
        ("tunnel", 403),
        ("pending", 403),
        ("phone", 204),
        ("pc", 204),
    ],
)
def test_only_the_pc_or_the_owner_may_cancel_a_phone_sign_in(client, caller, status):
    flow_id, _ = _start_on_phone(client)
    resp = client.delete(
        f"/api/connectors/_flows/{flow_id}",
        headers={
            **UI,
            "x-test-caller": caller,
            **({"X-Forwarded-For": "203.0.113.7"} if caller == "tunnel" else {}),
        },
    )
    assert resp.status_code == status, resp.text
    assert (flow_id in flow._pending) is (status == 403)


async def test_a_sign_in_replaced_by_someone_else_stops_waiting(
    google_provider, monkeypatch
):
    from gaia.connectors import events

    seen = []

    class _Recorder:
        async def emit(self, event_type, payload):
            seen.append((event_type, payload))

    events.set_emitter(_Recorder())
    try:
        first = await flow.start_authorization(
            "google", scopes=[], redirect_port=51234, owner_device_id="phone-1"
        )
        replaced = flow._pending[first["flow_id"]].future
        again = await flow.start_authorization(
            "google", scopes=[], redirect_port=51235, owner_device_id="phone-1"
        )
        assert seen == [], "the phone that re-clicked Connect is not told it failed"
        other = await flow.start_authorization(
            "google", scopes=[], redirect_port=51236, owner_device_id="phone-2"
        )
        await flow.cancel_flow(other["flow_id"])
    finally:
        events.reset_emitter()

    assert seen == [
        (
            "connector.oauth.error",
            {
                "connector_id": "google",
                "flow_id": again["flow_id"],
                "reason": "superseded",
                "error": "A newer sign-in replaced this one.",
            },
        )
    ]
    assert replaced.done() and replaced.exception() is not None
