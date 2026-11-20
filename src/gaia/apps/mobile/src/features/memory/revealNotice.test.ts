// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { minimalScrollDelta } from './revealNotice';

describe('minimalScrollDelta', () => {
    it('does not scroll when the item is fully visible', () => {
        expect(minimalScrollDelta(100, 600, 300, 80)).toBe(0);
        expect(minimalScrollDelta(100, 600, 620, 80)).toBe(0);
    });
    it('scrolls down by only the clipped part', () => {
        expect(minimalScrollDelta(100, 600, 650, 80)).toBe(30);
    });
    it('scrolls up by only the clipped part', () => {
        expect(minimalScrollDelta(100, 600, 70, 80)).toBe(-30);
    });
    it('lines a too-tall item up with the top edge', () => {
        expect(minimalScrollDelta(100, 50, 120, 80)).toBe(20);
    });
});
