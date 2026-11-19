# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tell a paired device where an OS prompt it caused on the PC stands.

Some actions a phone may start raise a prompt only a person at the PC can
answer: the key store's unlock or "allow access" dialog, or the administrator
password. The device that asked, and the PC's own windows, hear a
``device_prompt`` event (:func:`gaia.ui.routers.sessions.emit_device_prompt`):
``waiting`` while the prompt is up, then ``approved``, ``denied`` or
``timeout``. A PC caller hears nothing; it is looking at the prompt.
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Awaitable, Dict, Tuple

import anyio.from_thread
from fastapi import HTTPException, Request

from gaia.logger import get_logger

from ..security import allowed_device
from . import (
    DEVICE_KEY_STORE_ACTION_SECONDS,
    DEVICE_PROMPT_ADMIN,
    DEVICE_PROMPT_KEY_STORE,
    DEVICE_PROMPT_TIMEOUT_SECONDS,
)

logger = get_logger(__name__)

#: How long a key-store read may take before it counts as a prompt on the PC.
KEY_STORE_PROMPT_AFTER_SECONDS = 2.0

_rate_lock = threading.Lock()


class DevicePromptTimeout(Exception):
    """Nobody answered the PC's prompt within ``DEVICE_PROMPT_TIMEOUT_SECONDS``."""


def _device_id(request: Request) -> str:
    device = allowed_device(request)
    if device is None:
        raise ValueError("a device prompt needs a request from an allowed device")
    return device.device_id


async def _emit(device_id: str, kind: str, action: str, state: str) -> None:
    from ..routers.sessions import emit_device_prompt

    await emit_device_prompt(device_id, kind, action, state)


def limit_device_rate(request: Request, action: str) -> None:
    """429 when the allowed device behind *request* started *action* in the
    last ``DEVICE_KEY_STORE_ACTION_SECONDS``; the PC is never limited."""
    device = allowed_device(request)
    if device is None:
        return
    now = time.monotonic()
    with _rate_lock:
        seen: Dict[Tuple[str, str], float] = getattr(
            request.app.state, "device_action_times", None
        )
        if seen is None:
            seen = request.app.state.device_action_times = {}
        last = seen.get((device.device_id, action))
        if last is not None and now - last < DEVICE_KEY_STORE_ACTION_SECONDS:
            wait = max(1, round(DEVICE_KEY_STORE_ACTION_SECONDS - (now - last)))
            raise HTTPException(
                status_code=429,
                detail=f"This was just tried. Wait {wait} s, then try again.",
                headers={"Retry-After": str(wait)},
            )
        seen[(device.device_id, action)] = now


def _key_store_outcome() -> str:
    from gaia.connectors.store import keyring_refusal

    return "denied" if keyring_refusal() else "approved"


async def watch_key_store(request: Request, action: str, work: Awaitable[Any]) -> Any:
    """Await *work*, which reads the OS key store for an allowed device.

    If it is still blocked after ``KEY_STORE_PROMPT_AFTER_SECONDS`` the PC is
    showing a prompt: the device hears ``waiting``, then ``approved`` or
    ``denied`` (the prompt was closed) when *work* ends, whatever it returned.

    Raises:
        DevicePromptTimeout: nobody answered within the prompt timeout; the
            device heard ``timeout``. The read is left to finish on its own.
    """
    device_id = _device_id(request)
    task = asyncio.ensure_future(work)
    try:
        return await asyncio.wait_for(
            asyncio.shield(task), KEY_STORE_PROMPT_AFTER_SECONDS
        )
    except asyncio.TimeoutError:
        pass
    logger.info("Device %s is waiting on the PC's key store prompt", device_id)
    await _emit(device_id, DEVICE_PROMPT_KEY_STORE, action, "waiting")
    try:
        result = await asyncio.wait_for(
            asyncio.shield(task), DEVICE_PROMPT_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError as e:
        await _emit(device_id, DEVICE_PROMPT_KEY_STORE, action, "timeout")
        raise DevicePromptTimeout(action) from e
    except Exception:
        await _emit(device_id, DEVICE_PROMPT_KEY_STORE, action, _key_store_outcome())
        raise
    await _emit(device_id, DEVICE_PROMPT_KEY_STORE, action, _key_store_outcome())
    return result


class AdminPrompt:
    """The administrator prompt an allowed device's request raises on the PC.

    For a sync handler on FastAPI's worker thread: pass :meth:`before_prompt`
    to the step that elevates, then call :meth:`finish` with its outcome. A
    step that never prompted (already root, or refused first) sends nothing.
    """

    def __init__(self, request: Request, action: str) -> None:
        self.device_id = _device_id(request)
        self.action = action
        self.shown = False

    def _send(self, state: str) -> None:
        anyio.from_thread.run(
            _emit, self.device_id, DEVICE_PROMPT_ADMIN, self.action, state
        )

    def before_prompt(self) -> None:
        self.shown = True
        logger.info(
            "Device %s is waiting on the PC's administrator prompt (%s)",
            self.device_id,
            self.action,
        )
        self._send("waiting")

    def finish(self, state: str) -> None:
        if self.shown:
            self._send(state)


__all__ = [
    "AdminPrompt",
    "DevicePromptTimeout",
    "KEY_STORE_PROMPT_AFTER_SECONDS",
    "limit_device_rate",
    "watch_key_store",
]
