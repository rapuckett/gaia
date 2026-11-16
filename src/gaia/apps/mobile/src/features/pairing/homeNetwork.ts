// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The networks a pairing code may name: the PC's OFFERED_NETWORKS (gaia/ui/devices). Twin: HomeNetwork.swift. */
export const OFFERED_NETWORKS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'] as const;
/** Tailscale's IPv4 range, the only addresses a `tailnet` origin may name. */
export const TAILNET_NETWORK = '100.64.0.0/10';
/** A relay origin's first label: a PC's relay id, base32 lowercase. */
export const RELAY_ID = /^[a-z2-7]{26}$/;
/** The relay this build reaches PCs through; unset means relay origins are refused. Swift reads it from Info.plist. */
export const RELAY_DOMAIN: string | undefined = process.env.EXPO_PUBLIC_GAIA_RELAY_DOMAIN || undefined;

export const ROUTE_KINDS = ['home', 'tailnet', 'relay'] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];
export interface RouteOrigin {
    kind: RouteKind;
    origin: string;
}

const OCTET = '(?:0|[1-9]\\d{0,2})';
const ORIGIN = new RegExp(`^https://(${OCTET}(?:\\.${OCTET}){3}):([1-9]\\d{0,4})/?$`);
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const DOMAIN = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

function ipv4(text: string): number | null {
    const parts = text.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p > 255)) return null;
    return parts.reduce((n, p) => n * 256 + p, 0);
}

function network(cidr: string) {
    const [base, bits] = cidr.split('/');
    return { start: ipv4(base)!, size: 2 ** (32 - Number(bits)) };
}

const HOME_NETWORKS = OFFERED_NETWORKS.map(network);
const TAILNET = network(TAILNET_NETWORK);

/** `https://<dotted IPv4>:<port>` and nothing more, with its address on one of `networks`. */
function ipv4Origin(origin: string, networks: { start: number; size: number }[]): string | null {
    const match = ORIGIN.exec(origin);
    if (!match) return null;
    const [, host, port] = match;
    const address = ipv4(host);
    if (address === null || Number(port) > 65535) return null;
    if (!networks.some((n) => address >= n.start && address < n.start + n.size)) return null;
    return `https://${host}:${port}`;
}

/**
 * `origin` as `https://<address>:<port>` when it is exactly that, with a dotted IPv4 address on a home
 * network: no name, IPv6, userinfo, path, query or fragment. Null for anything else.
 */
export function homeNetworkOrigin(origin: string): string | null {
    return ipv4Origin(origin, HOME_NETWORKS);
}

/** `https://<address>:<port>` with a dotted IPv4 address in 100.64.0.0/10; null for anything else. */
export function tailnetOrigin(origin: string): string | null {
    return ipv4Origin(origin, [TAILNET]);
}

/** `https://<relay id>.<relayDomain>` exactly, on 443; null for anything else, and always when no relay is built in. */
export function relayOrigin(origin: string, relayDomain: string | undefined = RELAY_DOMAIN): string | null {
    if (!relayDomain || !DOMAIN.test(relayDomain)) return null;
    const match = /^https:\/\/([^/.]+)\.([^/:?#@]+)\/?$/.exec(origin);
    if (!match || !RELAY_ID.test(match[1]) || match[2] !== relayDomain) return null;
    return `https://${match[1]}.${relayDomain}`;
}

/** A route the PC reported, checked by its kind; null when the kind is unknown or the origin isn't one that kind may name. */
export function routeOrigin(kind: unknown, origin: unknown, relayDomain: string | undefined = RELAY_DOMAIN): RouteOrigin | null {
    if (typeof origin !== 'string') return null;
    const checked =
        kind === 'home' ? homeNetworkOrigin(origin) : kind === 'tailnet' ? tailnetOrigin(origin) : kind === 'relay' ? relayOrigin(origin, relayDomain) : null;
    return checked ? { kind: kind as RouteKind, origin: checked } : null;
}
