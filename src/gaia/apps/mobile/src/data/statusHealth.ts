// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { STATUS_LOST_MS, STATUS_SLOW_STREAK } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';

/** How one status request ended, as webui's `StatusOutcome` (services/statusPoll.ts). */
export type StatusOutcome = 'ok' | 'slow' | 'error' | 'unreachable';

export interface StatusHealth {
    /** The PC answers, but late: show the slow banner. */
    slow: boolean;
    /** It has only answered slowly for STATUS_LOST_MS: as good as gone. */
    lost: boolean;
}

const CLEAR: StatusHealth = { slow: false, lost: false };

/** A timeout or a gateway's 504 is slow; a refused request is unreachable; any other HTTP error is a failing PC. */
export function classifyStatusError(error: unknown, timedOut: boolean): StatusOutcome {
    if (timedOut) return 'slow';
    if (error instanceof GaiaApiError) return error.status === 504 ? 'slow' : error.status === 502 ? 'unreachable' : 'error';
    return 'unreachable';
}

/**
 * The rule of webui's `applyStatus` (App.tsx): slow after STATUS_SLOW_STREAK slow outcomes in a row,
 * or one straight after an outage; unreachable once the slow run lasts STATUS_LOST_MS.
 * React Query's `errorUpdateCount` never resets on success, so the streak lives here.
 */
export function createStatusHealth(now: () => number = Date.now) {
    let streak = 0;
    let since: number | null = null;
    let afterOutage = false;
    let health = CLEAR;
    const listeners = new Set<() => void>();

    const set = (next: StatusHealth) => {
        if (next.slow === health.slow && next.lost === health.lost) return;
        health = next;
        listeners.forEach((l) => l());
    };

    return {
        record(outcome: StatusOutcome): void {
            if (outcome !== 'slow') {
                afterOutage = outcome === 'unreachable';
                streak = 0;
                since = null;
                set(CLEAR);
                return;
            }
            streak += 1;
            since ??= now();
            if (now() - since >= STATUS_LOST_MS) {
                set({ slow: false, lost: true });
                return;
            }
            set({ slow: afterOutage || streak >= STATUS_SLOW_STREAK, lost: false });
        },
        get: (): StatusHealth => health,
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
    };
}

export type StatusHealthTracker = ReturnType<typeof createStatusHealth>;
