# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The paired devices: one row each, holding only its token's SHA-256.

A device that turned push on also has a ``device_push`` row: its relay, handle,
send-only token and payload key. They must be usable to send, so they are kept
as they are, in this owner-only file beside the listener's private key, and
deleted with the device.

A device starts ``pending`` and its token is refused until the PC allows it;
a pending device the PC never allows expires, and so does an allowed one left
unused. Revoking deletes the row, so the next request with its token fails.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import os
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from gaia.logger import get_logger

from . import (
    DEVICE_IDLE_DAYS,
    DEVICE_TOKEN_BYTES,
    DEVICE_TOKEN_PREFIX,
    LAST_SEEN_WRITE_SECONDS,
    PENDING_DEVICE_SECONDS,
)
from .storage import check_private, write_private

logger = get_logger(__name__)

_PC_ID = "pc_id"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS paired_devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'allowed')),
    created_at REAL NOT NULL,
    last_seen_at REAL
);
CREATE TABLE IF NOT EXISTS device_push (
    device_id TEXT PRIMARY KEY,
    relay_url TEXT NOT NULL,
    handle TEXT NOT NULL,
    send_token TEXT NOT NULL,
    key TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at REAL NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def token_hash(token: str) -> str:
    """What the table keeps of a token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_token() -> str:
    """A device token: the prefix and 256 random bits, base64url."""
    raw = base64.urlsafe_b64encode(secrets.token_bytes(DEVICE_TOKEN_BYTES))
    return DEVICE_TOKEN_PREFIX + raw.decode("ascii").rstrip("=")


@dataclass(frozen=True)
class PushRecord:
    """Where and how to reach a device's push relay. Never logged or returned."""

    device_id: str
    relay_url: str
    handle: str
    send_token: str
    key: str
    platform: str

    def __repr__(self) -> str:
        return f"PushRecord(device_id={self.device_id!r})"


@dataclass(frozen=True)
class Device:
    """A paired device as the table holds it, times in Unix seconds."""

    id: str
    name: str
    platform: str
    status: str
    created_at: float
    last_seen_at: Optional[float]

    @property
    def allowed(self) -> bool:
        return self.status == "allowed"

    @property
    def expires_at(self) -> Optional[float]:
        """When a pending device stops working; None once allowed."""
        return None if self.allowed else self.created_at + PENDING_DEVICE_SECONDS

    def expired(self, now: float) -> bool:
        if not self.allowed:
            return now >= self.created_at + PENDING_DEVICE_SECONDS
        last_active = self.last_seen_at or self.created_at
        return now - last_active >= DEVICE_IDLE_DAYS * 86400


class DeviceStore:
    """The device table in the owner-only device folder."""

    def __init__(self, path: Path, clock: Callable[[], float] = time.time) -> None:
        if not os.path.lexists(path):
            # An empty file is an empty database; made 0600 before SQLite opens it.
            write_private(path, b"")
        check_private(path, folder=False)
        self._clock = clock
        self._lock = threading.RLock()
        self._seen_written: Dict[str, float] = {}
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock, self._conn:
            self._conn.executescript(_SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _device(self, row: sqlite3.Row) -> Device:
        return Device(
            id=row["id"],
            name=row["name"],
            platform=row["platform"],
            status=row["status"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
        )

    def add_pending(self, name: str, platform: str) -> Tuple[Device, str]:
        """A new pending device and its token, which is returned only here."""
        token = new_token()
        device = Device(
            id=secrets.token_hex(16),
            name=name,
            platform=platform,
            status="pending",
            created_at=self._clock(),
            last_seen_at=None,
        )
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO paired_devices (id, name, platform, token_hash, status, "
                "created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    device.id,
                    name,
                    platform,
                    token_hash(token),
                    device.status,
                    device.created_at,
                ),
            )
        return device, token

    def authenticate(self, token: str) -> Optional[Device]:
        """The live device *token* belongs to, else None. Notes it as seen."""
        if not token.startswith(DEVICE_TOKEN_PREFIX):
            return None
        digest = token_hash(token)
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM paired_devices WHERE token_hash = ?", (digest,)
            ).fetchone()
        if row is None or not hmac.compare_digest(row["token_hash"], digest):
            return None
        device = self._device(row)
        now = self._clock()
        if device.expired(now):
            return None
        if now - self._seen_written.get(device.id, 0.0) >= LAST_SEEN_WRITE_SECONDS:
            self._seen_written[device.id] = now
            with self._lock, self._conn:
                self._conn.execute(
                    "UPDATE paired_devices SET last_seen_at = ? WHERE id = ?",
                    (now, device.id),
                )
        return device

    def allow(self, device_id: str) -> Optional[Device]:
        """Let a pending device in; None when there is no such live device."""
        now = self._clock()
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT * FROM paired_devices WHERE id = ?", (device_id,)
            ).fetchone()
            if row is None or self._device(row).expired(now):
                return None
            self._conn.execute(
                "UPDATE paired_devices SET status = 'allowed', last_seen_at = ? "
                "WHERE id = ?",
                (now, device_id),
            )
            row = self._conn.execute(
                "SELECT * FROM paired_devices WHERE id = ?", (device_id,)
            ).fetchone()
        return self._device(row)

    def get(self, device_id: str) -> Optional[Device]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM paired_devices WHERE id = ?", (device_id,)
            ).fetchone()
        return self._device(row) if row else None

    def revoke(self, device_id: str) -> bool:
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM device_push WHERE device_id = ?", (device_id,)
            )
            gone = self._conn.execute(
                "DELETE FROM paired_devices WHERE id = ?", (device_id,)
            ).rowcount
        self._seen_written.pop(device_id, None)
        return bool(gone)

    def revoke_all(self) -> List[str]:
        with self._lock, self._conn:
            ids = [r["id"] for r in self._conn.execute("SELECT id FROM paired_devices")]
            self._conn.execute("DELETE FROM device_push")
            self._conn.execute("DELETE FROM paired_devices")
        self._seen_written.clear()
        return ids

    def expire(self) -> List[str]:
        """Revoke the devices pending too long or unused too long; their ids."""
        now = self._clock()
        stale = [d.id for d in self._all() if d.expired(now)]
        for device_id in stale:
            self.revoke(device_id)
        return stale

    def devices(self) -> List[Device]:
        """The live devices, oldest first."""
        now = self._clock()
        return [d for d in self._all() if not d.expired(now)]

    def _all(self) -> List[Device]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM paired_devices ORDER BY created_at"
            ).fetchall()
        return [self._device(row) for row in rows]

    def set_push(self, record: PushRecord) -> bool:
        """Keep *record* for its device, replacing any; False if it isn't paired."""
        with self._lock, self._conn:
            if not self._conn.execute(
                "SELECT 1 FROM paired_devices WHERE id = ?", (record.device_id,)
            ).fetchone():
                return False
            self._conn.execute(
                "INSERT INTO device_push (device_id, relay_url, handle, send_token, key, "
                "platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(device_id) DO UPDATE SET relay_url = excluded.relay_url, "
                "handle = excluded.handle, send_token = excluded.send_token, "
                "seq = CASE WHEN device_push.key = excluded.key "
                "THEN device_push.seq ELSE 0 END, "
                "key = excluded.key, platform = excluded.platform, "
                "created_at = excluded.created_at",
                (
                    record.device_id,
                    record.relay_url,
                    record.handle,
                    record.send_token,
                    record.key,
                    record.platform,
                    self._clock(),
                ),
            )
        return True

    def next_push_seq(self, device_id: str, now_ms: int) -> Optional[int]:
        """The device's next payload ``seq``: above every one before, and never
        below *now_ms*, so a restored table can't repeat one. None once push is off."""
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT seq FROM device_push WHERE device_id = ?", (device_id,)
            ).fetchone()
            if row is None:
                return None
            seq = max(int(row["seq"]) + 1, int(now_ms))
            self._conn.execute(
                "UPDATE device_push SET seq = ? WHERE device_id = ?", (seq, device_id)
            )
        return seq

    def push(self, device_id: str) -> Optional[PushRecord]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM device_push WHERE device_id = ?", (device_id,)
            ).fetchone()
        return self._push(row) if row else None

    def pushes(self) -> List[PushRecord]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM device_push").fetchall()
        return [self._push(row) for row in rows]

    def delete_push(self, device_id: str, handle: Optional[str] = None) -> bool:
        """Turn push off for *device_id*; with *handle*, only if it still has that one."""
        query = "DELETE FROM device_push WHERE device_id = ?"
        params: Tuple[str, ...] = (device_id,)
        if handle is not None:
            query += " AND handle = ?"
            params += (handle,)
        with self._lock, self._conn:
            return bool(self._conn.execute(query, params).rowcount)

    @staticmethod
    def _push(row: sqlite3.Row) -> PushRecord:
        return PushRecord(
            device_id=row["device_id"],
            relay_url=row["relay_url"],
            handle=row["handle"],
            send_token=row["send_token"],
            key=row["key"],
            platform=row["platform"],
        )

    def setting(self, key: str) -> Optional[str]:
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            ).fetchone()
        return row["value"] if row else None

    def set_setting(self, key: str, value: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def pc_id(self) -> str:
        """This PC's id in pairing codes: made once, kept across resets."""
        with self._lock:
            existing = self.setting(_PC_ID)
            if existing:
                return existing
            pc_id = secrets.token_hex(16)
            self.set_setting(_PC_ID, pc_id)
            return pc_id

    def adopt_pc_id(self, pc_id: str) -> None:
        """Keep an id this PC already gave devices, after a reset."""
        self.set_setting(_PC_ID, pc_id)


def allowed_device_ids(path: Optional[Path] = None) -> List[str]:
    """The live, allowed devices in the table at *path* (default: GAIA's own).

    Never creates the table: none was ever made means no device is paired.
    """
    from gaia.home import devices_dir

    from .storage import TABLE_NAME

    path = path or devices_dir() / TABLE_NAME
    if not os.path.lexists(path):
        return []
    store = DeviceStore(path)
    try:
        return [d.id for d in store.devices() if d.allowed]
    finally:
        store.close()


def read_pc_id(path: Path) -> Optional[str]:
    """The pc_id an old table holds, read without the permission check.

    For a reset about to delete the table: its id outlives it.
    """
    if not path.exists():
        return None
    try:
        with contextlib.closing(sqlite3.connect(str(path))) as conn:
            row = conn.execute(
                "SELECT value FROM settings WHERE key = ?", (_PC_ID,)
            ).fetchone()
    except sqlite3.Error as e:
        logger.warning("The old device table's pc_id can't be read (%s)", e)
        return None
    return row[0] if row else None
