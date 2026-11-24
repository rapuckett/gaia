# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Checks for an https address a paired device asks the PC to reach.

A device may name a server the PC then connects to (the AMD gateway, a push
relay). Without these checks it could point the PC at its own loopback or the
home network. Every address a name resolves to must be public, and the PC
dials the address it checked, so a second lookup can't move it (DNS rebinding).
"""

from __future__ import annotations

import ipaddress
import socket
from typing import List, Tuple
from urllib.parse import urlparse

#: IPv6 ranges that carry an IPv4 address in their last 32 bits: compatible,
#: NAT64 and mapped. The embedded address is what gets reached.
_EMBEDS_IPV4 = tuple(
    ipaddress.ip_network(n) for n in ("::/96", "64:ff9b::/96", "::ffff:0:0/96")
)


def is_public_address(address: str) -> bool:
    """Whether *address* (an IP literal, maybe with a zone) is globally routable."""
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and any(ip in n for n in _EMBEDS_IPV4):
        ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    return ip.is_global and not ip.is_multicast


def public_https_host(url: str) -> Tuple[str, int]:
    """The host and port of an https *url*, checked from its text alone.

    Raises:
        ValueError: not https, no host, a local name, or a non-public IP literal.
    """
    parsed = urlparse(url.strip())
    if parsed.scheme != "https":
        raise ValueError("the address must start with https://")
    host = (parsed.hostname or "").rstrip(".").lower()
    port = parsed.port or 443
    if not host or host == "localhost" or host.endswith((".local", ".localhost")):
        raise ValueError("the address must name a public host")
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        return host, port
    if not is_public_address(literal.compressed):
        raise ValueError("the address must name a public host")
    return host, port


def public_addresses(host: str, port: int) -> List[str]:
    """*host*'s addresses from one lookup; raises unless every one is public.

    Raises:
        OSError: the lookup failed.
        ValueError: it found no address, or one that is not public.
    """
    infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    addresses = list(dict.fromkeys(info[4][0] for info in infos))
    if not addresses or not all(is_public_address(a) for a in addresses):
        raise ValueError(f"{host} resolves to an address that is not public")
    return addresses
