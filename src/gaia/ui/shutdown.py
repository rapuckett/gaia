# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""Ends the Agent UI's endless event streams when the server shuts down.

uvicorn waits for every open connection before it runs the lifespan shutdown,
so a stream that loops forever keeps the process alive. The server sets the
signal first thing in ``shutdown()``; streams wait on "next item or shutdown".
"""

import asyncio
import contextlib
import threading
import weakref
from typing import Any, Optional

from gaia.logger import get_logger

log = get_logger(__name__)

#: Returned by :func:`get_or_shutdown` when the server is shutting down.
SHUTDOWN = object()

_flag = threading.Event()
_lock = threading.Lock()
_wakeups: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Event]" = (
    weakref.WeakKeyDictionary()
)
_open_streams = 0


def is_shutting_down() -> bool:
    return _flag.is_set()


def reset() -> None:
    """Clear the signal, for a server that starts in a process that ran one."""
    _flag.clear()
    with _lock:
        _wakeups.clear()


def request_shutdown() -> None:
    """Tell every open event stream to end. Safe from any thread."""
    with _lock:
        already = _flag.is_set()
        _flag.set()
        wakeups = list(_wakeups.items())
        count = _open_streams
    if already:
        return
    log.info("Shutting down: closing %d open event stream(s)", count)
    for loop, event in wakeups:
        with contextlib.suppress(RuntimeError):  # loop already closed
            loop.call_soon_threadsafe(event.set)


def stream_opened() -> None:
    """Count a stream that can outlive one request, for the shutdown log line."""
    global _open_streams
    with _lock:
        _open_streams += 1


def stream_closed() -> None:
    global _open_streams
    with _lock:
        _open_streams -= 1


def _wakeup_for_running_loop() -> asyncio.Event:
    loop = asyncio.get_running_loop()
    with _lock:
        event = _wakeups.get(loop)
        if event is None:
            event = _wakeups[loop] = asyncio.Event()
        if _flag.is_set():
            event.set()
    return event


async def get_or_shutdown(
    queue: "asyncio.Queue[Any]", timeout: Optional[float] = None
) -> Any:
    """The next item of *queue*, or :data:`SHUTDOWN` once the server stops.

    Raises:
        asyncio.TimeoutError: *timeout* seconds passed with neither.
    """
    if _flag.is_set():
        return SHUTDOWN
    wakeup = _wakeup_for_running_loop()
    getter = asyncio.ensure_future(queue.get())
    waiter = asyncio.ensure_future(wakeup.wait())
    try:
        done, _ = await asyncio.wait(
            {getter, waiter}, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
        )
    finally:
        for task in (getter, waiter):
            if not task.done():
                task.cancel()
    if getter in done:
        return getter.result()
    if waiter in done:
        return SHUTDOWN
    raise asyncio.TimeoutError()


_server_class = None


def serve(app: Any, **options: Any) -> None:
    """Run *app* under uvicorn with streams that end on shutdown."""
    import uvicorn

    global _server_class
    if _server_class is None:

        class Server(uvicorn.Server):
            async def shutdown(self, sockets=None) -> None:
                request_shutdown()
                await super().shutdown(sockets=sockets)

        _server_class = Server
    reset()
    _server_class(uvicorn.Config(app, **options)).run()
