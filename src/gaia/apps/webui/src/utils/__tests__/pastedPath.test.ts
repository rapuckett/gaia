// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { cleanPastedPath } from '../pastedPath';

describe('cleanPastedPath', () => {
    it.each([
        ['"C:\\x\\y.pdf"', 'C:\\x\\y.pdf'],
        ['file:///home/a/b.pdf', '/home/a/b.pdf'],
        ['file:///C:/x/y.pdf', 'C:/x/y.pdf'],
        ['file:///Users/sam/My%20Docs/q3.pdf', '/Users/sam/My Docs/q3.pdf'],
        ['/home/a/b.pdf', '/home/a/b.pdf'],
        ['C:\\x\\y.pdf', 'C:\\x\\y.pdf'],
    ])('%s becomes %s', (raw, expected) => {
        expect(cleanPastedPath(raw)).toBe(expected);
    });
});
