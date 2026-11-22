# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""A paired phone's connector list answers while the PC's key store won't be read.

Nothing here reads a real key store: each OAuth connector's read is stubbed.
"""

from __future__ import annotations

import threading
import time
from typing import get_args

import pytest
from fastapi.testclient import TestClient

from gaia.config import GaiaConfig
from gaia.connectors import credential_wait
from gaia.connectors.registry import REGISTRY
from gaia.connectors.store import KeyringRefused
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.key_store import KEY_STORE_LOCKED, KEY_STORE_WAITING, KeyStoreState
from gaia.ui.routers import connectors as router
from gaia.ui.security import ListenerScopeMiddleware
from gaia.ui.server import create_app

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

PC = ("127.0.0.1", 50000)
OAUTH = sorted(s.id for s in REGISTRY.all() if s.type == "oauth_pkce")
CONNECTED = {
    "configured": True,
    "account_id": "someone@example.com",
    "scopes": ["mail.read"],
    "configurable": True,
    "config_error": None,
    "oauth_client": {"source": "env", "client_id": "client", "has_secret": True},
}


@pytest.fixture
def clients(tmp_path):
    GaiaConfig.save_key("device_pairing", True)
    app = create_app(db_path=":memory:")
    access = DeviceAccess(app, folder=tmp_path / "devices")
    app.state.devices = access
    invite, _ = access.pairing.open()
    phone = access.redeem(invite, "Phone", "ios", "192.168.1.20")
    access.allow(phone["device_id"])
    listener = ListenerScopeMiddleware(DeviceGate(app, access, allow_loopback=True))
    return {
        "pc": TestClient(app, client=PC),
        "phone": TestClient(
            listener, client=PC, headers={"Authorization": f"Bearer {phone['token']}"}
        ),
    }


@pytest.fixture
def reads(monkeypatch):
    """Which providers were read; ``blocks`` holds a read until released."""
    seen: list = []
    release = threading.Event()
    behavior: dict = {}

    def read(provider_ref):
        seen.append(provider_ref)
        how = behavior.get(provider_ref, behavior.get("*"))
        if how == "block":
            release.wait(30)
        elif how == "refuse":
            raise KeyringRefused("The OS credential store is locked.")
        return dict(CONNECTED)

    monkeypatch.setattr(router, "_oauth_state", read)
    monkeypatch.setattr(credential_wait, "WAIT_SECONDS", 0.3)
    yield seen, behavior
    release.set()
    for spec in REGISTRY.all():
        credential_wait.discard(f"connector:{spec.oauth_provider_ref or spec.id}")


def _rows(resp):
    assert resp.status_code == 200
    return {c["id"]: c for c in resp.json()["connectors"]}


def _non_oauth(rows):
    return [r for cid, r in rows.items() if cid not in OAUTH]


def test_oauth_connectors_exist_to_test():
    assert len(OAUTH) >= 2


def test_every_secret_read_lists_no_key_store(clients, reads):
    resp = clients["phone"].get("/api/connectors")
    rows = _rows(resp)
    assert "key_store" not in resp.json()
    assert all("key_store" not in r for r in rows.values())
    assert all(rows[cid]["configured"] is True for cid in OAUTH)


@pytest.mark.parametrize("how", ["refused_now", "held"])
def test_a_refused_read_lists_that_connector_as_locked(
    clients, reads, monkeypatch, how
):
    from gaia.connectors import store

    _, behavior = reads
    locked = OAUTH[0]
    if how == "refused_now":
        behavior[locked] = "refuse"
    else:
        monkeypatch.setattr(store, "keyring_refusal", lambda: "closed")

    resp = clients["phone"].get("/api/connectors")
    rows = _rows(resp)
    assert resp.json()["key_store"] == "locked"
    assert rows[locked]["key_store"] == "locked"
    assert rows[locked]["configured"] is None
    assert rows[locked]["account_id"] is None
    if how == "refused_now":
        for cid in OAUTH[1:]:
            assert "key_store" not in rows[cid]
            assert rows[cid]["configured"] is True
    else:
        assert all(rows[cid]["key_store"] == "locked" for cid in OAUTH)
    others = _non_oauth(rows)
    assert others and all("key_store" not in r and "error" not in r for r in others)


def test_a_read_still_blocked_lists_waiting_and_opens_no_second_prompt(clients, reads):
    seen, behavior = reads
    behavior["*"] = "block"

    resp = clients["phone"].get("/api/connectors")
    rows = _rows(resp)
    assert resp.json()["key_store"] == "waiting"
    assert all(rows[cid]["key_store"] == "waiting" for cid in OAUTH)
    assert all(rows[cid]["configured"] is None for cid in OAUTH)
    assert len(seen) == 1
    assert all("key_store" not in r for r in _non_oauth(rows))


def test_the_list_answers_within_the_bound_while_a_read_blocks(clients, reads):
    _, behavior = reads
    behavior["*"] = "block"

    started = time.monotonic()
    resp = clients["phone"].get("/api/connectors")
    elapsed = time.monotonic() - started
    assert resp.status_code == 200
    assert elapsed < credential_wait.WAIT_SECONDS + 2.0


def test_one_connector_off_the_pc_carries_its_key_store_state(clients, reads):
    _, behavior = reads
    behavior["*"] = "block"
    resp = clients["phone"].get(f"/api/connectors/{OAUTH[0]}")
    assert resp.status_code == 200
    assert resp.json()["key_store"] == "waiting"
    assert resp.json()["configured"] is None


def test_the_pc_lists_a_held_back_connector_instead_of_waiting(clients, reads):
    _, behavior = reads
    behavior[OAUTH[0]] = "refuse"
    resp = clients["pc"].get("/api/connectors")
    rows = _rows(resp)
    assert resp.json()["key_store"] == "locked"
    assert rows[OAUTH[0]]["key_store"] == "locked"
    assert rows[OAUTH[0]]["configured"] is None


def test_key_store_state_literal_matches_constants():
    assert get_args(KeyStoreState) == (KEY_STORE_WAITING, KEY_STORE_LOCKED)
    assert router.KEY_STORE_WAITING is KEY_STORE_WAITING
