// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { PairingError, type PairingOffer } from './pairing.types';

// The PC's limits for a pairing code (gaia/ui/devices): offered networks, name length, sizes.
const PC_NAME_MAX = 64;
const PIN = /^[0-9a-f]{64}$/;
const INVITE = /^[A-Za-z0-9_-]{22}$/;
const ORIGIN = /^https:\/\/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/;

function offeredAddress(origin: unknown): boolean {
    const m = typeof origin === 'string' ? ORIGIN.exec(origin) : null;
    if (!m) return false;
    const [a, b, c, d, port] = m.slice(1).map(Number) as [number, number, number, number, number];
    if ([a, b, c, d].some((n) => n > 255) || port < 1 || port > 65535) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function nonEmpty(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/** The PC's pairing code, from its QR code or pasted; PairingError('invalid_code' | 'expired') otherwise. */
export function parseOffer(text: string, nowMs: number = Date.now()): PairingOffer {
    let raw: unknown;
    try {
        raw = JSON.parse(text.trim());
    } catch {
        throw new PairingError('invalid_code', "This isn't a GAIA pairing code.");
    }
    const o = (raw ?? {}) as Record<string, unknown>;
    const valid =
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        o.v === 1 &&
        nonEmpty(o.name, PC_NAME_MAX) &&
        nonEmpty(o.pc_id, 256) &&
        Array.isArray(o.origins) &&
        o.origins.length > 0 &&
        o.origins.every(offeredAddress) &&
        typeof o.pin === 'string' &&
        PIN.test(o.pin) &&
        typeof o.invite === 'string' &&
        INVITE.test(o.invite) &&
        typeof o.exp === 'number' &&
        Number.isFinite(o.exp);
    if (!valid) throw new PairingError('invalid_code', "This isn't a GAIA pairing code, or it's from a newer GAIA.");
    const offer: PairingOffer = {
        v: 1,
        name: o.name as string,
        pc_id: o.pc_id as string,
        origins: o.origins as string[],
        pin: o.pin as string,
        invite: o.invite as string,
        exp: o.exp as number,
    };
    if (offer.exp * 1000 <= nowMs) throw new PairingError('expired', 'This pairing code has expired. Show a new one on the PC.');
    return offer;
}
