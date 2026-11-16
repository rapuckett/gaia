// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import { translator } from '@/i18n/useT';

import { lostContactText } from './lostContactText';

describe('lostContactText', () => {
    it('holds the PC reason once, as its own detail, in Arabic', () => {
        const reason = 'Service unavailable: try again soon';
        const { text, detail } = lostContactText(translator('ar'), new GaiaApiError(503, reason));
        expect(detail).toBe(reason);
        expect(text).not.toContain(reason);
    });
});
