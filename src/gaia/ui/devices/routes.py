# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Away routes: ways a paired device reaches the listener off the home network.

Each route only carries the device's TLS to the listener; :class:`DeviceGate`
still checks the token, and the request is still ``device:<id>``, never the PC.
A route turns on only from the PC's own controls: nothing here reads an
environment variable or a ``.env`` file, because turning one on exposes the
PC beyond the home network. Every route starts off.
"""

from __future__ import annotations

import abc
from typing import Dict, List, Optional

from starlette.types import Scope

from . import AwayRouteKind


class AwayRoute(abc.ABC):
    """One way off the home network: a tailnet, a relay."""

    kind: AwayRouteKind

    @property
    @abc.abstractmethod
    def on(self) -> bool:
        """Whether the route is carrying devices now."""

    @property
    def error_code(self) -> Optional[str]:
        """Why the route isn't on, for the PC to translate; None when it is."""
        return None

    @abc.abstractmethod
    def origins(self) -> List[str]:
        """The ``https://`` origins a device reaches this PC at on this route."""

    @abc.abstractmethod
    def admits(self, scope: Scope) -> bool:
        """Whether this listener request came in over this route."""

    @abc.abstractmethod
    async def start(self) -> None:
        """Turn the route on. Called only from a PC-only control.

        Raises:
            RuntimeError: It can't start; ``error_code`` says why too.
        """

    @abc.abstractmethod
    async def stop(self) -> None:
        """Turn the route off."""


class AwayRoutes:
    """The away routes this GAIA knows; empty unless one is registered."""

    def __init__(self) -> None:
        self._routes: Dict[str, AwayRoute] = {}

    def register(self, route: AwayRoute) -> None:
        """Add *route*, off. Raises ValueError for a kind already registered."""
        if route.kind in self._routes:
            raise ValueError(f"An away route of kind {route.kind!r} is registered")
        self._routes[route.kind] = route

    def get(self, kind: str) -> Optional[AwayRoute]:
        return self._routes.get(kind)

    def all(self) -> List[AwayRoute]:
        return list(self._routes.values())

    def admitting(self, scope: Scope) -> Optional[AwayRouteKind]:
        """The kind of the route that is on and carried this request, if any."""
        for route in self._routes.values():
            if route.on and route.admits(scope):
                return route.kind
        return None

    def origins(self) -> List[dict]:
        """``{"kind", "origin"}`` for every origin of every route that is on."""
        return [
            {"kind": route.kind, "origin": origin}
            for route in self._routes.values()
            if route.on
            for origin in route.origins()
        ]

    def status(self) -> List[dict]:
        """Each route as the PC shows it."""
        found = []
        for route in self._routes.values():
            origins = route.origins() if route.on else []
            found.append(
                {
                    "kind": route.kind,
                    "on": route.on,
                    "origin": origins[0] if origins else None,
                    "error_code": route.error_code,
                }
            )
        return found

    async def stop_all(self) -> None:
        for route in self._routes.values():
            if route.on:
                await route.stop()
