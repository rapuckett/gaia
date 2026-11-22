# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""What each paired device changed on the PC, and the prompts sent to it."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from gaia.config import GaiaConfig
from gaia.ui.devices import DEVICE_CHANGES_KEPT
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.changes import record_device_change
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.routers.sessions import (
    _system_emitter,
    emit_device_prompt,
    session_events,
)
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
    if caller in ("device", "pending"):
        scope[LISTENER_SCOPE_KEY] = LAN_LISTENER
        scope[DEVICE_SCOPE_KEY] = DevicePrincipal(device_id, caller == "device")
    elif caller == "tunnel":
        scope["headers"] = [(b"x-forwarded-for", b"203.0.113.7")]
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


def test_retention_clock_starts_when_the_device_is_unpaired(paired):
    """Not when the list is next read: nobody reads it for 91 days here."""
    app, clock, clients, phone, tablet = paired
    record_device_change(_as(app, "device", phone), "memoryWiped")
    record_device_change(_as(app, "device", tablet), "memoryWiped")
    app.state.devices.revoke(phone)
    clock.now += 91 * DAY
    assert clients["pc"].get(f"/api/devices/{phone}/changes").json()["total"] == 0
    # The tablet idled past 90 days, so its clock only starts now.
    assert clients["pc"].get(f"/api/devices/{tablet}/changes").json()["total"] == 1


def test_a_secret_never_lands_in_a_change_row(paired):
    app, _, _, phone, _ = paired
    key = "fw_live_secret_value"
    for name in ("key", "apiKey", "TOKEN", "client_secret", "passwordHint", "bearer"):
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
        await emit_device_prompt(tablet, "keyStore", "keyStoreRetry", "waiting")
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
    for nobody in ("", None):
        with pytest.raises(ValueError):
            asyncio.run(emit_device_prompt(nobody, "admin", "x", "waiting"))


@pytest.mark.parametrize("caller", ["tunnel", "pending"])
def test_device_prompt_never_reaches_the_tunnel_or_a_pending_device(paired, caller):
    app, _, _, phone, _ = paired
    pending = "d0pending"

    async def next_event(request):
        stream = (await session_events(request)).body_iterator
        assert (await stream.__anext__()).startswith(":")
        await emit_device_prompt(pending, "admin", "gpuMemoryApply", "waiting")
        await emit_device_prompt(phone, "admin", "gpuMemoryApply", "waiting")
        await _system_emitter.emit({"type": "set_active_session", "session_id": "s"})
        line = await asyncio.wait_for(stream.__anext__(), 2)
        await stream.aclose()
        return json.loads(line.removeprefix("data: "))

    seen = asyncio.run(next_event(_as(app, caller, pending)))
    assert seen["type"] == "set_active_session"


UI = {"X-Gaia-UI": "1"}


def _kinds(clients, device_id):
    page = clients["pc"].get(f"/api/devices/{device_id}/changes").json()
    return [(c["kind"], c["params"]) for c in page["changes"]]


@contextlib.contextmanager
def _audited():
    from gaia.security import audit_logger

    lines = []

    class _Capture(logging.Handler):
        def emit(self, record):
            lines.append(record.getMessage())

    handler, level = _Capture(), audit_logger.level
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    try:
        yield lines
    finally:
        audit_logger.removeHandler(handler)
        audit_logger.setLevel(level)


def test_memory_wipe_is_gated_audited_and_listed(paired, monkeypatch):
    from gaia.ui.routers import memory as memory_router

    _, _, clients, phone, _ = paired
    wiped = []

    class _Store:
        def clear_all(self):
            wiped.append(1)
            return {"knowledge": 1, "tool_history": 0, "conversations": 0}

    monkeypatch.setattr(memory_router, "_get_store", _Store)
    assert clients["tunnel"].delete("/api/memory/all", headers=UI).status_code == 403
    assert wiped == []
    with _audited() as lines:
        assert clients["pc"].delete("/api/memory/all", headers=UI).status_code == 200
        assert clients["phone"].delete("/api/memory/all", headers=UI).status_code == 200
    assert lines == [f"APPROVAL | memory wiped | by device:{phone}"]
    assert _kinds(clients, phone) == [("memoryWiped", {})]


def test_connector_removal_is_gated_audited_and_listed(paired, monkeypatch):
    from unittest.mock import AsyncMock

    import gaia.connectors as connections
    from gaia.connectors import grants, store

    _, _, clients, phone, _ = paired
    monkeypatch.setattr(
        "gaia.ui.routers.connectors.disconnect", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        connections, "revoke_connection_async", AsyncMock(return_value={})
    )
    monkeypatch.setattr(store, "clear_provider_credentials", lambda provider: None)
    monkeypatch.setattr(grants, "revoke_all_grants_for", lambda provider: None)
    routes = ("/api/connectors/google", "/v1/connections/acme")
    for route in routes:
        assert clients["tunnel"].delete(route, headers=UI).status_code == 403
    with _audited() as lines:
        for route in routes:
            assert clients["pc"].delete(route, headers=UI).status_code == 204
            assert clients["phone"].delete(route, headers=UI).status_code == 204
    assert lines == [
        f"APPROVAL | connector google removed | by device:{phone}",
        f"APPROVAL | connector acme removed | by device:{phone}",
    ]
    assert [kind for kind, _ in _kinds(clients, phone)] == ["connectorRemoved"] * 2
    assert {params["connector_id"] for _, params in _kinds(clients, phone)} == {
        "google",
        "acme",
    }


def test_undo_limits_from_a_device_are_audited_listed_and_hide_the_folder(
    paired, monkeypatch
):
    from gaia.agents.base import file_snapshots
    from gaia.home import gaia_home

    _, _, clients, phone, _ = paired
    folder = str(gaia_home() / "snapshots")
    monkeypatch.setattr(
        file_snapshots,
        "usage",
        lambda: {"bytes": 0, "turns": 0, "path": folder},
    )
    monkeypatch.setattr(file_snapshots, "prune", lambda days, size: None)
    body = {"retention_days": 1, "max_mb": 10}
    with _audited() as lines:
        pc = clients["pc"].put("/api/settings/undo", json=body, headers=UI)
        phone_put = clients["phone"].put("/api/settings/undo", json=body, headers=UI)
    assert pc.json()["path"] == folder
    assert clients["pc"].get("/api/settings/undo").json()["path"] == folder
    for resp in (phone_put, clients["phone"].get("/api/settings/undo")):
        assert resp.status_code == 200
        assert resp.json()["path"] == "GAIA's folder/snapshots".replace("/", os.sep)
    assert lines == [
        f"APPROVAL | undo history limits set to 1 days and 10 MB | by device:{phone}"
    ]
    assert _kinds(clients, phone) == [("undoLimitsChanged", {"days": 1, "mb": 10})]


def test_spending_and_chat_mode_changes_from_a_device_are_listed(paired):
    app, _, clients, phone, _ = paired
    session_id = app.state.db.create_session(title="Phone chat")["id"]
    for client in (clients["pc"], clients["phone"]):
        for limit in (5.0, None):
            resp = client.put(
                "/api/spending/limit", json={"limit_usd": limit}, headers=UI
            )
            assert resp.status_code == 200, resp.text
        assert client.post("/api/spending/allow-month", headers=UI).status_code == 200
        for mode in ("full_access", "ask"):
            resp = client.put(
                f"/api/chat/permissions/{session_id}", json={"mode": mode}, headers=UI
            )
            assert resp.status_code == 200, resp.text
    assert _kinds(clients, phone) == [
        ("chatPermissionsAsk", {}),
        ("chatPermissionsFull", {}),
        ("spendingAllowedMonth", {}),
        ("spendingLimitCleared", {}),
        ("spendingLimitSet", {"limit": 5.0}),
    ]


def test_memory_wipe_scrub_failure_hides_the_file_path_from_a_device(
    paired, monkeypatch
):
    from gaia.agents.base.memory_store import MemoryScrubError
    from gaia.ui.routers import memory as memory_router

    _, _, clients, _, _ = paired
    raw = "Memory at /Users/someone/.gaia/memory.db was erased, but locked"

    class _Store:
        def clear_all(self):
            raise MemoryScrubError(raw)

    monkeypatch.setattr(memory_router, "_get_store", _Store)
    on_pc = clients["pc"].delete("/api/memory/all", headers=UI)
    on_phone = clients["phone"].delete("/api/memory/all", headers=UI)
    assert on_pc.status_code == on_phone.status_code == 500
    assert on_pc.json()["detail"] == raw
    assert "memory.db" not in on_phone.json()["detail"]
    assert "erase again" in on_phone.json()["detail"]


def test_index_folder_errors_hide_the_raw_exception_from_a_device(paired, monkeypatch):
    from pathlib import Path
    from unittest.mock import patch

    from gaia.ui import session_environment

    monkeypatch.setattr(session_environment, "relayed", lambda _session: False)

    _, _, clients, _, _ = paired
    folder = Path.home() / "indexed"
    folder.mkdir()
    (folder / "notes.md").write_text("# Notes")
    session = clients["pc"].post("/api/sessions", json={"folders": [str(folder)]})
    session_id = session.json()["id"]

    async def broken(_path, **_kwargs):
        raise RuntimeError(f"cannot read {folder}/notes.md")

    body = {"folder_path": str(folder), "recursive": False}
    with patch("gaia.ui.server._index_document", broken):
        on_pc = clients["pc"].post("/api/documents/index-folder", json=body)
        on_phone = clients["phone"].post(
            f"/api/documents/index-folder?session_id={session_id}", json=body
        )
    assert on_pc.status_code == on_phone.status_code == 200
    assert on_pc.json()["errors"] == [f"notes.md: cannot read {folder}/notes.md"]
    errors = on_phone.json()["errors"]
    assert len(errors) == 1 and errors[0].startswith("notes.md:")
    assert "cannot read" not in errors[0] and str(folder) not in errors[0]


def test_removing_a_chat_folder_is_audited_and_listed_for_a_device_only(
    paired, monkeypatch
):
    from pathlib import Path

    from gaia.ui import session_environment

    monkeypatch.setattr(session_environment, "relayed", lambda _session: False)

    _, _, clients, phone, _ = paired
    folder = Path.home() / "taxes"
    folder.mkdir()
    session_id = (
        clients["pc"]
        .post("/api/sessions", json={"folders": [str(folder)]})
        .json()["id"]
    )
    url = f"/api/sessions/{session_id}/environment/folders/remove"

    with _audited() as lines:
        assert clients["pc"].post(url, json={"path": str(folder)}).status_code == 200
    assert lines == [f"APPROVAL | folder {folder} taken from chat {session_id} | by pc"]
    assert _kinds(clients, phone) == []

    with _audited() as lines:
        assert clients["phone"].post(url, json={"path": str(folder)}).status_code == 200
    assert lines == [
        f"APPROVAL | folder {folder} taken from chat {session_id} | by device:{phone}"
    ]
    assert _kinds(clients, phone) == [("folderRemoved", {"folder": "taxes"})]
