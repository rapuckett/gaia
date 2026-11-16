# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The Tailscale route: paired devices on the person's tailnet reach the
listener at this PC's own tailnet address.

Tailscale carries only the device's TLS; the pin and the token still guard
every request. The address comes from the PC's interfaces, never from the
``tailscale`` CLI, and the route is IPv4 only, like the listener.
"""

from __future__ import annotations

import ipaddress
import socket
from typing import Callable, List, Optional

from starlette.types import Scope

from . import (
    TAILNET_INTERFACES,
    TAILNET_NETWORK,
    TAILNET_ROUTE,
    TAILNET_UTUN_PREFIX,
    AwayRouteErrorCode,
)
from .routes import AwayRoute

_TAILNET = ipaddress.ip_network(TAILNET_NETWORK)


def _tailnet_interface(name: str, ptp: Optional[str]) -> bool:
    if name in TAILNET_INTERFACES:
        return True
    # macOS names every VPN utunN; Tailscale's is point-to-point.
    return name.startswith(TAILNET_UTUN_PREFIX) and bool(ptp)


def tailnet_ipv4() -> Optional[str]:
    """This PC's tailnet IPv4 address, or None when Tailscale isn't up."""
    import psutil

    stats = psutil.net_if_stats()
    for name, entries in sorted(psutil.net_if_addrs().items()):
        if name not in stats or not stats[name].isup:
            continue
        for entry in entries:
            if entry.family != socket.AF_INET:
                continue
            if not _tailnet_interface(name, getattr(entry, "ptp", None)):
                continue
            if ipaddress.ip_address(entry.address) in _TAILNET:
                return entry.address
    return None


def _ipv4(value) -> Optional[ipaddress.IPv4Address]:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return None
    return address if address.version == 4 else None


class TailnetRoute(AwayRoute):
    """Admits a tailnet peer that reached this PC's own tailnet address."""

    kind = TAILNET_ROUTE

    def __init__(self, port: Callable[[], Optional[int]]) -> None:
        self._port = port
        self._wanted = False
        self._refused = False

    @property
    def on(self) -> bool:
        return self._wanted and tailnet_ipv4() is not None

    @property
    def error_code(self) -> Optional[AwayRouteErrorCode]:
        if (self._wanted or self._refused) and tailnet_ipv4() is None:
            return "no_tailscale_address"
        return None

    def origins(self) -> List[str]:
        address, port = tailnet_ipv4(), self._port()
        if not self._wanted or address is None or port is None:
            return []
        return [f"https://{address}:{port}"]

    def admits(self, scope: Scope) -> bool:
        client, server = scope.get("client"), scope.get("server")
        peer = _ipv4(client[0]) if client else None
        if peer is None or peer not in _TAILNET:
            return False
        local = _ipv4(server[0]) if server else None
        own = tailnet_ipv4()
        return local is not None and own is not None and str(local) == own

    async def start(self) -> None:
        if tailnet_ipv4() is None:
            self._refused = True
            raise RuntimeError(
                "Tailscale isn't running on this PC: it has no Tailscale "
                f"address ({TAILNET_NETWORK}). Start Tailscale and sign in, "
                "then turn this on again."
            )
        self._wanted, self._refused = True, False

    async def stop(self) -> None:
        self._wanted = self._refused = False
