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


_GPU_STATUS = {
    "applies": True,
    "show_in_setup": True,
    "hidden_reason": None,
    "os": "linux",
    "method": "apply",
    "method_reason": "",
    "needs_restart": True,
}
#: (url, body, action, change kind) for each administrator step.
ADMIN_STEPS = [
    (url, body, action, kind)
    for (url, body), (action, kind) in zip(
        ADMIN_ROUTES,
        [
            ("gpuMemoryApply", "gpuMemoryChanged"),
            ("gpuMemoryRevert", "gpuMemoryChanged"),
            ("npuMemlockFix", "npuMemlockFixed"),
        ],
    )
]


def _stub_admin_steps(monkeypatch, step):
    """Make every elevated step run ``step(before_prompt)``; nothing real runs."""
    from gaia.llm import gpu_memory, npu_linux
    from gaia.ui.routers import setup as setup_router
    from tests.unit.test_npu_linux import _full_plan

    def gpu(*args):
        step(args[-1])
        return _GPU_STATUS

    monkeypatch.setattr(gpu_memory, "apply", gpu)
    monkeypatch.setattr(gpu_memory, "revert", gpu)
    monkeypatch.setattr(npu_linux, "apply_memlock_fix", lambda before: step(before))
    monkeypatch.setattr(setup_router, "build_plan", _full_plan)


@pytest.mark.parametrize("url,body,action,kind", ADMIN_STEPS)
def test_a_phones_admin_step_waits_on_the_pc_and_is_recorded(
    paired, monkeypatch, url, body, action, kind
):
    from gaia.security import audit_logger

    _, clients, phone, events = paired
    _stub_admin_steps(monkeypatch, lambda before: before())
    lines = []

    class _Capture(logging.Handler):
        def emit(self, record):
            lines.append(record.getMessage())

    handler, level = _Capture(), audit_logger.level
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    try:
        resp = clients["phone"].post(url, json=body, headers=UI)
    finally:
        audit_logger.removeHandler(handler)
        audit_logger.setLevel(level)

    assert resp.status_code == 200, resp.text
    assert _prompts(events) == [
        (phone, "admin", action, "waiting"),
        (phone, "admin", action, "approved"),
    ]
    assert [line for line in lines if f"{DEVICE_PRINCIPAL_PREFIX}{phone}" in line]
    changes = clients["pc"].get(f"/api/devices/{phone}/changes").json()["changes"]
    assert [(c["kind"], c["params"]) for c in changes] == [(kind, {"action": action})]
    again = clients["phone"].post(url, json=body, headers=UI)
    assert again.status_code == 429


def _gpu_error(cls, cause=None):
    def fail(before):
        before()
        raise cls("/etc/modprobe.d/ttm.conf: no") from cause

    return fail


def _memlock_error(code):
    def fail(before):
        from gaia.llm import npu_linux

        before()
        raise npu_linux.MemlockFixError(code, "no")

    return fail


@pytest.mark.parametrize(
    "step_url,fail,status,state",
    [
        (0, "denied", 403, "denied"),
        (0, "timeout", 500, "timeout"),
        (1, "failed", 500, "failed"),
        (2, "cancelled", 409, "denied"),
        (2, "timeout", 409, "timeout"),
        (2, "failed", 500, "failed"),
    ],
)
def test_a_phone_hears_how_an_admin_step_ended_and_nothing_is_recorded(
    paired, monkeypatch, step_url, fail, status, state
):
    import subprocess

    from gaia.llm import gpu_memory

    _, clients, phone, events = paired
    url, body, action, _ = ADMIN_STEPS[step_url]
    if step_url == 2:
        step = _memlock_error(fail)
    elif fail == "denied":
        step = _gpu_error(gpu_memory.PermissionNotGiven)
    elif fail == "timeout":
        step = _gpu_error(
            gpu_memory.GpuMemoryError, subprocess.TimeoutExpired("pkexec", 900)
        )
    else:
        step = _gpu_error(gpu_memory.GpuMemoryError)
    _stub_admin_steps(monkeypatch, step)

    resp = clients["phone"].post(url, json=body, headers=UI)
    assert resp.status_code == status, resp.text
    assert "/etc/" not in resp.text
    assert _prompts(events) == [
        (phone, "admin", action, "waiting"),
        (phone, "admin", action, state),
    ]
    assert clients["pc"].get(f"/api/devices/{phone}/changes").json()["total"] == 0


@pytest.mark.parametrize("url,body,action,kind", ADMIN_STEPS)
def test_one_admin_step_of_a_kind_waits_at_a_time(
    paired, monkeypatch, url, body, action, kind
):
    _, clients, _, events = paired
    ran = []
    _stub_admin_steps(monkeypatch, ran.append)
    lock = (
        prompts.NPU_MEMLOCK_ELEVATION if "npu" in url else prompts.GPU_MEMORY_ELEVATION
    )
    with lock:
        for caller in ("pc", "phone"):
            resp = clients[caller].post(url, json=body, headers=UI)
            assert resp.status_code == 409, resp.text
            assert "already waiting on the PC" in resp.json()["detail"]
    assert ran == [] and _prompts(events) == []


def test_a_phone_runs_one_key_store_read_at_a_time(paired, monkeypatch):
    from gaia.ui.routers import providers

    app, clients, phone, _ = paired
    monkeypatch.setattr(providers, "_read_stored_keys", lambda: None)
    app.state.device_reads_running = {(phone, "keyStoreRetry")}
    resp = clients["phone"].post("/api/providers/key-store/retry", headers=UI)
    assert resp.status_code == 409
    app.state.device_reads_running.clear()
    app.state.device_action_times = {}
    resp = clients["phone"].post("/api/providers/key-store/retry", headers=UI)
    assert resp.status_code == 200
    assert app.state.device_reads_running == set()


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
