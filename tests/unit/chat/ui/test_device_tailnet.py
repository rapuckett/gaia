# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The Tailscale route: off unless the PC turns it on, and then it admits only
a tailnet peer that reached this PC's own tailnet address."""

from __future__ import annotations

import socket
from collections import namedtuple

import pytest
from fastapi.testclient import TestClient

from gaia.config import GaiaConfig
from gaia.ui.devices import tailnet as tailnet_module
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.security import ListenerScopeMiddleware
from gaia.ui.server import create_app

from .fake_nics import fake_pc

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

OWN = "100.101.102.103"
PORT = 4243
HOME_PEER = ("192.168.1.20", 50000)
TAILNET_PEER = ("100.64.0.7", 50000)
PC = ("127.0.0.1", 50000)
ROUTES = "/api/devices/me/routes"
HOME = {"kind": "home", "origin": f"https://192.168.1.10:{PORT}"}
TAILNET = {"kind": "tailnet", "origin": f"https://{OWN}:{PORT}"}

Addr = namedtuple("Addr", "family address netmask broadcast ptp")
Stat = namedtuple("Stat", "isup")


def _v4(address, ptp=None):
    return Addr(socket.AF_INET, address, "255.255.255.255", None, ptp)


@pytest.mark.parametrize(
    "case, nics, found",
    [
        ("windows adapter", {"Tailscale": (True, [_v4(OWN)])}, OWN),
        ("linux interface", {"tailscale0": (True, [_v4(OWN)])}, OWN),
        ("macos point-to-point utun", {"utun4": (True, [_v4(OWN, ptp=OWN)])}, OWN),
        ("utun that isn't point-to-point", {"utun4": (True, [_v4(OWN)])}, None),
        ("carrier-NAT uplink is not a tailnet", {"en0": (True, [_v4("100.70.0.2")])}, None),
        ("interface down", {"tailscale0": (False, [_v4(OWN)])}, None),
        ("outside 100.64/10", {"tailscale0": (True, [_v4("100.128.0.1")])}, None),
        ("IPv6 only", {"tailscale0": (True, [Addr(socket.AF_INET6, "fd7a:115c:a1e0::1", None, None, None)])}, None),
        ("no Tailscale", {"en0": (True, [_v4("192.168.1.10")])}, None),
    ],
)  # fmt: skip
def test_finds_the_tailnet_address(monkeypatch, case, nics, found):
    import psutil

    monkeypatch.setattr(
        psutil, "net_if_stats", lambda: {n: Stat(up) for n, (up, _) in nics.items()}
    )
    monkeypatch.setattr(
        psutil, "net_if_addrs", lambda: {n: a for n, (_, a) in nics.items()}
    )
    assert tailnet_module.tailnet_ipv4() == found, case


class _Listening:
    port = PORT
    running = True


@pytest.fixture
def setup(tmp_path, monkeypatch):
    GaiaConfig.save_key("device_pairing", True)
    address = {"value": OWN}
    monkeypatch.setattr(tailnet_module, "tailnet_ipv4", lambda: address["value"])
    fake_pc(monkeypatch)
    app = create_app(db_path=":memory:")
    access = DeviceAccess(app, folder=tmp_path / "devices")
    app.state.devices = access
    access._listener = _Listening()
    invite, _ = access.pairing.open()
    device = access.redeem(invite, "Phone", "ios", HOME_PEER[0])
    access.allow(device["device_id"])
    return app, access, device["token"], address


def _device(app, access, peer, local, token=None):
    """The listener as a device at *peer* sees it, reached at *local*."""
    gate = ListenerScopeMiddleware(DeviceGate(app, access, allow_loopback=False))

    async def at_local(scope, receive, send):
        await gate({**scope, "server": (local, PORT)}, receive, send)

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return TestClient(at_local, client=peer, headers=headers)


@pytest.mark.parametrize(
    "case, on, peer, local, token, method, path, status, origins",
    [
        ("on: tailnet peer at the tailnet address", True, TAILNET_PEER, OWN, True, "GET", ROUTES, 200, [HOME, TAILNET]),
        ("on: 100.64 peer at another local address", True, TAILNET_PEER, "192.168.1.10", True, "GET", ROUTES, 403, None),
        ("off refuses 100.64", False, TAILNET_PEER, OWN, True, "GET", ROUTES, 403, None),
        ("on: still needs a token", True, TAILNET_PEER, OWN, False, "GET", ROUTES, 401, None),
        ("on: no pairing over the tailnet", True, TAILNET_PEER, OWN, False, "POST", "/api/devices/pair", 404, None),
        ("off: routes list home only", False, HOME_PEER, "192.168.1.10", True, "GET", ROUTES, 200, [HOME]),
        ("on: routes from home list the tailnet too", True, HOME_PEER, "192.168.1.10", True, "GET", ROUTES, 200, [HOME, TAILNET]),
    ],
)  # fmt: skip
async def test_tailnet_gate(
    setup, case, on, peer, local, token, method, path, status, origins
):
    app, access, device_token, _ = setup
    if on:
        await access.set_route("tailnet", True)
    payload = {"invitation": "x" * 22, "device_name": "Phone", "platform": "ios"}
    client = _device(app, access, peer, local, device_token if token else None)
    resp = client.request(method, path, json=payload if method == "POST" else None)
    assert resp.status_code == status, (case, resp.text)
    if origins is not None:
        assert resp.json() == {"origins": origins}, case


def _route_status(body):
    return next(r for r in body["routes"] if r["kind"] == "tailnet")


def test_switch_from_the_pc(setup):
    app, access, token, address = setup
    pc = TestClient(app, client=PC)
    path = "/api/devices/routes/tailnet"

    assert _route_status(pc.get("/api/devices/status").json())["on"] is False

    address["value"] = None
    resp = pc.post(path)
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "no_tailscale_address"
    off = _route_status(pc.get("/api/devices/status").json())
    assert off == {
        "kind": "tailnet",
        "on": False,
        "origin": None,
        "error_code": "no_tailscale_address",
    }

    address["value"] = OWN
    on = _route_status(pc.post(path).json())
    assert on == {
        "kind": "tailnet",
        "on": True,
        "origin": TAILNET["origin"],
        "error_code": None,
    }

    # Tailscale stops: the route stops carrying devices and says why.
    address["value"] = None
    gone = _route_status(pc.get("/api/devices/status").json())
    assert (gone["on"], gone["error_code"]) == (False, "no_tailscale_address")
    address["value"] = OWN

    # Only the PC may flip it; an allowed device can't, even from home.
    device = _device(app, access, HOME_PEER, "192.168.1.10", token)
    assert device.delete(path).status_code == 403

    assert _route_status(pc.delete(path).json())["on"] is False


def test_switch_needs_the_listener(setup):
    app, access, _, _ = setup
    access._listener = None
    resp = TestClient(app, client=PC).post("/api/devices/routes/tailnet")
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "listener_off"


async def test_switch_is_remembered_across_restarts(setup, tmp_path):
    app, access, _, _ = setup
    access._store = access._open_store()
    await access.set_route("tailnet", True)

    restarted = DeviceAccess(app, folder=tmp_path / "devices")
    await restarted._resume_routes(restarted._open_store())
    assert restarted.routes.get("tailnet").on

    await access.set_route("tailnet", False)
    again = DeviceAccess(app, folder=tmp_path / "devices")
    await again._resume_routes(again._open_store())
    assert not again.routes.get("tailnet").on
