# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Notifications for paired phones, sent through the push relay each one names.

The PC holds no APNs or FCM key. A phone that turns push on gives the PC its
relay's https address, a handle on that relay, a send-only token for it and a
32-byte AES-256-GCM key. The PC encrypts each event with that key and posts
only the ciphertext: the relay learns that something happened on a handle,
never what, in which chat, or the badge count. The token only sends; the PC
never rotates or deletes the handle, which is the phone's to do.

Sending never blocks a turn. Events go on a bounded queue that one worker
thread drains; a full queue, a refused send and a relay failure are logged and
that push is dropped. Nothing is retried.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import http.client
import json
import os
import queue
import re
import socket
import ssl
import threading
import time
import unicodedata
from collections import OrderedDict, deque
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from typing import Any, Callable, Deque, Dict, List, Optional, Sequence, Tuple
from urllib.parse import quote, urlsplit

from gaia.logger import get_logger

from ..database import AUTOMATED_SESSION_KINDS
from ..public_address import public_addresses, public_https_host
from .store import Device, PushRecord

logger = get_logger(__name__)

#: The relay send body's field that picks a visible alert or a silent update.
PUSH_DELIVERY_FIELD = "delivery"
DELIVERY_ALERT = "alert"
DELIVERY_SILENT = "silent"

PUSH_VERSION = 1
PUSH_PLATFORMS = ("apns", "fcm")
PUSH_HANDLE_BYTES = 16
PUSH_SEND_TOKEN_BYTES = 32
PUSH_KEY_BYTES = 32
PUSH_NONCE_BYTES = 12
PUSH_RELAY_URL_MAX = 2048
#: The relay refuses a longer ciphertext (base64url characters).
PUSH_CIPHERTEXT_MAX = 3000
#: Plaintext is padded with spaces to one of these, so its length says little.
PUSH_PAD_BUCKETS = (256, 512, 1024, 2048)
PUSH_TIMEOUT_SECONDS = 5.0
#: Everything one send may take: the lookup, connect, TLS, write and status.
PUSH_SEND_SECONDS = 10.0
#: Sends at once, so one slow relay can't hold up the others.
PUSH_SENDERS = 4
#: Sends waiting for a sender before new ones are dropped.
PUSH_SENDS_WAITING = 64
PUSH_QUEUE_MAX = 256
PUSH_ALERTS_PER_HOUR = 30
PUSH_SILENT_PER_DAY = 250
PUSH_BADGE_SECONDS = 60.0
PUSH_NEEDS_YOU_SECONDS = 3600.0
#: How long a 429 without a usable Retry-After holds a device's pushes.
PUSH_DEFAULT_RETRY_AFTER = 60.0

KIND_APPROVAL = "approval"
KIND_FINISHED = "finished"
KIND_FAILED = "failed"
KIND_NEEDS_YOU = "needs_you"
KIND_BADGE = "badge"
PUSH_KINDS = (KIND_APPROVAL, KIND_FINISHED, KIND_FAILED, KIND_NEEDS_YOU, KIND_BADGE)

ASK_APPROVAL = "approval"
ASK_QUESTION = "question"

NEEDS_YOU_MODEL_SERVER = "model_server"
NEEDS_YOU_KEY_STORE = "key_store"
NEEDS_YOU_SETUP = "setup"
NEEDS_YOU_REASONS = (NEEDS_YOU_MODEL_SERVER, NEEDS_YOU_KEY_STORE, NEEDS_YOU_SETUP)

ROUTE_HOME = "/"
_ROUTE_RE = re.compile(r"\A(?:/|/chat/[A-Za-z0-9_-]{1,128})\Z")
#: The path a relay URL may carry: printable ASCII, already percent-encoded.
_RELAY_PATH_RE = re.compile(r"(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/]|%[0-9A-Fa-f]{2})*")
PUSH_COLLAPSE_INFO = b"gaia-push-collapse-v1"
#: Dedupe keys kept per device; an approval id is never reused, so old ones age out.
_SENT_KEPT = 512


class PushRefused(ValueError):
    """A device's push settings can't be used; the message says why, without them."""


# ── Encodings and crypto ──────────────────────────────────────────────────


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def decode_b64url(text: str, size: int, what: str) -> bytes:
    """*text* as exactly *size* bytes of unpadded canonical base64url, or
    :class:`PushRefused`. Checked by pattern first: the decoder skips stray
    characters."""
    length = -(-size * 4 // 3)
    if not isinstance(text, str) or not re.fullmatch(
        rf"[A-Za-z0-9_-]{{{length}}}", text
    ):
        raise PushRefused(f"{what} must be {size} bytes, unpadded base64url")
    try:
        raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError) as e:
        raise PushRefused(f"{what} must be {size} bytes, unpadded base64url") from e
    if len(raw) != size or b64url(raw) != text:
        raise PushRefused(f"{what} must be {size} bytes, unpadded base64url")
    return raw


def collapse_key(key: bytes) -> bytes:
    """The collapse-id HMAC key, derived so the AES key is used for nothing else."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=PUSH_COLLAPSE_INFO
    ).derive(key)


def collapse_id(key: bytes, subject: str) -> str:
    """The relay's opaque collapse id: HMAC-SHA256(collapse_key(key), subject),
    first 16 bytes."""
    digest = hmac.new(collapse_key(key), subject.encode("utf-8"), hashlib.sha256)
    return b64url(digest.digest()[:16])


def associated_data(handle: str) -> bytes:
    """AAD: the handle's text, then the payload version as one byte."""
    return handle.encode("ascii") + bytes([PUSH_VERSION])


def encrypt(
    key: bytes, handle: str, plaintext: bytes, nonce: Optional[bytes] = None
) -> Tuple[str, str]:
    """``(ciphertext, nonce)``, both base64url, under a fresh random nonce.

    *nonce* is for the published test vector only; a send never passes one.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = os.urandom(PUSH_NONCE_BYTES) if nonce is None else nonce
    sealed = AESGCM(key).encrypt(nonce, plaintext, associated_data(handle))
    return b64url(sealed), b64url(nonce)


def _encode(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )


def _joins_previous(ch: str) -> bool:
    """Whether *ch* belongs to the character before it (a mark, joiner or selector)."""
    code = ord(ch)
    return (
        unicodedata.combining(ch) != 0
        or unicodedata.category(ch) in ("Mn", "Mc", "Me")
        or code in (0x200C, 0x200D)
        or 0xFE00 <= code <= 0xFE0F
        or 0xE0100 <= code <= 0xE01EF
        or 0x1F3FB <= code <= 0x1F3FF
    )


def cut_text(text: str, limit: int) -> str:
    """*text* to at most *limit* characters plus an ellipsis, never splitting a
    surrogate pair, a combining mark from its base, or a joined sequence."""
    if len(text) <= limit:
        return text
    end = max(0, limit)
    while end > 0 and (
        _joins_previous(text[end])
        or text[end - 1] in ("‍",)
        or 0xD800 <= ord(text[end - 1]) <= 0xDBFF
    ):
        end -= 1
    return text[:end].rstrip() + "…"


def fit_payload(payload: Dict[str, Any]) -> bytes:
    """*payload* as compact UTF-8 JSON, right-padded with spaces to a bucket.

    Over the largest bucket, ``summary`` goes, then ``chat_title`` and
    ``label`` are cut.

    Raises:
        PushRefused: it can't fit even with them cut away (a GAIA bug).
    """
    params = payload.get("params") or {}
    largest = PUSH_PAD_BUCKETS[-1]
    encoded = _encode(payload)
    if len(encoded) > largest:
        params.pop("summary", None)
        encoded = _encode(payload)
    for name in ("chat_title", "label"):
        while len(encoded) > largest and params.get(name):
            text = params[name]
            cut = cut_text(text, len(text) - max(8, len(text) // 4))
            if len(cut) <= 1:
                del params[name]
            else:
                params[name] = cut
            encoded = _encode(payload)
    if len(encoded) > largest:
        raise PushRefused(
            f"a {payload.get('kind')} push is {len(encoded)} bytes with no text "
            "left to cut"
        )
    bucket = next(size for size in PUSH_PAD_BUCKETS if size >= len(encoded))
    return encoded + b" " * (bucket - len(encoded))


# ── The relay ─────────────────────────────────────────────────────────────


def relay_parts(relay_url: str) -> Tuple[str, int, str]:
    """``(host, port, path prefix)`` of a relay URL, checked from its text alone.

    Raises:
        PushRefused: not a public https address, or it carries credentials, a
            query or a fragment.
    """
    if (
        not isinstance(relay_url, str)
        or len(relay_url) > PUSH_RELAY_URL_MAX
        or not relay_url.isascii()
        or not relay_url.isprintable()
        or " " in relay_url
    ):
        raise PushRefused("relay_url must be a printable-ASCII https:// address")
    try:
        host, port = public_https_host(relay_url)
        parts = urlsplit(relay_url)
    except ValueError as e:
        raise PushRefused(f"relay_url is refused: {e}") from e
    if parts.username or parts.password or parts.query or parts.fragment:
        raise PushRefused("relay_url must be a plain https:// address")
    if not _RELAY_PATH_RE.fullmatch(parts.path):
        raise PushRefused("relay_url's path must be percent-encoded")
    return host, port, parts.path.rstrip("/")


def stored_relay_host(relay_url: str) -> Optional[str]:
    """The host of a relay URL already stored, read without checking it again."""
    try:
        return urlsplit(relay_url).hostname
    except ValueError:
        return None


@dataclass(frozen=True)
class RelayAnswer:
    status: int
    retry_after: Optional[str] = None


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPS to *host*, dialing an address already checked to be public."""

    def __init__(self, host: str, port: int, address: str, timeout: float) -> None:
        super().__init__(
            host, port, timeout=timeout, context=ssl.create_default_context()
        )
        self._address = address

    def connect(self) -> None:
        raw = socket.create_connection((self._address, self.port), self.timeout)
        # Held before the handshake, so the deadline can cut a slow one too.
        self.sock = self._context.wrap_socket(
            raw, server_hostname=self.host, do_handshake_on_connect=False
        )
        self.sock.do_handshake()


def _cut(conn: http.client.HTTPConnection) -> None:
    sock = conn.sock
    if sock is None:
        return
    try:
        # The plain socket's shutdown: it wakes a read blocked in another thread.
        socket.socket.shutdown(sock, socket.SHUT_RDWR)
    except OSError as e:
        logger.debug("Push connection already closed at its deadline (%s)", e)


def post_to_relay(
    host: str,
    port: int,
    address: str,
    path: str,
    headers: Dict[str, str],
    body: bytes,
    *,
    deadline: float = PUSH_SEND_SECONDS,
) -> RelayAnswer:
    """POST *body* to *address* as *host* within *deadline* seconds in all;
    only the status is read, nothing followed.

    Raises:
        TimeoutError: the whole exchange took longer than *deadline*.
        OSError: no connection, or TLS failed.
        http.client.HTTPException: the relay's answer was not HTTP.
    """
    conn = _PinnedHTTPSConnection(
        host, port, address, min(PUSH_TIMEOUT_SECONDS, deadline)
    )
    expired = threading.Event()

    def expire() -> None:
        expired.set()
        _cut(conn)

    timer = threading.Timer(deadline, expire)
    timer.daemon = True
    timer.start()
    try:
        conn.request("POST", path, body=body, headers=headers)
        response = conn.getresponse()
        return RelayAnswer(response.status, response.getheader("Retry-After"))
    except (OSError, http.client.HTTPException) as e:
        if expired.is_set():
            raise TimeoutError(f"the relay took longer than {deadline:g} s") from e
        raise
    finally:
        timer.cancel()
        conn.close()


def resolve_within(
    resolve: "Resolver", host: str, port: int, timeout: float
) -> List[str]:
    """``resolve(host, port)`` on its own thread, waited on for *timeout* seconds.

    Raises:
        TimeoutError: the lookup didn't answer in time (its thread is left to end).
        OSError, ValueError: as *resolve* raises them.
    """
    done: "Future[List[str]]" = Future()

    def run() -> None:
        try:
            done.set_result(resolve(host, port))
        except BaseException as e:  # pylint: disable=broad-except
            # Not swallowed: result() below re-raises it.
            done.set_exception(e)

    threading.Thread(target=run, name="device-push-dns", daemon=True).start()
    try:
        return done.result(timeout=timeout)
    except FutureTimeout as e:
        raise TimeoutError(f"looking up {host} took longer than {timeout:g} s") from e


# ── The notifier ──────────────────────────────────────────────────────────


@dataclass
class _Event:
    kind: str
    session_id: Optional[str] = None
    approval_id: Optional[str] = None
    reason: Optional[str] = None
    params: Dict[str, str] = field(default_factory=dict)
    ended: Optional[str] = None


_STOP = object()


@dataclass
class _DeviceState:
    sent: "OrderedDict[Tuple[str, str], float]" = field(default_factory=OrderedDict)
    alerts: Deque[float] = field(default_factory=deque)
    blocked_until: float = 0.0
    badge_sent: Optional[int] = None
    badge_at: float = 0.0
    badge_due: Optional[float] = None
    silent_day: int = -1
    silent_count: int = 0


#: ``(host, port, address, path, headers, body, *, deadline)`` -> the relay's answer.
Transport = Callable[..., RelayAnswer]
Resolver = Callable[[str, int], List[str]]


class PushNotifier:
    """Turns chat events into encrypted pushes for the phones that asked for them.

    *app* is read when an event is handled, for ``state.devices`` and
    ``state.db``, so a test that swaps either is seen.
    """

    def __init__(
        self,
        app,
        *,
        transport: Transport = post_to_relay,
        resolve: Resolver = public_addresses,
        clock: Callable[[], float] = time.time,
        wall_ms: Callable[[], int] = lambda: time.time_ns() // 1_000_000,
    ) -> None:
        self._app = app
        self._wall_ms = wall_ms
        self._transport = transport
        self._resolve = resolve
        self._clock = clock
        self._queue: "queue.Queue[Any]" = queue.Queue(maxsize=PUSH_QUEUE_MAX)
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._streams: Dict[str, int] = {}
        self._state: Dict[str, _DeviceState] = {}
        self._senders: Optional[ThreadPoolExecutor] = None
        self._waiting = 0

    # ── Hooks: safe from any thread, never block ──────────────────────────

    def stream_opened(self, device_id: str) -> None:
        with self._lock:
            self._streams[device_id] = self._streams.get(device_id, 0) + 1

    def stream_closed(self, device_id: str) -> None:
        with self._lock:
            left = self._streams.get(device_id, 0) - 1
            if left > 0:
                self._streams[device_id] = left
            else:
                self._streams.pop(device_id, None)
                # The phone set its own badge while it watched; resync on the next change.
                state = self._state.get(device_id)
                if state is not None:
                    state.badge_sent = None

    def watching(self, device_id: str) -> bool:
        with self._lock:
            return device_id in self._streams

    def approval(
        self,
        session_id: str,
        approval_id: str,
        ask: str,
        *,
        summary: Optional[str] = None,
        label: Optional[str] = None,
        tool: Optional[str] = None,
    ) -> None:
        params = {"ask": ask}
        if summary:
            params["summary"] = summary
        if label:
            params["label"] = label
        if tool:
            params["tool"] = tool
        self._put(_Event(KIND_APPROVAL, session_id, approval_id, params=params))

    def run_ended(self, session_id: str, status: str) -> None:
        """A turn ended: ``done`` and ``failed`` notify, ``stopped`` only moves the badge."""
        kind = {"done": KIND_FINISHED, "failed": KIND_FAILED}.get(status)
        if kind is None:
            self.badge_changed()
            return
        self._put(_Event(kind, session_id))

    def needs_you(self, reason: str) -> None:
        if reason not in NEEDS_YOU_REASONS:
            raise ValueError(f"unknown needs_you reason {reason!r}")
        self._put(_Event(KIND_NEEDS_YOU, reason=reason))

    def session_read(self, session_id: str) -> None:
        """The user opened a chat: its next run end may notify again."""
        self._put(_Event(KIND_BADGE, session_id, ended="read"))

    def badge_changed(self) -> None:
        self._put(_Event(KIND_BADGE))

    def forget(self, device_id: str) -> None:
        with self._lock:
            self._state.pop(device_id, None)

    def close(self) -> None:
        with self._lock:
            thread, self._thread = self._thread, None
        if thread is not None:
            self._queue.put(_STOP)
            thread.join(timeout=PUSH_TIMEOUT_SECONDS + 1)
        with self._lock:
            senders, self._senders = self._senders, None
        if senders is not None:
            senders.shutdown(wait=True, cancel_futures=True)

    def _put(self, event: _Event) -> None:
        with self._lock:
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(
                    target=self._run, name="device-push", daemon=True
                )
                self._thread.start()
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            logger.warning(
                "Push queue full (%d events); a %s push to paired devices was dropped",
                PUSH_QUEUE_MAX,
                event.kind,
            )

    # ── The worker ────────────────────────────────────────────────────────

    def _run(self) -> None:
        while True:
            try:
                item = self._queue.get(timeout=self._next_due())
            except queue.Empty:
                item = None
            if item is _STOP:
                return
            try:
                if item is not None:
                    self.handle(item)
                self._send_due_badges()
            except Exception:  # pylint: disable=broad-except
                # The worker must outlive one bad event; the trace says which.
                logger.exception("Handling a push for paired devices failed")

    def _next_due(self) -> Optional[float]:
        with self._lock:
            due = [s.badge_due for s in self._state.values() if s.badge_due is not None]
        if not due:
            return None
        return max(0.05, min(due) - self._clock())

    def _targets(self) -> List[Tuple[Device, PushRecord]]:
        access = getattr(self._app.state, "devices", None)
        if access is None:
            return []
        return access.push_targets()

    def _device(self, device_id: str) -> _DeviceState:
        with self._lock:
            return self._state.setdefault(device_id, _DeviceState())

    def handle(self, event: _Event) -> None:
        """Send *event* to every device it concerns; the worker calls this."""
        targets = self._targets()
        if event.ended == "read" and event.session_id:
            for device, _ in targets:
                sent = self._device(device.id).sent
                for kind in (KIND_FINISHED, KIND_FAILED):
                    sent.pop((kind, event.session_id), None)
        if not targets:
            return
        badge = self._badge()
        if event.kind == KIND_BADGE:
            for device, _ in targets:
                self._schedule_badge(device.id, badge)
            return
        for device, record in targets:
            try:
                self._alert(device, record, event, badge)
            except Exception as e:  # pylint: disable=broad-except
                _log_device_failure(device.id, record, e)

    def _alert(
        self, device: Device, record: PushRecord, event: _Event, badge: int
    ) -> None:
        if self.watching(device.id):
            return
        state = self._device(device.id)
        now = self._clock()
        if event.kind == KIND_APPROVAL:
            dedupe = (KIND_APPROVAL, event.approval_id or "")
            subject = f"a:{event.approval_id}"
        elif event.kind == KIND_NEEDS_YOU:
            dedupe = (KIND_NEEDS_YOU, event.reason or "")
            subject = f"n:{event.reason}"
        else:
            dedupe = (event.kind, event.session_id or "")
            subject = f"s:{event.session_id}"
        last = state.sent.get(dedupe)
        if last is not None and (
            event.kind != KIND_NEEDS_YOU or now - last < PUSH_NEEDS_YOU_SECONDS
        ):
            return
        if now < state.blocked_until:
            logger.warning(
                "Push to device %s dropped: its relay asked GAIA to wait (%.0f s left)",
                device.id,
                state.blocked_until - now,
            )
            return
        while state.alerts and now - state.alerts[0] >= 3600:
            state.alerts.popleft()
        if len(state.alerts) >= PUSH_ALERTS_PER_HOUR:
            logger.warning(
                "Push to device %s dropped: %d notifications in the last hour",
                device.id,
                PUSH_ALERTS_PER_HOUR,
            )
            return
        state.alerts.append(now)
        state.sent[dedupe] = now
        while len(state.sent) > _SENT_KEPT:
            state.sent.popitem(last=False)
        payload: Dict[str, Any] = {
            "v": PUSH_VERSION,
            "kind": event.kind,
            "params": dict(event.params),
            "route": ROUTE_HOME,
            "badge": badge,
        }
        if event.session_id and event.kind != KIND_NEEDS_YOU:
            payload["session_id"] = event.session_id
            payload["route"] = self._chat_route(event.session_id)
            title = self._chat_title(event.session_id)
            if title:
                payload["params"]["chat_title"] = title
        if event.approval_id:
            payload["approval_id"] = event.approval_id
        if self._send(device, record, payload, subject, DELIVERY_ALERT):
            state.badge_sent = badge

    def _schedule_badge(self, device_id: str, badge: int) -> None:
        if self.watching(device_id):
            return
        state = self._device(device_id)
        if state.badge_sent == badge:
            state.badge_due = None
            return
        if state.badge_due is None:
            state.badge_due = max(self._clock(), state.badge_at + PUSH_BADGE_SECONDS)

    def _send_due_badges(self) -> None:
        now = self._clock()
        with self._lock:
            due = [
                d for d, s in self._state.items() if s.badge_due and s.badge_due <= now
            ]
        if not due:
            return
        targets = {device.id: (device, record) for device, record in self._targets()}
        badge = self._badge()
        for device_id in due:
            state = self._device(device_id)
            state.badge_due = None
            if device_id not in targets or self.watching(device_id):
                continue
            if state.badge_sent == badge:
                continue
            day = int(now // 86400)
            if state.silent_day != day:
                state.silent_day, state.silent_count = day, 0
            if state.silent_count >= PUSH_SILENT_PER_DAY:
                logger.warning(
                    "Badge update for device %s dropped: %d silent pushes today",
                    device_id,
                    PUSH_SILENT_PER_DAY,
                )
                continue
            if now < state.blocked_until:
                continue
            state.silent_count += 1
            state.badge_at = now
            device, record = targets[device_id]
            payload = {"v": PUSH_VERSION, "kind": KIND_BADGE, "badge": badge}
            try:
                if self._send(device, record, payload, "b", DELIVERY_SILENT):
                    state.badge_sent = badge
            except Exception as e:  # pylint: disable=broad-except
                _log_device_failure(device_id, record, e)

    def _send(
        self,
        device: Device,
        record: PushRecord,
        payload: Dict[str, Any],
        subject: str,
        delivery: str,
    ) -> bool:
        kind = payload["kind"]
        access = getattr(self._app.state, "devices", None)
        now_ms = self._wall_ms()
        seq = access.next_push_seq(device.id, now_ms) if access is not None else None
        if seq is None:
            return False
        payload = {**payload, "seq": seq, "ts": now_ms}
        try:
            host, port, prefix = relay_parts(record.relay_url)
            key = decode_b64url(record.key, PUSH_KEY_BYTES, "key")
            plaintext = fit_payload(payload)
        except PushRefused as e:
            logger.error(
                "Push to device %s through %s not sent: %s",
                device.id,
                stored_relay_host(record.relay_url) or "an unreadable relay",
                e,
            )
            return False
        ciphertext, nonce = encrypt(key, record.handle, plaintext)
        body = json.dumps(
            {
                PUSH_DELIVERY_FIELD: delivery,
                "ciphertext": ciphertext,
                "nonce": nonce,
                "collapse_id": collapse_id(key, subject),
            }
        ).encode("utf-8")
        path = f"{prefix}/v1/handles/{quote(record.handle, safe='')}/send"
        headers = {
            "Authorization": f"Bearer {record.send_token}",
            "Content-Type": "application/json",
        }
        return self._submit(
            device.id,
            host,
            lambda: self._deliver(
                device, record, host, port, path, headers, body, kind, ciphertext
            ),
        )

    def _submit(self, device_id: str, host: str, send: Callable[[], None]) -> bool:
        """Hand *send* to a sender thread; False (and logged) when too many wait."""
        with self._lock:
            if self._waiting >= PUSH_SENDS_WAITING:
                logger.warning(
                    "Push to device %s through %s dropped: %d sends already wait",
                    device_id,
                    host,
                    PUSH_SENDS_WAITING,
                )
                return False
            self._waiting += 1
            if self._senders is None:
                self._senders = ThreadPoolExecutor(
                    PUSH_SENDERS, thread_name_prefix="device-push-send"
                )
            senders = self._senders

        def run() -> None:
            with self._lock:
                self._waiting -= 1
            send()

        senders.submit(run)
        return True

    def _deliver(
        self,
        device: Device,
        record: PushRecord,
        host: str,
        port: int,
        path: str,
        headers: Dict[str, str],
        body: bytes,
        kind: str,
        ciphertext: str,
    ) -> None:
        """One send, within ``PUSH_SEND_SECONDS`` from the lookup to the status."""
        started = time.monotonic()
        try:
            try:
                addresses = resolve_within(
                    self._resolve, host, port, PUSH_TIMEOUT_SECONDS
                )
            except TimeoutError:
                logger.warning(
                    "Push to device %s dropped: looking up its relay %s took longer "
                    "than %.0f s",
                    device.id,
                    host,
                    PUSH_TIMEOUT_SECONDS,
                )
                return
            except (OSError, ValueError):
                logger.warning(
                    "Push to device %s dropped: its relay %s doesn't resolve to "
                    "public addresses only",
                    device.id,
                    host,
                )
                return
            left = PUSH_SEND_SECONDS - (time.monotonic() - started)
            try:
                answer = self._transport(
                    host, port, addresses[0], path, headers, body, deadline=left
                )
            except (OSError, http.client.HTTPException) as e:
                logger.warning(
                    "Push to device %s through %s failed (%s); dropped",
                    device.id,
                    host,
                    type(e).__name__,
                )
                return
            self._answered(device, record, host, kind, ciphertext, answer)
        except Exception as e:  # pylint: disable=broad-except
            # A sender thread must outlive one bad send; never log its content.
            logger.error(
                "Push to device %s through %s failed unexpectedly (%s); dropped",
                device.id,
                host,
                type(e).__name__,
            )

    def _answered(
        self,
        device: Device,
        record: PushRecord,
        host: str,
        kind: str,
        ciphertext: str,
        answer: RelayAnswer,
    ) -> None:
        status = answer.status
        if 200 <= status < 300:
            return
        if status in (401, 410):
            access = getattr(self._app.state, "devices", None)
            if access is not None:
                access.drop_push(device.id, record.handle)
            self.forget(device.id)
            logger.warning(
                "Relay %s refused device %s's handle (HTTP %d); push is off for it "
                "until the phone turns it on again",
                host,
                device.id,
                status,
            )
        elif status == 429:
            wait = _retry_after(answer.retry_after)
            state = self._device(device.id)
            with self._lock:
                state.blocked_until = self._clock() + (
                    wait if wait is not None else PUSH_DEFAULT_RETRY_AFTER
                )
            logger.warning(
                "Relay %s is rate-limiting device %s (HTTP 429, wait %s); push "
                "dropped",
                host,
                device.id,
                f"{wait:.0f} s" if wait is not None else "not given, holding 60 s",
            )
        elif status in (400, 413):
            logger.error(
                "Relay %s refused a %s push to device %s as malformed (HTTP %d; "
                "ciphertext %d chars, nonce %d bytes). This is a GAIA bug.",
                host,
                kind,
                device.id,
                status,
                len(ciphertext),
                PUSH_NONCE_BYTES,
            )
        else:
            logger.warning(
                "Push to device %s through %s failed (HTTP %d); dropped",
                device.id,
                host,
                status,
            )

    # ── What a payload says ───────────────────────────────────────────────

    def _db(self):
        return getattr(self._app.state, "db", None)

    @staticmethod
    def _chat_route(session_id: str) -> str:
        route = f"/chat/{session_id}"
        return route if _ROUTE_RE.match(route) else ROUTE_HOME

    def _chat_title(self, session_id: str) -> Optional[str]:
        db = self._db()
        session = db.get_session(session_id) if db is not None else None
        title = (session or {}).get("title")
        return title if isinstance(title, str) and title.strip() else None

    def _badge(self) -> int:
        """Chats that need the user: a prompt waiting, or a finished or failed
        run not opened since."""
        from ..run_manager import run_manager

        waiting = set()
        for session_id in run_manager.active_sessions():
            run = run_manager.get(session_id)
            handler = run.handler if run is not None else None
            if handler is not None and handler.waiting_on():
                waiting.add(session_id)
        db = self._db()
        if db is not None:
            waiting = {s for s in waiting if not _is_automated(db, s)}
        unread = set(db.unread_ended_session_ids()) if db is not None else set()
        return len(waiting | unread)


def _is_automated(db, session_id: str) -> bool:
    session = db.get_session(session_id)
    return session is not None and session.get("kind") in AUTOMATED_SESSION_KINDS


def _log_device_failure(device_id: str, record: PushRecord, e: Exception) -> None:
    """One device's push failed: logged by its relay host only, and the rest go on."""
    logger.error(
        "Push to device %s through %s failed (%s); dropped",
        device_id,
        stored_relay_host(record.relay_url) or "an unreadable relay",
        type(e).__name__,
    )


def _retry_after(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    try:
        seconds = float(value.strip())
    except ValueError:
        return None
    return seconds if 0 <= seconds <= 86400 else None


# ── The process's notifier, for hooks that have no app at hand ────────────

_notifier: Optional[PushNotifier] = None


def bind(notifier: Optional[PushNotifier]) -> Optional[PushNotifier]:
    """Make *notifier* the one hooks reach; the one it replaced is returned."""
    global _notifier
    previous, _notifier = _notifier, notifier
    return previous


def current() -> Optional[PushNotifier]:
    return _notifier


def _frame_event(data: str) -> Optional[dict]:
    if '"permission_request"' not in data and '"user_input_request"' not in data:
        return None
    line = data.split("\n", 1)[0]
    if not line.startswith("data: "):
        return None
    try:
        event = json.loads(line[len("data: ") :])
    except ValueError:
        return None
    return event if isinstance(event, dict) else None


def observe_run_frame(session_id: str, data: str) -> None:
    """Notify for a prompt the run just put to the user, if *data* is one."""
    notifier = _notifier
    if notifier is None:
        return
    event = _frame_event(data)
    if event is None:
        return
    etype = event.get("type")
    if etype == "permission_request" and event.get("confirm_id"):
        label, tool = event.get("tool_label"), event.get("tool")
        notifier.approval(
            session_id,
            str(event["confirm_id"]),
            ASK_APPROVAL,
            label=label if isinstance(label, str) else None,
            tool=tool if isinstance(tool, str) else None,
        )
    elif etype == "user_input_request" and event.get("request_id"):
        message = event.get("message")
        notifier.approval(
            session_id,
            str(event["request_id"]),
            ASK_QUESTION,
            summary=message if isinstance(message, str) else None,
        )


def key_store_locked() -> None:
    needs_you(NEEDS_YOU_KEY_STORE)


def run_ended(session_id: str, status: str) -> None:
    if _notifier is not None:
        _notifier.run_ended(session_id, status)


def needs_you(reason: str) -> None:
    if _notifier is not None:
        _notifier.needs_you(reason)


def badge_changed() -> None:
    if _notifier is not None:
        _notifier.badge_changed()


def session_read(session_id: str) -> None:
    if _notifier is not None:
        _notifier.session_read(session_id)


def stream_opened(device_id: str) -> None:
    if _notifier is not None:
        _notifier.stream_opened(device_id)


def stream_closed(device_id: str) -> None:
    if _notifier is not None:
        _notifier.stream_closed(device_id)


__all__: Sequence[str] = (
    "DELIVERY_ALERT",
    "DELIVERY_SILENT",
    "PUSH_DELIVERY_FIELD",
    "PushNotifier",
    "PushRefused",
    "RelayAnswer",
    "bind",
    "collapse_id",
    "current",
    "cut_text",
    "decode_b64url",
    "encrypt",
    "fit_payload",
    "stored_relay_host",
    "relay_parts",
)
