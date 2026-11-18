# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""What each paired device changed on the PC, and the prompts sent to it."""

from __future__ import annotations

import asyncio
import json
import uuid

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from gaia.config import GaiaConfig
from gaia.ui.devices import DEVICE_CHANGES_KEPT
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.changes import record_device_change
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.routers.sessions import emit_device_prompt, session_events
from gaia.ui.security import (
    DEVICE_SCOPE_KEY,
    LAN_LISTENER,
    LISTENER_SCOPE_KEY,
    DevicePrincipal,
    ListenerScopeMiddleware,
)
from gaia.ui.server import create_app

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

PC = ("127.0.0.1", 50000)
DAY = 86400


class _Clock:
    def __init__(self) -> None:
        self.now = 1_800_000_000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def paired(tmp_path):
    GaiaConfig.save_key("device_pairing", True)
    app = create_app(db_path=":memory:")
    clock = _Clock()
    access = DeviceAccess(app, folder=tmp_path / "devices", clock=clock)
    app.state.devices = access
    tokens = {}
    for name in ("Phone", "Tablet"):
        invite, _ = access.pairing.open()
        device = access.redeem(invite, name, "ios", "192.168.1.20")
        access.allow(device["device_id"])
        tokens[name] = (device["device_id"], device["token"])

    tunnel = app.state.tunnel
    tunnel._url, tunnel._token = "https://fake.ngrok-free.app", str(uuid.uuid4())

    class _Running:
        def poll(self):
            return None

    tunnel._process = _Running()
    listener = ListenerScopeMiddleware(DeviceGate(app, access, allow_loopback=True))
    clients = {
        "pc": TestClient(app, client=PC),
        "tunnel": TestClient(
            app,
            client=PC,
            headers={
                "X-Forwarded-For": "203.0.113.7",
                "Authorization": f"Bearer {tunnel._token}",
            },
        ),
        "phone": TestClient(
            listener,
            client=PC,
            headers={"Authorization": f"Bearer {tokens['Phone'][1]}"},
        ),
    }
    return app, clock, clients, tokens["Phone"][0], tokens["Tablet"][0]


def _as(app, caller, device_id=None):
    """A request from *caller*: the PC, or the allowed device *device_id*."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
        "client": PC,
        "app": app,
    }
    if caller == "device":
        scope[LISTENER_SCOPE_KEY] = LAN_LISTENER
        scope[DEVICE_SCOPE_KEY] = DevicePrincipal(device_id, True)
    return Request(scope)


def test_device_reads_only_its_own_changes_and_tunnel_is_refused(paired):
    app, _, clients, phone, tablet = paired
    record_device_change(_as(app, "device", phone), "providerKeySet", provider="X")
    record_device_change(_as(app, "device", tablet), "connectorSetup", connector="Y")
    record_device_change(_as(app, "pc"), "providerKeySet", provider="Z")

    own = clients["phone"].get(f"/api/devices/{phone}/changes")
    assert own.status_code == 200
    assert own.json()["total"] == 1
    assert own.json()["changes"][0]["kind"] == "providerKeySet"
    assert own.json()["changes"][0]["params"] == {"provider": "X"}

    assert clients["phone"].get(f"/api/devices/{tablet}/changes").status_code == 403
    assert clients["tunnel"].get(f"/api/devices/{phone}/changes").status_code == 403

    pc = clients["pc"].get(f"/api/devices/{tablet}/changes").json()
    assert [c["kind"] for c in pc["changes"]] == ["connectorSetup"]
    counts = {
        d["id"]: d["changes_count"]
        for d in clients["pc"].get("/api/devices").json()["devices"]
    }
    assert counts == {phone: 1, tablet: 1}


def test_cap_and_retention_after_removal(paired):
    app, clock, clients, phone, _ = paired
    for i in range(DEVICE_CHANGES_KEPT + 5):
        record_device_change(_as(app, "device", phone), "skillAdded", name=f"s{i}")

    page = clients["pc"].get(f"/api/devices/{phone}/changes?limit=200").json()
    assert page["total"] == DEVICE_CHANGES_KEPT
    assert page["changes"][0]["params"]["name"] == f"s{DEVICE_CHANGES_KEPT + 4}"
    assert page["changes"][-1]["params"]["name"] == "s5"
    assert (
        clients["pc"].get(f"/api/devices/{phone}/changes?limit=201").status_code == 422
    )

    removed = clients["pc"].delete(f"/api/devices/{phone}")
    assert removed.json() == {"changes_count": DEVICE_CHANGES_KEPT}

    clock.now += 89 * DAY
    kept = clients["pc"].get(f"/api/devices/{phone}/changes").json()
    assert kept["total"] == DEVICE_CHANGES_KEPT
    clock.now += 2 * DAY
    assert clients["pc"].get(f"/api/devices/{phone}/changes").json()["total"] == 0


def test_a_secret_never_lands_in_a_change_row(paired):
    app, _, _, phone, _ = paired
    key = "fw_live_secret_value"
    for name in ("key", "api_key", "token"):
        with pytest.raises(ValueError, match="never a key"):
            record_device_change(
                _as(app, "device", phone), "providerKeySet", **{name: key}
            )
    with pytest.raises(ValueError):
        record_device_change(_as(app, "device", phone), "x", nested={"key": key})
    rows = app.state.db._conn.execute("SELECT * FROM device_changes").fetchall()
    assert rows == []


def test_device_prompt_reaches_only_its_own_device(paired):
    app, _, _, phone, tablet = paired

    async def first_event(request):
        stream = (await session_events(request)).body_iterator
        assert (await stream.__anext__()).startswith(":")
        await emit_device_prompt(tablet, "key_store", "providerKeyStore", "waiting")
        await emit_device_prompt(phone, "admin", "gpuMemoryApply", "waiting")
        line = await asyncio.wait_for(stream.__anext__(), 2)
        await stream.aclose()
        return json.loads(line.removeprefix("data: "))

    seen = asyncio.run(first_event(_as(app, "device", phone)))
    assert seen == {
        "type": "device_prompt",
        "device_id": phone,
        "kind": "admin",
        "action": "gpuMemoryApply",
        "state": "waiting",
    }
    assert asyncio.run(first_event(_as(app, "pc")))["device_id"] == tablet
    with pytest.raises(ValueError):
        asyncio.run(emit_device_prompt(phone, "admin", "x", "maybe"))
