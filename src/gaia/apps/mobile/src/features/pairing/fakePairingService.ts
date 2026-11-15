// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { PairingInvite } from './invite';
import type { PairingService, PairingStatus, RedeemResult } from './service';

export interface FakePairingOptions {
    /** What redeeming ends in. `paired` goes through `pending` first, as the PC makes the person choose Allow. */
    outcome?: 'paired' | 'refused' | 'unreachable';
    /** Status polls that answer `pending` before the outcome. */
    pendingPolls?: number;
}

/** A PairingService with no network, for development and tests. */
export function createFakePairingService({ outcome = 'paired', pendingPolls = 2 }: FakePairingOptions = {}): PairingService {
    let invite: PairingInvite | null = null;
    let polls = 0;

    const settled = (): RedeemResult => {
        if (outcome === 'refused') return { state: 'refused' };
        if (outcome === 'unreachable') return { state: 'unreachable' };
        return {
            state: 'paired',
            pc: { id: invite!.pc_id, name: invite!.name, connection: { baseUrl: invite!.origins[0] } },
        };
    };

    return {
        async redeem(next) {
            invite = next;
            polls = 0;
            if (outcome !== 'paired') {
                const result = settled();
                invite = null;
                return result;
            }
            return { state: 'pending', pcName: next.name, expiresAt: next.exp };
        },
        async status(): Promise<PairingStatus> {
            if (!invite) return { state: 'none' };
            if (++polls <= pendingPolls) return { state: 'pending', pcName: invite.name, expiresAt: invite.exp };
            return settled();
        },
        async cancel() {
            invite = null;
        },
    };
}
