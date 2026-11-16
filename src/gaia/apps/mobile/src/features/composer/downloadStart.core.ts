// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Model-list refreshes with no sign of the download before it counts as never started (the web's PICK_START_POLLS). */
export const PICK_START_POLLS = 5;

export interface StartWatch {
    polls: number;
    /** `dataUpdatedAt` of the last list counted, so one refresh counts once however often the effect runs. */
    seen: number;
}

export const newStartWatch = (): StartWatch => ({ polls: 0, seen: 0 });

/** Counts the list refresh at `updatedAt` once; true when enough refreshes have passed with no download in sight. */
export function missedPoll(watch: StartWatch, updatedAt: number): boolean {
    if (watch.seen !== updatedAt) {
        watch.seen = updatedAt;
        watch.polls += 1;
    }
    return watch.polls >= PICK_START_POLLS;
}
