# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""A PC's network interfaces and default route, as psutil and the kernel report them."""

from __future__ import annotations

import errno
import socket
from types import SimpleNamespace
from typing import Dict, Optional, Tuple

import psutil

from gaia.ui.devices import home

#: Wi-Fi on the home LAN carries the default route; Docker's bridge and a
#: corporate VPN have private addresses too, and are not home.
HOME_ADDRESS = "192.168.1.10"
TYPICAL_PC: Dict[str, Tuple[str, str]] = {
    "lo0": ("127.0.0.1", "255.0.0.0"),
    "en0": (HOME_ADDRESS, "255.255.255.0"),
    "docker0": ("172.17.0.1", "255.255.0.0"),
    "utun4": ("10.8.0.2", "255.255.255.0"),
}


def fake_pc(monkeypatch, nics=None, default_route: Optional[str] = HOME_ADDRESS):
    """Give this process *nics* (name -> (address, netmask)) and a default route
    leaving from *default_route*, or none at all."""
    nics = TYPICAL_PC if nics is None else nics
    monkeypatch.setattr(
        psutil,
        "net_if_addrs",
        lambda: {
            name: [
                SimpleNamespace(
                    family=socket.AF_INET,
                    address=address,
                    netmask=netmask,
                    broadcast=None,
                    ptp=None,
                )
            ]
            for name, (address, netmask) in nics.items()
        },
    )
    monkeypatch.setattr(
        psutil,
        "net_if_stats",
        lambda: {name: SimpleNamespace(isup=True) for name in nics},
    )

    class Probe:
        def __init__(self, *args):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def connect(self, address):
            if default_route is None:
                raise OSError(errno.ENETUNREACH, "Network is unreachable")

        def getsockname(self):
            return (default_route, 50000)

    monkeypatch.setattr(
        home,
        "socket",
        SimpleNamespace(
            AF_INET=socket.AF_INET, SOCK_DGRAM=socket.SOCK_DGRAM, socket=Probe
        ),
    )
