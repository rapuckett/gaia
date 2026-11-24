// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { contextPct, meterVisible, METER_SHOWN_ABOVE_PCT } from './contextMeter.core';

describe('context meter visibility', () => {
    it('is hidden at or below half full and shown above it', () => {
        expect(METER_SHOWN_ABOVE_PCT).toBe(50);
        expect(meterVisible(49, false, false)).toBe(false);
        expect(meterVisible(50, false, false)).toBe(false);
        expect(meterVisible(51, false, false)).toBe(true);
    });

    it('stays shown with turns at risk or its details open', () => {
        expect(meterVisible(10, true, false)).toBe(true);
        expect(meterVisible(10, false, true)).toBe(true);
    });

    it('rounds the fill and caps it at 100', () => {
        expect(contextPct({ used: 3, window: 8 })).toBe(38);
        expect(contextPct({ used: 20, window: 8 })).toBe(100);
    });
});
