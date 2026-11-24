// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ConnectionConfig } from '@/state/connection';

import type { PairingInvite } from './invite';

/** A PC this phone is paired with. `connection` is what the app talks to it with. */
export interface PairedPc {
    id: string;
    name: string;
    connection: ConnectionConfig;
    /** When this phone was last allowed by the PC, ISO 8601; absent for a PC paired before it was kept. */
    pairedAt?: string;
    /** The id this PC knows this phone by; absent only in a build with no pairing (dev scenes). */
    deviceId?: string;
}

/**
 * Where redeeming stands. `refused` is deliberately uniform: the PC doesn't say why (expired, used,
 * wrong, closed), and neither does the phone. `rateLimited` is the one distinct answer (HTTP 429).
 * `unreachable` is no answer at all: pairing is off on the PC, or it isn't on this network.
 */
export type PairingStatus =
    | { state: 'none' }
    | { state: 'pending'; pcName: string; expiresAt?: number }
    | { state: 'paired'; pc: PairedPc }
    | { state: 'refused'; rateLimited?: boolean }
    | { state: 'unreachable' };

export type RedeemResult = Exclude<PairingStatus, { state: 'none' }>;

/**
 * A paired PC asked again whether it still knows this phone, over TLS pinned to the certificate saved at pairing.
 * `known` is only ever a 2xx over that pin. `unknown`: it refused this phone's token, or every address showed another
 * certificate. `unreachable`: anything else, so nothing is decided.
 */
export type PcRecheck = { state: 'known' } | { state: 'unknown' } | { state: 'unreachable' };

/**
 * The seam between the pairing screens and the pinned-TLS transport. Mobile's real implementation
 * redeems over the pinned connection and keeps the token natively; the screens never see either.
 */
export interface PairingService {
    /** Redeem a parsed invitation. Resolves `pending` until the person chooses Allow on the PC. */
    redeem(invite: PairingInvite): Promise<RedeemResult>;
    /** Where the last redemption stands, `none` when there isn't one. */
    status(): Promise<PairingStatus>;
    /** Give up waiting for Allow, and tell the PC when it can be told. */
    cancel(): Promise<void>;
    /** Every PC this phone is paired with. */
    list(): Promise<PairedPc[]>;
    /** Make this paired PC the one the app talks to. */
    use(pcId: string): Promise<void>;
    /**
     * Unpair. Resolves once the PC is gone from this phone (its token and pin out of use, the app off it, no other PC
     * made current); telling the PC (`DELETE /api/devices/me`) and turning push off follow in the background.
     */
    forget(pcId: string): Promise<void>;
    /** Asks the PC whether it still knows this phone; `known` also makes the address that answered the one in use. */
    recheck(pcId: string, signal?: AbortSignal): Promise<PcRecheck>;
}
