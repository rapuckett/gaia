# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The home network: the subnet of the interface carrying the IPv4 default route.

Other interfaces with private addresses (Docker and WSL bridges, VPNs,
ZeroTier) are not the home network: their peers are refused and their
addresses never go in a pairing code. Found afresh on every check, so a DHCP
change or a move to another Wi-Fi network takes effect at once.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from typing import List, Optional, Tuple

from . import HOME_NETWORKS, OFFERED_NETWORKS

_HOME = tuple(ipaddress.ip_network(n) for n in HOME_NETWORKS)
_OFFERED = tuple(ipaddress.ip_network(n) for n in OFFERED_NETWORKS)
#: TEST-NET-1 (RFC 5737): only the default route leads there. A UDP connect()
#: picks the source address without sending a packet.
_PROBE = ("192.0.2.1", 9)
_HOME_RANGES = "10.x, 172.16-31.x, 192.168.x or 169.254.x"


class NoHomeNetwork(RuntimeError):
    """This PC has no home network GAIA can answer devices on; *detail* says why."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


@dataclass(frozen=True)
class HomeNetwork:
    """The default route's interface and its private IPv4 subnets."""

    interface: str
    subnets: Tuple[ipaddress.IPv4Interface, ...]

    def admits(self, peer: ipaddress.IPv4Address, local: Optional[str]) -> bool:
        """A peer that dialed one of this interface's addresses from its subnet,
        or from a link-local address."""
        try:
            dialed = ipaddress.ip_address(local) if local else None
        except ValueError:
            return False
        if dialed not in {subnet.ip for subnet in self.subnets}:
            return False
        if peer.is_link_local:
            return True
        return any(peer in subnet.network for subnet in self.subnets)

    def offered(self) -> List[str]:
        """The addresses a pairing code may list: no link-local ones."""
        return [
            str(subnet.ip)
            for subnet in self.subnets
            if any(subnet.ip in net for net in _OFFERED)
        ]


def default_route_ipv4() -> str:
    """The source address this PC's IPv4 default route uses.

    Raises:
        NoHomeNetwork: The PC has no IPv4 default route.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(_PROBE)
        except OSError as e:
            raise NoHomeNetwork(
                "This PC has no IPv4 default route, so GAIA can't tell which "
                "network is your home network. Connect the PC to your home Wi-Fi "
                "or Ethernet, then turn access on again."
            ) from e
        return probe.getsockname()[0]


def home_network() -> HomeNetwork:
    """The interface carrying the default route, with its private subnets.

    Raises:
        NoHomeNetwork: There is no default route, its interface is gone, or
            it has no private IPv4 address.
    """
    import psutil

    source = default_route_ipv4()
    stats = psutil.net_if_stats()
    for name, entries in psutil.net_if_addrs().items():
        ipv4 = [e for e in entries if e.family == socket.AF_INET]
        if source not in {e.address for e in ipv4}:
            continue
        if name in stats and not stats[name].isup:
            break
        subnets = []
        for entry in ipv4:
            if not entry.netmask:
                continue
            subnet = ipaddress.ip_interface(f"{entry.address}/{entry.netmask}")
            if any(subnet.network.subnet_of(net) for net in _HOME):
                subnets.append(subnet)
        if not subnets:
            raise NoHomeNetwork(
                f"This PC reaches the internet through {name} ({source}), which "
                f"has no home-network address ({_HOME_RANGES}). Connect the PC "
                "to your home Wi-Fi or Ethernet, or turn off a VPN that takes "
                "all its traffic, then turn access on again."
            )
        return HomeNetwork(name, tuple(subnets))
    raise NoHomeNetwork(
        f"This PC's default route uses {source}, but no network interface that "
        "is up has that address. Reconnect the PC to your home network, then "
        "turn access on again."
    )
