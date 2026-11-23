// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { cleanPcText } from './pcText';

describe("a PC's text before it's shown", () => {
    it('drops bidi overrides, collapses controls and whitespace, and caps the length', () => {
        expect(cleanPcText('  Plan\u202E\u0007 for\n\tQ3 ', 80)).toBe('Plan for Q3');
        expect(cleanPcText('\u2066x\u2069', 80)).toBe('x');
        expect(cleanPcText('x'.repeat(400), 300)).toBe(`${'x'.repeat(299)}…`);
        expect(cleanPcText('é'.repeat(5), 5)).toBe('ééééé');
    });
});
