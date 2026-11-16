// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { missedPoll, newStartWatch, PICK_START_POLLS } from './downloadStart.core';

describe('missedPoll', () => {
    it('gives up after PICK_START_POLLS distinct refreshes, and counts a refresh once', () => {
        const watch = newStartWatch();
        for (let i = 1; i < PICK_START_POLLS; i++) {
            expect(missedPoll(watch, i)).toBe(false);
            expect(missedPoll(watch, i)).toBe(false);
        }
        expect(missedPoll(watch, PICK_START_POLLS)).toBe(true);
    });
});
