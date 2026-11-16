# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The origins a paired device learns, and what an away route may and may not do.

An away route only carries a device to the listener: the device still needs
its token, stays ``device:<id>``, and can never pair from away.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from gaia.config import GaiaConfig
from gaia.ui import security
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.devices.routes import AwayRoute
from gaia.ui.security import ListenerScopeMiddleware
from gaia.ui.server import create_app

from .fake_nics import HOME_ADDRESS, fake_pc

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

HOME_PEER = ("192.168.1.20", 50000)
TAILNET_PEER = ("100.64.0.7", 50000)
TAILNET_ORIGIN = "https://100.100.1.2:4243"


class FakeTailnet(AwayRoute):
    kind = "tailnet"

    def __init__(self) -> None:
        self._on = False

    @property
    def on(self) -> bool:
        return self._on

    def origins(self):
        return [TAILNET_ORIGIN]

    def admits(self, scope) -> bool:
        return scope["client"][0].startswith("100.")

    async def start(self) -> None:
        self._on = True

    async def stop(self) -> None:
        self._on = False


class _Listening:
    port = 4243
    running = True


@pytest.fixture
def setup(tmp_path, monkeypatch):
    GaiaConfig.save_key("device_pairing", True)
    app = create_app(db_path=":memory:")
    access = DeviceAccess(app, folder=tmp_path / "devices")
    app.state.devices = access
    # The handlers' view of a running listener, without binding a socket.
    access._listener = _Listening()
    fake_pc(monkeypatch)
    invite, _ = access.pairing.open()
    allowed = access.redeem(invite, "Phone", "ios", HOME_PEER[0])
    access.allow(allowed["device_id"])
    invite, _ = access.pairing.open()
    pending = access.redeem(invite, "Tablet", "ipados", HOME_PEER[0])
    tailnet = FakeTailnet()
    access.routes.register(tailnet)
    return app, access, tailnet, allowed, pending


def _client(app, access, peer, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    gate = ListenerScopeMiddleware(DeviceGate(app, access, allow_loopback=False))
    return TestClient(
        gate, client=peer, headers=headers, base_url=f"https://{HOME_ADDRESS}:4243"
    )


HOME_ONLY = [{"kind": "home", "origin": "https://192.168.1.10:4243"}]


ROUTES = "/api/devices/me/routes"
#: A request the gate lets through reaches a probe that records who it is from.
PROBE = "/api/sessions"


@pytest.mark.parametrize(
    "case, peer, who, tailnet_on, method, path, status, body",
    [
        ("routes, allowed", HOME_PEER, "allowed", False, "GET", ROUTES, 200, {"origins": HOME_ONLY}),
        ("routes list an away route that is on", HOME_PEER, "allowed", True, "GET", ROUTES, 200, {"origins": HOME_ONLY + [{"kind": "tailnet", "origin": TAILNET_ORIGIN}]}),
        ("routes, pending", HOME_PEER, "pending", False, "GET", ROUTES, 403, None),
        ("routes, no token", HOME_PEER, None, False, "GET", ROUTES, 401, None),
        ("away route off refuses its peer", TAILNET_PEER, "allowed", False, "GET", ROUTES, 403, None),
        ("away route on admits its peer", TAILNET_PEER, "allowed", True, "GET", ROUTES, 200, None),
        ("away route still needs a token", TAILNET_PEER, None, True, "GET", ROUTES, 401, None),
        ("no pairing from away", TAILNET_PEER, None, True, "POST", "/api/devices/pair", 404, None),
        ("pairing at home still served", HOME_PEER, None, False, "POST", "/api/devices/pair", 403, None),
        ("home peer is the device", HOME_PEER, "allowed", True, "GET", PROBE, 204, {"route": "home"}),
        ("away peer is still the device", TAILNET_PEER, "allowed", True, "GET", PROBE, 204, {"route": "tailnet"}),
    ],
)  # fmt: skip
def test_device_routes(setup, case, peer, who, tailnet_on, method, path, status, body):
    app, access, tailnet, allowed, pending = setup
    tailnet._on = tailnet_on
    token = {"allowed": allowed, "pending": pending}[who]["token"] if who else None
    seen = {}

    async def probe(scope, receive, send):
        seen["principal"] = security.principal(Request(scope))
        seen["route"] = scope[security.ROUTE_SCOPE_KEY]
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    payload = {"invitation": "x" * 22, "device_name": "Phone", "platform": "ios"}
    resp = _client(probe if path == PROBE else app, access, peer, token).request(
        method, path, json=payload if method == "POST" else None
    )
    assert resp.status_code == status, (case, resp.text)
    if path == PROBE:
        assert seen == {**body, "principal": f"device:{allowed['device_id']}"}, case
        return
    if status == 200:
        assert resp.headers["cache-control"] == "no-store", case
    if body is not None:
        assert resp.json() == body, case
