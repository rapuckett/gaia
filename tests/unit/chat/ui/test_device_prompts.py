# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""A phone's action that raises an OS prompt on the PC tells that phone how it went.

Nothing here reads a real key store, shows an administrator prompt or changes
GPU settings: the reads and the elevated steps are stubbed.
"""

from __future__ import annotations

import logging
import time
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from gaia.config import GaiaConfig
from gaia.ui.devices import prompts
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.routers import sessions
from gaia.ui.security import DEVICE_PRINCIPAL_PREFIX, ListenerScopeMiddleware
from gaia.ui.server import create_app

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

PC = ("127.0.0.1", 50000)
UI = {"X-Gaia-UI": "1"}
ADMIN_ROUTES = [
    ("/api/gpu-memory/apply", {"setting_gb": 96, "confirm": True}),
    ("/api/gpu-memory/revert", {"confirm": True}),
    ("/api/setup/npu/memlock-fix", None),
]


@pytest.fixture
def paired(tmp_path, monkeypatch):
    GaiaConfig.save_key("device_pairing", True)
    app = create_app(db_path=":memory:")
    access = DeviceAccess(app, folder=tmp_path / "devices")
    app.state.devices = access
    invite, _ = access.pairing.open()
    phone = access.redeem(invite, "Phone", "ios", "192.168.1.20")
    access.allow(phone["device_id"])
    invite, _ = access.pairing.open()
    pending = access.redeem(invite, "Tablet", "ipados", "192.168.1.21")

    class _Running:
        def poll(self):
            return None

    tunnel = app.state.tunnel
    tunnel._url, tunnel._token = "https://fake.ngrok-free.app", str(uuid.uuid4())
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
            listener, client=PC, headers={"Authorization": f"Bearer {phone['token']}"}
        ),
        "pending": TestClient(
            listener,
            client=PC,
            headers={"Authorization": f"Bearer {pending['token']}"},
        ),
    }
    events = []

    async def capture(event):
        events.append(event)

    monkeypatch.setattr(sessions._system_emitter, "emit", capture)
    return app, clients, phone["device_id"], events


def _prompts(events):
    return [
        (e["for_device"], e["kind"], e["action"], e["state"])
        for e in events
        if e["type"] == "device_prompt"
    ]


@pytest.mark.parametrize("closed,outcome", [(False, "approved"), (True, "denied")])
def test_a_phones_retry_hears_waiting_then_how_the_pc_answered(
    paired, monkeypatch, closed, outcome
):
    from gaia.connectors import store
    from gaia.ui.routers import providers

    _, clients, phone, events = paired
    monkeypatch.setattr(prompts, "KEY_STORE_PROMPT_AFTER_SECONDS", 0.01)
    monkeypatch.setattr(providers, "_read_stored_keys", lambda: time.sleep(0.2))
    monkeypatch.setattr(store, "keyring_refusal", lambda: "closed" if closed else None)

    resp = clients["phone"].post("/api/providers/key-store/retry", headers=UI)
    assert resp.status_code == 200 and resp.json() == {"retrying": True}
    assert _prompts(events) == [
        (phone, "keyStore", "keyStoreRetry", "waiting"),
        (phone, "keyStore", "keyStoreRetry", outcome),
    ]

    events.clear()
    pc = clients["pc"].post("/api/providers/key-store/retry", headers=UI)
    assert pc.status_code == 200
    assert _prompts(events) == []


def test_a_phone_may_start_a_key_store_action_once_per_10_seconds(paired, monkeypatch):
    from gaia.ui.routers import providers

    _, clients, _, _ = paired
    monkeypatch.setattr(providers, "_read_stored_keys", lambda: None)
    url = "/api/providers/key-store/retry"
    assert clients["phone"].post(url, headers=UI).status_code == 200
    again = clients["phone"].post(url, headers=UI)
    assert again.status_code == 429 and again.headers["Retry-After"]
    for _ in range(2):
        assert clients["pc"].post(url, headers=UI).status_code == 200


def test_a_phones_gpu_apply_waits_on_the_admin_prompt_and_is_recorded(
    paired, monkeypatch
):
    from gaia.llm import gpu_memory
    from gaia.security import audit_logger

    app, clients, phone, events = paired
    asked = []

    def fake_apply(setting_gb, confirm, before_prompt=None):
        asked.append((setting_gb, confirm))
        before_prompt()
        return {
            "applies": True,
            "show_in_setup": True,
            "hidden_reason": None,
            "os": "linux",
            "method": "apply",
            "method_reason": "",
            "needs_restart": True,
        }

    monkeypatch.setattr(gpu_memory, "apply", fake_apply)
    lines = []

    class _Capture(logging.Handler):
        def emit(self, record):
            lines.append(record.getMessage())

    handler, level = _Capture(), audit_logger.level
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    try:
        resp = clients["phone"].post(
            "/api/gpu-memory/apply",
            json={"setting_gb": 96, "confirm": True},
            headers=UI,
        )
    finally:
        audit_logger.removeHandler(handler)
        audit_logger.setLevel(level)

    assert resp.status_code == 200, resp.text
    assert resp.json()["needs_restart"] is True
    assert asked == [(96, True)]
    assert _prompts(events) == [
        (phone, "admin", "gpuMemoryApply", "waiting"),
        (phone, "admin", "gpuMemoryApply", "approved"),
    ]
    assert [line for line in lines if f"{DEVICE_PRINCIPAL_PREFIX}{phone}" in line]
    changes = clients["pc"].get(f"/api/devices/{phone}/changes").json()["changes"]
    assert [(c["kind"], c["params"]) for c in changes] == [
        ("gpuMemoryChanged", {"action": "gpuMemoryApply"})
    ]


@pytest.mark.parametrize("caller", ["tunnel", "pending"])
@pytest.mark.parametrize("url,body", ADMIN_ROUTES)
def test_the_tunnel_and_a_pending_device_cannot_start_an_admin_step(
    paired, monkeypatch, caller, url, body
):
    from gaia.llm import gpu_memory, npu_linux

    _, clients, _, events = paired
    stubs = {name: MagicMock() for name in ("apply", "revert")}
    for name, stub in stubs.items():
        monkeypatch.setattr(gpu_memory, name, stub)
    fix = MagicMock()
    monkeypatch.setattr(npu_linux, "apply_memlock_fix", fix)

    resp = clients[caller].post(url, json=body, headers=UI)
    assert resp.status_code == 403, resp.text
    assert not fix.called and not any(s.called for s in stubs.values())
    assert _prompts(events) == []
