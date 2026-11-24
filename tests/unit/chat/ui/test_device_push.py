# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Push notifications for paired phones, through the relay each phone names.

The relay is faked at the HTTP boundary (``post_to_relay``): every test that
sends checks the request's path, its Bearer send token, its body's fields, and
that the ciphertext opens with the phone's key and AAD to the expected payload.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import socket
import threading
import time
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient

from gaia.config import GaiaConfig
from gaia.ui.devices import push
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.devices.push import (
    PUSH_ALERTS_PER_HOUR,
    PUSH_CIPHERTEXT_MAX,
    PUSH_DELIVERY_FIELD,
    PUSH_PAD_BUCKETS,
    PUSH_SILENT_PER_DAY,
    STREAM_IDLE_SECONDS,
    PushNotifier,
    RelayAnswer,
    collapse_id,
    cut_text,
)
from gaia.ui.devices.store import PushRecord
from gaia.ui.security import ListenerScopeMiddleware
from gaia.ui.server import create_app

pytestmark = pytest.mark.allow_network  # TestClient and a fake relay only

PC = ("127.0.0.1", 50000)
UI = {"X-Gaia-UI": "1"}
PUBLIC = "93.184.215.14"
RELAY = "https://relay.example.com/base"
ROUTE = "/api/devices/me/push"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class FakeRelay:
    """``post_to_relay`` as a list of calls, answering 202 unless told otherwise."""

    def __init__(self):
        self.calls = []
        self.answers = []

    def __call__(self, host, port, address, path, headers, body, *, deadline):
        assert 0 < deadline <= push.PUSH_SEND_SECONDS
        self.calls.append(
            SimpleNamespace(
                host=host,
                port=port,
                address=address,
                path=path,
                headers=headers,
                body=json.loads(body),
                raw=body.decode(),
            )
        )
        return self.answers.pop(0) if self.answers else RelayAnswer(202)


class Clock:
    def __init__(self):
        self.now = 1_800_000_000.0

    def __call__(self):
        return self.now


class WallMs:
    """Unix milliseconds that move 1 ms each read, like a real clock between sends."""

    def __init__(self):
        self.now = 1_800_000_000_000

    def __call__(self):
        self.now += 1
        return self.now


def _resolve_to(monkeypatch, *addresses):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port, proto=0, *a: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (a_, port)) for a_ in addresses
        ],
    )


@pytest.fixture
def phone(tmp_path, monkeypatch):
    """A PC with one allowed phone, one pending tablet, and clients for each caller."""
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "gaia"))
    GaiaConfig.save_key("device_pairing", True)
    _resolve_to(monkeypatch, PUBLIC)
    app = create_app(db_path=":memory:")
    access = DeviceAccess(app, folder=tmp_path / "devices")
    app.state.devices = access
    invite, _ = access.pairing.open()
    allowed = access.redeem(invite, "Phone", "ios", "192.168.1.20")
    access.allow(allowed["device_id"])
    invite, _ = access.pairing.open()
    pending = access.redeem(invite, "Tablet", "ipados", "192.168.1.21")
    listener = ListenerScopeMiddleware(DeviceGate(app, access, allow_loopback=True))

    def device_client(token):
        return TestClient(
            listener, client=PC, headers={"Authorization": f"Bearer {token}", **UI}
        )

    tunnel = app.state.tunnel
    tunnel._url, tunnel._token = "https://fake.ngrok-free.app", "t" * 36
    tunnel._process = SimpleNamespace(poll=lambda: None)
    clients = {
        "device": device_client(allowed["token"]),
        "pending": device_client(pending["token"]),
        "pc": TestClient(app, client=PC, headers=UI),
        "tunnel": TestClient(
            app,
            client=PC,
            headers={
                "X-Forwarded-For": "203.0.113.7",
                "Authorization": f"Bearer {tunnel._token}",
                **UI,
            },
        ),
    }
    yield SimpleNamespace(
        app=app, access=access, clients=clients, device_id=allowed["device_id"]
    )
    push.bind(None)
    app.state.push.close()


def _settings(**overrides):
    body = {
        "relay_url": RELAY,
        "handle": b64(os.urandom(16)),
        "send_token": b64(os.urandom(32)),
        "key": b64(os.urandom(32)),
        "platform": "apns",
    }
    body.update(overrides)
    return body


# ── The routes ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("caller", ["pc", "tunnel", "pending"])
def test_only_an_allowed_device_reaches_its_push_record(phone, caller):
    client = phone.clients[caller]
    for method in ("PUT", "GET", "DELETE"):
        resp = client.request(method, ROUTE, json=_settings())
        assert resp.status_code in (401, 403), (caller, method, resp.status_code)
    assert phone.access.push_record(phone.device_id) is None


def test_a_device_turns_push_on_reads_it_and_turns_it_off(phone):
    body = _settings()
    client = phone.clients["device"]
    resp = client.put(ROUTE, json=body)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"enabled": True, "relay_host": "relay.example.com"}
    read = client.get(ROUTE)
    assert read.json() == {"enabled": True, "relay_host": "relay.example.com"}
    for secret in (body["send_token"], body["key"], body["handle"]):
        assert secret not in resp.text and secret not in read.text
    stored = phone.access.push_record(phone.device_id)
    assert (stored.handle, stored.send_token, stored.key) == (
        body["handle"],
        body["send_token"],
        body["key"],
    )
    for secret in (stored.send_token, stored.key, stored.handle):
        assert secret not in repr(stored)
    assert client.delete(ROUTE).json() == {"enabled": False, "relay_host": None}
    assert phone.access.push_record(phone.device_id) is None


@pytest.mark.parametrize(
    "relay_url, resolves_to",
    [
        ("http://relay.example.com", PUBLIC),
        ("https://localhost", PUBLIC),
        ("https://10.0.0.5", PUBLIC),
        ("https://[::1]", PUBLIC),
        ("https://user:pw@relay.example.com", PUBLIC),
        ("https://relay.example.com?x=1", PUBLIC),
        ("https://relay.example.com", "127.0.0.1"),
        ("https://relay.example.com", "192.168.1.9"),
        ("https://relay.example.com", "100.64.0.9"),
        ("https://relay.example.com", "169.254.1.1"),
        ("https://relay.example.com", "224.0.0.1"),
        ("https://relay.example.com", "0.0.0.0"),
        ("https://relay.example.com", "fd00::1"),
        ("https://relay.example.com", "fe80::1"),
        ("https://relay.example.com", "::ffff:10.0.0.1"),
        ("https://relay.example.com", "64:ff9b::7f00:1"),
        ("https://relay.example.com", "::127.0.0.1"),
        ("https://relay.example.com/caf\u00e9", PUBLIC),
        ("https://relay.example.com/a b", PUBLIC),
        ("https://relay.example.com/%zz", PUBLIC),
        ("https://relay.example.com/\x07", PUBLIC),
    ],
)
def test_a_relay_that_isnt_public_https_is_refused(
    phone, monkeypatch, relay_url, resolves_to
):
    _resolve_to(monkeypatch, PUBLIC, resolves_to)
    body = _settings(relay_url=relay_url)
    resp = phone.clients["device"].put(ROUTE, json=body)
    assert resp.status_code == 422, (relay_url, resolves_to, resp.text)
    assert body["send_token"] not in resp.text and body["key"] not in resp.text
    assert phone.access.push_record(phone.device_id) is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"key": b64(os.urandom(31))},
        {"key": b64(os.urandom(33))},
        {"handle": b64(os.urandom(15))},
        {"send_token": "not base64url!"},
        {"platform": "sms"},
        {"extra": "field"},
        {"key": None},
        {"key": b64(os.urandom(32)) + "="},
        {"handle": b64(os.urandom(16))[:-1] + "!"},
        {"send_token": "A" * 42 + "\n"},
        {"send_token": "A" * 44},
    ],
)
def test_bad_push_settings_are_refused_without_echoing_them(phone, overrides):
    body = _settings(**overrides)
    if body.get("key") is None:
        del body["key"]
    resp = phone.clients["device"].put(ROUTE, json=body)
    assert resp.status_code == 422, resp.text
    assert body["send_token"] not in resp.text
    assert phone.access.push_record(phone.device_id) is None


def test_unpairing_or_resetting_deletes_the_push_record(phone):
    client = phone.clients["device"]
    assert client.put(ROUTE, json=_settings()).status_code == 200
    assert client.delete("/api/devices/me").status_code == 204
    assert phone.access.push_record(phone.device_id) is None
    assert phone.access.push_targets() == []


def test_the_pc_removing_a_device_deletes_its_push_record(phone):
    phone.access.set_push(_record(phone.device_id))
    assert (
        phone.clients["pc"].delete(f"/api/devices/{phone.device_id}").status_code == 200
    )
    assert phone.access.push_record(phone.device_id) is None


# ── Sending ───────────────────────────────────────────────────────────────


def _record(device_id, key=None, handle=None):
    return PushRecord(
        device_id=device_id,
        relay_url=RELAY,
        handle=handle or b64(os.urandom(16)),
        send_token=b64(os.urandom(32)),
        key=b64(key or os.urandom(32)),
        platform="apns",
    )


@pytest.fixture
def sender(phone, monkeypatch):
    """A notifier that handles events at once, with a fake relay and clock."""
    record = _record(phone.device_id)
    phone.access.set_push(record)
    relay, clock, wall_ms = FakeRelay(), Clock(), WallMs()
    notifier = PushNotifier(phone.app, transport=relay, clock=clock, wall_ms=wall_ms)
    monkeypatch.setattr(notifier, "_put", notifier.handle)
    monkeypatch.setattr(notifier, "_submit", lambda _d, _h, send: send() or True)
    push.bind(notifier)
    db = phone.app.state.db
    session = db.create_session(title="Quarterly report")
    return SimpleNamespace(
        notifier=notifier,
        relay=relay,
        clock=clock,
        wall_ms=wall_ms,
        seqs=[],
        record=record,
        key=unb64(record.key),
        db=db,
        session_id=session["id"],
        phone=phone,
    )


def _opened(sender, call):
    """The plaintext *call* carried, checked against the relay contract."""
    assert call.host == "relay.example.com" and call.port == 443
    assert call.address == PUBLIC
    assert call.path == f"/base/v1/handles/{sender.record.handle}/send"
    assert call.headers["Authorization"] == f"Bearer {sender.record.send_token}"
    assert set(call.body) == {PUSH_DELIVERY_FIELD, "ciphertext", "nonce", "collapse_id"}
    nonce = unb64(call.body["nonce"])
    assert len(nonce) == 12
    assert len(call.body["ciphertext"]) <= PUSH_CIPHERTEXT_MAX
    aad = sender.record.handle.encode() + b"\x01"
    plain = AESGCM(sender.key).decrypt(nonce, unb64(call.body["ciphertext"]), aad)
    assert len(plain) in PUSH_PAD_BUCKETS, len(plain)
    payload = json.loads(plain)
    assert plain == _compact(payload).ljust(len(plain), b" ")
    seq, ts = payload.pop("seq"), payload.pop("ts")
    assert isinstance(seq, int) and seq > max(sender.seqs, default=0)
    assert 1_700_000_000_000 < ts <= sender.wall_ms.now and seq >= ts
    sender.seqs.append(seq)
    return payload


def _compact(payload):
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()


def _collapse(key, subject):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    derived = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=b"", info=b"gaia-push-collapse-v1"
    ).derive(key)
    assert derived != key
    return b64(hmac.new(derived, subject.encode(), hashlib.sha256).digest()[:16])


def test_an_approval_push_is_encrypted_to_the_phone(sender):
    sender.notifier.approval(
        sender.session_id, "conf-1", "approval", label="writing file"
    )
    (call,) = sender.relay.calls
    assert call.body[PUSH_DELIVERY_FIELD] == "alert"
    assert call.body["collapse_id"] == _collapse(sender.key, "a:conf-1")
    assert _opened(sender, call) == {
        "v": 1,
        "kind": "approval",
        "params": {
            "ask": "approval",
            "label": "writing file",
            "chat_title": "Quarterly report",
        },
        "route": f"/chat/{sender.session_id}",
        "session_id": sender.session_id,
        "approval_id": "conf-1",
        "badge": 0,
    }
    # The relay sees no kind, id, title or count.
    for clear in ("approval", "conf-1", sender.session_id, "Quarterly", "badge"):
        assert clear not in call.raw


def test_a_question_carries_its_own_words(sender):
    push.observe_run_frame(
        sender.session_id,
        'data: {"type": "user_input_request", "request_id": "q-1", '
        '"message": "Which folder?"}\n\n',
    )
    payload = _opened(sender, sender.relay.calls[0])
    assert payload["params"]["ask"] == "question"
    assert payload["params"]["summary"] == "Which folder?"
    assert sender.relay.calls[0].body["collapse_id"] == _collapse(sender.key, "a:q-1")


def test_a_permission_frame_from_a_run_notifies(sender):
    push.observe_run_frame(
        sender.session_id,
        'data: {"type": "permission_request", "tool": "write_file", '
        '"tool_label": "writing file", "confirm_id": "c-9"}\n\n',
    )
    payload = _opened(sender, sender.relay.calls[0])
    assert (payload["kind"], payload["approval_id"]) == ("approval", "c-9")
    push.observe_run_frame(
        sender.session_id, 'data: {"type": "chunk", "content": "x"}\n\n'
    )
    assert len(sender.relay.calls) == 1


@pytest.mark.parametrize("status, kind", [("done", "finished"), ("failed", "failed")])
def test_a_run_end_notifies_with_the_chats_collapse_id(sender, status, kind):
    from gaia.ui._chat_helpers import _record_run_outcome

    _record_run_outcome(sender.db, sender.session_id, status)
    (call,) = sender.relay.calls
    payload = _opened(sender, call)
    assert payload["kind"] == kind
    assert payload["badge"] == 1
    assert call.body["collapse_id"] == _collapse(sender.key, f"s:{sender.session_id}")


@pytest.mark.parametrize(
    "status, outcome", [("stopped", "stopped"), ("cancelled", "ended"), ("", "ended")]
)
def test_a_run_that_did_not_finish_sends_finished_with_its_outcome(
    sender, status, outcome
):
    sender.notifier.run_ended(sender.session_id, status)
    (call,) = sender.relay.calls
    assert call.body[PUSH_DELIVERY_FIELD] == "alert"
    assert call.body["collapse_id"] == _collapse(sender.key, f"s:{sender.session_id}")
    payload = _opened(sender, call)
    assert payload["kind"] == "finished"
    assert payload["params"] == {"outcome": outcome, "chat_title": "Quarterly report"}


def test_a_stopped_run_is_not_sent_while_the_phone_watches(sender):
    sender.notifier.stream_opened(sender.phone.device_id)
    sender.notifier.run_ended(sender.session_id, "stopped")
    assert not sender.relay.calls


def test_done_and_failed_carry_no_outcome(sender):
    sender.notifier.run_ended(sender.session_id, "done")
    assert "outcome" not in _opened(sender, sender.relay.calls[0])["params"]


def test_an_approval_carries_the_seconds_left_to_answer(sender):
    sender.notifier.approval(sender.session_id, "c-1", "approval", ttl_s=300)
    assert _opened(sender, sender.relay.calls[0])["params"]["ttl_s"] == 300


def test_the_ttl_counts_down_until_the_push_is_sent(sender):
    push.observe_run_frame(
        sender.session_id,
        'data: {"type": "permission_request", "confirm_id": "c-2", '
        f'"expires_at": {time.time() + 120}}}\n\n',
    )
    ttl = _opened(sender, sender.relay.calls[0])["params"]["ttl_s"]
    assert 118 <= ttl <= 120


def test_a_question_takes_its_ttl_from_its_timeout(sender):
    push.observe_run_frame(
        sender.session_id,
        'data: {"type": "user_input_request", "request_id": "q-3", '
        '"message": "Which?", "timeout_seconds": 45}\n\n',
    )
    assert _opened(sender, sender.relay.calls[0])["params"]["ttl_s"] == 45


def test_a_prompt_that_waits_forever_has_no_ttl(sender):
    push.observe_run_frame(
        sender.session_id,
        'data: {"type": "permission_request", "confirm_id": "c-4"}\n\n',
    )
    assert "ttl_s" not in _opened(sender, sender.relay.calls[0])["params"]


def test_a_prompt_already_expired_is_not_pushed(sender):
    sender.notifier.approval(sender.session_id, "c-5", "approval", ttl_s=0)
    assert not sender.relay.calls


def test_an_answered_approval_clears_the_phone_that_was_sent_it(sender):
    sender.notifier.approval(sender.session_id, "c-6", "approval", ttl_s=60)
    sender.notifier.approval_resolved("c-6")
    alert, silent = sender.relay.calls
    assert silent.body[PUSH_DELIVERY_FIELD] == "silent"
    assert silent.body["collapse_id"] == _collapse(sender.key, "b")
    _opened(sender, alert)
    payload = _opened(sender, silent)
    assert payload["kind"] == "badge"
    assert payload["params"] == {"resolved": ["c-6"]}
    sender.notifier.approval_resolved("c-6")
    assert len(sender.relay.calls) == 2, "one clearing push per approval"


def test_an_approval_nobody_was_sent_clears_nothing(sender):
    sender.notifier.approval_resolved("never-sent")
    assert not sender.relay.calls


def test_a_clearing_push_skips_a_watching_phone(sender):
    sender.notifier.stream_opened(sender.phone.device_id)
    sender.notifier.approval(sender.session_id, "c-7", "approval")
    sender.notifier.approval_resolved("c-7")
    assert not sender.relay.calls


def test_answering_and_expiring_a_prompt_both_clear_the_phone(sender):
    from gaia.ui.sse_handler import SSEOutputHandler

    handler = SSEOutputHandler()
    handler.confirm_timeout_seconds = 10
    for confirm_id in ("c-8", "c-9"):
        sender.notifier.approval(sender.session_id, confirm_id, "approval")
    handler._confirm_id = "c-8"
    handler._confirm_event = threading.Event()
    assert handler.resolve_tool_confirmation(True, confirm_id="c-8")
    handler.set_relay_confirmation("c-9")
    handler.active_relay_run_id = "run"
    handler.active_relay_proxy = SimpleNamespace(tool_decision=lambda *a: None)
    handler._expire_relay_confirmation("c-9")
    handler.set_relay_confirmation(None)
    cleared = [_opened(sender, c)["params"]["resolved"] for c in sender.relay.calls[2:]]
    assert cleared == [["c-8"], ["c-9"]]


@pytest.mark.parametrize("reason", ["model_server", "key_store", "setup"])
def test_needs_you_at_most_once_an_hour_per_reason(sender, reason):
    sender.notifier.needs_you(reason)
    sender.notifier.needs_you(reason)
    assert len(sender.relay.calls) == 1
    payload = _opened(sender, sender.relay.calls[0])
    assert (payload["kind"], payload["route"]) == ("needs_you", "/")
    assert sender.relay.calls[0].body["collapse_id"] == _collapse(
        sender.key, f"n:{reason}"
    )
    sender.clock.now += 3601
    sender.notifier.needs_you(reason)
    assert len(sender.relay.calls) == 2


def test_a_locked_key_store_notifies(sender):
    from gaia.connectors import store

    store._refuse(RuntimeError("closed"))
    store.retry_keyring()
    assert _opened(sender, sender.relay.calls[0])["kind"] == "needs_you"


def test_one_push_per_kind_and_id(sender):
    for _ in range(2):
        sender.notifier.approval(sender.session_id, "conf-1", "approval")
        sender.notifier.run_ended(sender.session_id, "done")
    assert len(sender.relay.calls) == 2
    sender.notifier.run_ended(sender.session_id, "failed")
    assert len(sender.relay.calls) == 3
    sender.notifier.session_read(sender.session_id)
    sender.notifier.run_ended(sender.session_id, "done")
    assert len(sender.relay.calls) == 4


def test_no_push_while_the_phone_watches(sender):
    sender.notifier.stream_opened(sender.phone.device_id)
    sender.notifier.approval(sender.session_id, "conf-1", "approval")
    sender.notifier.run_ended(sender.session_id, "done")
    assert not sender.relay.calls
    sender.notifier.stream_closed(sender.phone.device_id)
    sender.notifier.approval(sender.session_id, "conf-2", "approval")
    assert len(sender.relay.calls) == 1


def test_the_event_stream_marks_the_phone_as_watching(sender):
    notifier = sender.notifier
    assert not notifier.watching(sender.phone.device_id)
    push.stream_opened(sender.phone.device_id)
    assert notifier.watching(sender.phone.device_id)
    push.stream_closed(sender.phone.device_id)
    assert not notifier.watching(sender.phone.device_id)


def test_a_stream_that_went_quiet_stops_suppressing_pushes(sender):
    phone = sender.phone.device_id
    sender.notifier.stream_opened(phone)
    sender.clock.now += STREAM_IDLE_SECONDS + 1
    assert not sender.notifier.watching(phone)
    sender.notifier.approval(sender.session_id, "conf-1", "approval")
    assert len(sender.relay.calls) == 1

    sender.notifier.stream_wrote(phone)
    assert sender.notifier.watching(phone)
    sender.notifier.approval(sender.session_id, "conf-2", "approval")
    assert len(sender.relay.calls) == 1


def test_at_most_thirty_alerts_an_hour(sender, caplog):
    for i in range(PUSH_ALERTS_PER_HOUR + 5):
        sender.notifier.approval(sender.session_id, f"c-{i}", "approval")
    assert len(sender.relay.calls) == PUSH_ALERTS_PER_HOUR
    assert "in the last hour" in caplog.text
    sender.clock.now += 3600
    sender.notifier.approval(sender.session_id, "later", "approval")
    assert len(sender.relay.calls) == PUSH_ALERTS_PER_HOUR + 1


def test_only_allowed_devices_with_push_on_are_sent_to(sender):
    phone = sender.phone
    invite, _ = phone.access.pairing.open()
    pending = phone.access.redeem(invite, "Other", "android", "192.168.1.30")
    phone.access.set_push(_record(pending["device_id"]))
    sender.notifier.approval(sender.session_id, "conf-1", "approval")
    assert len(sender.relay.calls) == 1


# ── Relay answers ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("status", [401, 410])
def test_a_refused_handle_turns_push_off(sender, status):
    sender.relay.answers.append(RelayAnswer(status))
    sender.notifier.approval(sender.session_id, "conf-1", "approval")
    assert sender.phone.access.push_record(sender.phone.device_id) is None
    sender.notifier.approval(sender.session_id, "conf-2", "approval")
    assert len(sender.relay.calls) == 1


def test_a_rate_limit_holds_pushes_until_retry_after(sender, caplog):
    sender.relay.answers.append(RelayAnswer(429, "120"))
    sender.notifier.approval(sender.session_id, "c-1", "approval")
    sender.notifier.approval(sender.session_id, "c-2", "approval")
    assert len(sender.relay.calls) == 1
    assert "asked GAIA to wait" in caplog.text
    sender.clock.now += 121
    sender.notifier.approval(sender.session_id, "c-3", "approval")
    assert len(sender.relay.calls) == 2


@pytest.mark.parametrize("status", [400, 413])
def test_a_malformed_push_is_logged_as_a_bug(sender, caplog, status):
    sender.relay.answers.append(RelayAnswer(status))
    with caplog.at_level(logging.ERROR):
        sender.notifier.approval(sender.session_id, "c-1", "approval")
    error = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert error and "approval" in error[0].getMessage()
    assert "ciphertext" in error[0].getMessage()
    assert sender.phone.access.push_record(sender.phone.device_id) is not None


def test_an_upstream_failure_drops_the_push_without_retry(sender, caplog):
    sender.relay.answers.append(RelayAnswer(502))
    sender.notifier.approval(sender.session_id, "c-1", "approval")
    assert len(sender.relay.calls) == 1
    assert "HTTP 502" in caplog.text
    assert sender.phone.access.push_record(sender.phone.device_id) is not None


def test_a_relay_rebound_to_a_private_address_is_not_dialed(
    sender, monkeypatch, caplog
):
    _resolve_to(monkeypatch, "10.0.0.7")
    sender.notifier.approval(sender.session_id, "c-1", "approval")
    assert not sender.relay.calls
    assert "public addresses only" in caplog.text


def test_nothing_secret_reaches_the_logs(sender, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    for answer in (
        RelayAnswer(502),
        RelayAnswer(400),
        RelayAnswer(429),
        RelayAnswer(410),
    ):
        sender.relay.answers.append(answer)
        sender.notifier.needs_you("setup")
        sender.clock.now += 3601 * 2

    def broken(*_a, **_k):
        raise OSError(f"boom {sender.record.send_token}")

    sender.phone.access.set_push(sender.record)
    sender.notifier._transport = broken
    sender.notifier.approval(sender.session_id, "c-x", "approval")
    assert "OSError" in caplog.text
    for secret in (
        sender.record.send_token,
        sender.record.key,
        sender.record.handle,
        "/base/v1",
        "Quarterly",
    ):
        assert secret not in caplog.text


# ── The badge ─────────────────────────────────────────────────────────────


def test_a_badge_change_goes_silent_and_at_most_once_a_minute(sender):
    sender.db.finish_session_run(sender.session_id, "done")
    for kind in ("eval", "scheduled"):
        automated = sender.db.create_session(title=kind, kind=kind)["id"]
        sender.db.finish_session_run(automated, "done")
    sender.notifier.badge_changed()
    sender.notifier._send_due_badges()
    (call,) = sender.relay.calls
    assert call.body[PUSH_DELIVERY_FIELD] == "silent"
    assert call.body["collapse_id"] == _collapse(sender.key, "b")
    assert _opened(sender, call) == {"v": 1, "kind": "badge", "badge": 1}

    other = sender.db.create_session(title="Second")["id"]
    sender.db.finish_session_run(other, "failed")
    sender.notifier.badge_changed()
    sender.notifier._send_due_badges()
    assert len(sender.relay.calls) == 1, "a second update inside a minute waits"
    sender.db.mark_session_read(other)
    sender.db.mark_session_read(sender.session_id)
    sender.notifier.badge_changed()
    sender.clock.now += 60
    sender.notifier._send_due_badges()
    assert len(sender.relay.calls) == 2
    assert _opened(sender, sender.relay.calls[1])["badge"] == 0, "only the latest count"


def test_badge_updates_skip_a_watching_phone_and_dont_count_as_alerts(sender):
    sender.notifier.stream_opened(sender.phone.device_id)
    sender.db.finish_session_run(sender.session_id, "done")
    sender.notifier.badge_changed()
    sender.clock.now += 61
    sender.notifier._send_due_badges()
    assert not sender.relay.calls
    sender.notifier.stream_closed(sender.phone.device_id)
    sender.notifier.badge_changed()
    sender.notifier._send_due_badges()
    assert len(sender.relay.calls) == 1
    assert not sender.notifier._device(sender.phone.device_id).alerts


def test_at_most_250_silent_pushes_a_day(sender, caplog):
    sender.clock.now = 86400.0 * 20000
    for i in range(PUSH_SILENT_PER_DAY + 3):
        if i % 2:
            sender.db.mark_session_read(sender.session_id)
        else:
            sender.db.finish_session_run(sender.session_id, "done")
        sender.notifier.badge_changed()
        sender.notifier._send_due_badges()
        sender.clock.now += 61
    assert len(sender.relay.calls) == PUSH_SILENT_PER_DAY
    assert "silent pushes today" in caplog.text


def test_collapse_ids_are_stable_per_key_and_differ_across_keys():
    one, two = os.urandom(32), os.urandom(32)
    assert collapse_id(one, "s:abc") == collapse_id(one, "s:abc")
    assert collapse_id(one, "s:abc") != collapse_id(two, "s:abc")
    assert collapse_id(one, "s:abc") != collapse_id(one, "s:abd")
    assert len(collapse_id(one, "b")) == 22


# ── Size ──────────────────────────────────────────────────────────────────


def test_a_very_long_chat_title_is_cut_to_fit(sender):
    title = ("Révisé ") * 600 + "é" * 400 + "👩‍👩‍👧" * 200
    sender.db.update_session(sender.session_id, title=title)
    sender.notifier.approval(
        sender.session_id, "c-1", "question", summary="Which folder? " * 300
    )
    (call,) = sender.relay.calls
    assert len(call.body["ciphertext"]) <= PUSH_CIPHERTEXT_MAX
    payload = _opened(sender, call)
    cut = payload["params"]["chat_title"]
    assert cut.endswith("…") and title.startswith(cut[:-1])


@pytest.mark.parametrize(
    "text, limit, expected",
    [
        ("abcdef", 3, "abc…"),
        ("abéf", 3, "ab…"),
        ("ab👍🏽c", 3, "ab…"),
        ("ab👩‍👧c", 4, "ab…"),
        ("ab\ud83dx", 3, "ab…"),
        ("short", 10, "short"),
    ],
)
def test_text_is_cut_at_a_character_boundary(text, limit, expected):
    assert cut_text(text, limit) == expected


# ── Padding and replay ────────────────────────────────────────────────────


def test_payloads_are_padded_to_a_bucket():
    for size in (10, 300, 700, 1500):
        payload = {"v": 1, "kind": "approval", "params": {"chat_title": "x" * size}}
        padded = push.fit_payload(payload)
        assert len(padded) in PUSH_PAD_BUCKETS
        assert len(padded) == min(b for b in PUSH_PAD_BUCKETS if b >= size + 50)
        assert json.loads(padded)["params"]["chat_title"] == "x" * size


def test_titles_of_different_lengths_in_one_bucket_encrypt_to_one_length(sender):
    lengths = set()
    for i, title in enumerate(("Q" * 100, "Quarterly report " * 12)):
        sender.db.update_session(sender.session_id, title=title)
        sender.notifier.approval(sender.session_id, f"c-{i}", "approval")
        lengths.add(len(sender.relay.calls[-1].body["ciphertext"]))
    assert lengths == {len(b64(b"x" * (512 + 16)))}


def test_an_oversized_summary_is_dropped_before_the_title_is_cut(sender):
    sender.notifier.approval(
        sender.session_id, "c-1", "question", summary="Which folder? " * 300
    )
    payload = _opened(sender, sender.relay.calls[0])
    assert "summary" not in payload["params"]
    assert payload["params"]["chat_title"] == "Quarterly report"
    assert payload["params"]["ask"] == "question"


def test_seq_rises_on_every_send_badge_included(sender):
    sender.notifier.approval(sender.session_id, "c-1", "approval")
    sender.db.finish_session_run(sender.session_id, "done")
    sender.notifier.badge_changed()
    sender.notifier._send_due_badges()
    sender.notifier.needs_you("setup")
    for call in sender.relay.calls:
        _opened(sender, call)
    assert len(sender.seqs) == 3 and sender.seqs == sorted(set(sender.seqs))


def test_seq_is_strictly_increasing_across_concurrent_sends(phone):
    import threading

    phone.access.set_push(_record(phone.device_id))
    seen, now_ms = [], 1_800_000_000_000
    lock = threading.Lock()

    def send():
        for _ in range(50):
            seq = phone.access.next_push_seq(phone.device_id, now_ms)
            with lock:
                seen.append(seq)

    threads = [threading.Thread(target=send) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(set(seen)) == 400
    assert sorted(seen) == list(range(now_ms, now_ms + 400))


def test_seq_survives_a_restart_and_a_restored_table(phone):
    from gaia.ui.devices.storage import TABLE_NAME
    from gaia.ui.devices.store import DeviceStore

    record = _record(phone.device_id)
    phone.access.set_push(record)
    first = phone.access.next_push_seq(phone.device_id, 1_000)
    second = phone.access.next_push_seq(phone.device_id, 1_000)
    assert second == first + 1
    phone.access._store.close()
    phone.access._store = None
    reopened = DeviceStore(phone.access.folder / TABLE_NAME)
    try:
        assert reopened.next_push_seq(phone.device_id, 1_000) == second + 1
        # A restore from an older backup: the stored counter goes back to zero.
        with reopened._conn:
            reopened._conn.execute("UPDATE device_push SET seq = 0")
        assert reopened.next_push_seq(phone.device_id, 2_000) > second + 1
    finally:
        reopened.close()


def test_a_new_key_resets_seq_and_the_same_key_keeps_it(phone):
    record = _record(phone.device_id)
    phone.access.set_push(record)
    for _ in range(3):
        phone.access.next_push_seq(phone.device_id, 0)
    phone.access.set_push(record)
    assert phone.access.next_push_seq(phone.device_id, 0) == 4
    phone.access.set_push(_record(phone.device_id))
    assert phone.access.next_push_seq(phone.device_id, 0) == 1


# ── Security review follow-ups ────────────────────────────────────────────


def test_the_aes_gcm_test_vector():
    """The vector the phone must match: AAD is the handle's text, then 0x01."""
    key = bytes(range(32))
    handle = b64(bytes(range(16)))
    assert handle == "AAECAwQFBgcICQoLDA0ODw"
    assert push.associated_data(handle).hex() == (
        "41414543417751464267634943516f4c4441304f447701"
    )
    ciphertext, nonce = push.encrypt(
        key, handle, b'{"v":1,"kind":"badge","badge":3}', bytes(range(12))
    )
    assert nonce == "AAECAwQFBgcICQoL"
    assert ciphertext == (
        "PCCgOf_U7jnmKPnvk9NaD-Ky4FHSV30eWQOC4D9TM89HHC7356eSJUqWpl1JJjID"
    )
    assert collapse_id(key, "b") == "ig1dJZsrLW0ooa4Pj6MLoQ" == _collapse(key, "b")


def test_an_approval_names_its_tool(sender):
    push.observe_run_frame(
        sender.session_id,
        'data: {"type": "permission_request", "tool": "write_file", '
        '"tool_label": "writing file", "confirm_id": "c-1"}\n\n',
    )
    params = _opened(sender, sender.relay.calls[0])["params"]
    assert (params["tool"], params["label"]) == ("write_file", "writing file")


def _second_device(phone, relay_url):
    invite, _ = phone.access.pairing.open()
    other = phone.access.redeem(invite, "Other", "android", "192.168.1.31")
    phone.access.allow(other["device_id"])
    record = PushRecord(
        device_id=other["device_id"],
        relay_url=relay_url,
        handle=b64(os.urandom(16)),
        send_token=b64(os.urandom(32)),
        key=b64(os.urandom(32)),
        platform="fcm",
    )
    phone.access.set_push(record)
    return record


def test_one_broken_device_does_not_stop_the_others(sender, caplog):
    # Stored before the PUT check refused such paths.
    broken = _second_device(sender.phone, "https://bad.example.com/caf\u00e9")
    sender.notifier.approval(sender.session_id, "c-1", "approval")
    assert [c.host for c in sender.relay.calls] == ["relay.example.com"]
    assert "bad.example.com" in caplog.text
    for secret in (broken.send_token, broken.key, broken.handle, "caf"):
        assert secret not in caplog.text
    sender.db.finish_session_run(sender.session_id, "done")
    sender.notifier.badge_changed()
    sender.notifier._send_due_badges()
    assert [c.host for c in sender.relay.calls][-1] == "relay.example.com"


def test_get_reports_an_old_records_host_without_checking_it(phone):
    phone.access.set_push(
        PushRecord(
            device_id=phone.device_id,
            relay_url="https://old.example.com/caf\u00e9",
            handle=b64(os.urandom(16)),
            send_token=b64(os.urandom(32)),
            key=b64(os.urandom(32)),
            platform="apns",
        )
    )
    resp = phone.clients["device"].get(ROUTE)
    assert resp.status_code == 200
    assert resp.json() == {"enabled": True, "relay_host": "old.example.com"}


def test_a_slow_relay_does_not_hold_up_other_devices(phone, monkeypatch):
    import threading

    phone.access.set_push(_record(phone.device_id))
    slow = _second_device(phone, "https://slow.example.com")
    release, fast_sent = threading.Event(), threading.Event()
    hosts = []

    def transport(host, port, address, path, headers, body, *, deadline):
        hosts.append(host)
        if host == "slow.example.com":
            release.wait(timeout=deadline)
            raise TimeoutError("trickled past its deadline")
        fast_sent.set()
        return RelayAnswer(202)

    notifier = PushNotifier(phone.app, transport=transport)
    try:
        for i in range(push.PUSH_SENDERS * 2):
            notifier.approval("s", f"c-{i}", "approval")
        assert fast_sent.wait(timeout=5), hosts
        assert slow.device_id != phone.device_id
    finally:
        release.set()
        notifier.close()


def test_a_trickling_relay_is_cut_at_the_total_deadline():
    import threading
    import time

    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    stop = threading.Event()

    def trickle():
        conn, _ = server.accept()
        with conn:
            while not stop.is_set():
                try:
                    conn.send(b"\x16")
                except OSError:
                    return
                stop.wait(0.4)

    thread = threading.Thread(target=trickle, daemon=True)
    thread.start()
    started = time.monotonic()
    try:
        with pytest.raises(TimeoutError):
            push.post_to_relay(
                "relay.example.com",
                server.getsockname()[1],
                "127.0.0.1",
                "/v1/handles/x/send",
                {},
                b"{}",
                deadline=1.0,
            )
        assert time.monotonic() - started < 3
    finally:
        stop.set()
        server.close()


def test_a_slow_lookup_is_given_up_on():
    import threading
    import time

    hold = threading.Event()
    started = time.monotonic()
    with pytest.raises(TimeoutError):
        push.resolve_within(
            lambda h, p: hold.wait(5) or [PUBLIC], "x.example", 443, 0.2
        )
    assert time.monotonic() - started < 1
    hold.set()


def test_deleted_push_keys_are_overwritten_on_disk(phone):
    store = phone.access._store
    assert store._conn.execute("PRAGMA secure_delete").fetchone()[0] == 1


@pytest.mark.parametrize(
    "address, public",
    [
        ("93.184.215.14", True),
        ("::ffff:93.184.215.14", True),
        ("64:ff9b::5db8:d70e", True),
        ("::ffff:127.0.0.1", False),
        ("64:ff9b::a00:1", False),
        ("64:ff9b::c0a8:101", False),
        ("::10.0.0.1", False),
        ("::1", False),
        ("::", False),
        ("2606:4700::1111", True),
    ],
)
def test_ipv4_inside_ipv6_is_held_to_the_public_rule(address, public):
    from gaia.ui.public_address import is_public_address

    assert is_public_address(address) is public


@pytest.mark.parametrize(
    "base_url",
    [
        "https://[64:ff9b::a00:1]",
        "https://[::ffff:127.0.0.1]",
        "https://[::10.0.0.1]",
    ],
)
def test_the_gateway_refuses_ipv4_inside_ipv6_literals(base_url):
    from fastapi import HTTPException

    from gaia.ui.routers import providers

    with pytest.raises(HTTPException) as e:
        providers._device_gateway_host(base_url)
    assert e.value.status_code == 422


def test_the_gateway_refuses_a_name_resolving_to_nat64_loopback(monkeypatch):
    from gaia.ui.public_address import public_addresses

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **k: [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("64:ff9b::7f00:1", 443, 0, 0))
        ],
    )
    with pytest.raises(ValueError):
        public_addresses("gateway.example.com", 443)


def test_a_run_cancelled_on_a_pending_prompt_clears_the_phone(sender):
    from gaia.ui.sse_handler import SSEOutputHandler

    handler = SSEOutputHandler()
    handler._emit = lambda event: push.observe_run_frame(
        sender.session_id, "data: " + json.dumps(event) + "\n\n"
    )
    handler.cancelled.set()
    assert handler.confirm_tool_execution("write_file", {}, timeout=10) is False
    alert, silent = sender.relay.calls
    approval_id = _opened(sender, alert)["approval_id"]
    payload = _opened(sender, silent)
    assert silent.body[PUSH_DELIVERY_FIELD] == "silent"
    assert payload["params"] == {"resolved": [approval_id]}


def test_a_cancelled_relayed_prompt_clears_the_phone(sender):
    from gaia.ui.sse_handler import SSEOutputHandler

    handler = SSEOutputHandler()
    sender.notifier.approval(sender.session_id, "c-11", "approval")
    handler.set_relay_confirmation("c-11")
    handler.set_relay_confirmation(None)
    assert _opened(sender, sender.relay.calls[0])["approval_id"] == "c-11"
    assert _opened(sender, sender.relay.calls[1])["params"] == {"resolved": ["c-11"]}
    assert len(sender.relay.calls) == 2
