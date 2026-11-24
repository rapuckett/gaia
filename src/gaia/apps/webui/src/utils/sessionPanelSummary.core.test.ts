// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { commandsSummary, environmentOffline, outputsCount, planProgress } from './sessionPanelSummary.core';

describe('sessionPanelSummary.core', () => {
    it('counts finished plan steps', () => {
        expect(planProgress({ steps: ['a', 'b', 'c'], statuses: ['done', 'done', 'running'] })).toEqual({ done: 2, total: 3 });
    });

    it('names failures before the total', () => {
        expect(commandsSummary([{ state: 'ok' }, { state: 'failed' }, { state: 'declined' }])).toEqual({ kind: 'failed', n: 1 });
        expect(commandsSummary([{ state: 'ok' }, { state: 'declined' }])).toEqual({ kind: 'count', n: 2 });
    });

    it('shows an outputs count and the offline note only when they apply', () => {
        expect(outputsCount([])).toBeNull();
        expect(outputsCount([1, 2])).toBe(2);
        expect(environmentOffline(undefined)).toBe(false);
        expect(environmentOffline({ internet: false })).toBe(true);
    });
});
