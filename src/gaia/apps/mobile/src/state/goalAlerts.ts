// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The id prefix the web's goal-health store files its notifications under. */
export const GOAL_STORE_NOTIFICATION_ID = 'goal-store-error-';

/**
 * One alert per distinct goal-store failure, not one per poll; `recovered` fires when the store reads again.
 * Takes each health read's `error` (null when the store reads); a failed read never reaches it.
 */
export function createGoalHealthAnnouncer(
    raise: (error: string, count: number) => void,
    recovered: () => void,
): (error: string | null) => void {
    let current: string | null = null;
    let count = 0;
    return (error) => {
        if (error && error !== current) raise(error, ++count);
        if (!error) recovered();
        current = error;
    };
}
