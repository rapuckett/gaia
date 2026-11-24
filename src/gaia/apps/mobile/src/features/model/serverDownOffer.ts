// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LemonadeTarget, LocalModelStatus } from '@/api/client.types';

export interface ServerDownOffer {
    /** GAIA's own server: it can be started. */
    start: boolean;
    /** The PC points at another server GAIA may leave (LEMONADE_BASE_URL outranks a saved choice, so only unsetting it switches). */
    useOwn: boolean;
    /** Not GAIA's server and not switchable: the user starts it on the PC. */
    notOurs: boolean;
}

/** Whether the PC's choice of model server has been read: it can't be judged while loading or after a failed read. */
export type TargetRead = 'loading' | 'failed' | 'read';

/** What the PC's own notice offers, from the same two reads; nothing about the target's owner is claimed until it is read. */
export function serverDownOffer(status: LocalModelStatus | undefined, target: LemonadeTarget | undefined, read: TargetRead = 'read'): ServerDownOffer {
    const start = status?.owner === 'gaia';
    const known = read === 'read' && !!target;
    const useOwn = known && !start && target.mode === 'external' && target.source !== 'env';
    return { start, useOwn, notOurs: known && !!status && !start && !useOwn };
}
