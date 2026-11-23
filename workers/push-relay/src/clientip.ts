// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { HttpError } from "./http";

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HEXTET = /^[0-9a-fA-F]{1,4}$/;

function bad(): HttpError {
  return new HttpError(500, "bad_client_ip", "CF-Connecting-IP is not an IP address; the relay must run behind Cloudflare.");
}

/** The eight hextets of an IPv6 address, or null. */
function ipv6Hextets(ip: string): number[] | null {
  let text = ip;
  const v4 = /:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4) {
    if (!IPV4.test(v4[1])) return null;
    const o = v4[1].split(".").map(Number);
    text = `${text.slice(0, -v4[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s === "" ? [] : s.split(":"));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (![...head, ...rest].every((h) => HEXTET.test(h))) return null;
  const known = head.length + rest.length;
  if (halves.length === 1 ? known !== 8 : known > 7) return null;
  return [...head, ...new Array(8 - known).fill("0"), ...rest].map((h) => parseInt(h, 16));
}

/**
 * The register-limit subject for a client: the full address for IPv4, the /64
 * for IPv6, since one subscriber usually holds a whole /64.
 */
export function clientSubject(ip: string): string {
  if (IPV4.test(ip)) return ip;
  const h = ipv6Hextets(ip.split("%")[0]);
  if (!h) throw bad();
  if (h.slice(0, 6).every((x, i) => (i === 5 ? x === 0xffff : x === 0))) {
    return `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  }
  return `${h.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}
