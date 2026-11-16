// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import { translator } from '@/i18n/useT';

import { errorText } from './modelText';

describe('errorText', () => {
    it("keeps the PC's English reason in its own left-to-right island in Arabic", () => {
        const detail = "GAIA could not read this PC's graphics memory setting.";
        expect(errorText(new GaiaApiError(500, detail), translator('ar'))).toBe(`⁦${detail}⁩`);
    });
});
