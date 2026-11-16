// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { glossParts } from '@webui/i18n/registry';

import { GaiaApiError } from '@/api/errors';
import { translator } from '@/i18n/useT';

import { loadFailedText } from './loadFailedText';

describe('loadFailedText', () => {
    it('carries the PC reason once in the Arabic sentence, not inside the English gloss wrapper sentence', () => {
        const detail = 'The PC didn’t answer.';
        const text = loadFailedText(translator('ar'), new GaiaApiError(500, detail));
        const parts = glossParts(text) ?? [];
        const own = parts.filter((p) => !p.gloss).map((p) => p.text).join('');
        expect(own.split(detail)).toHaveLength(2);
        expect(own).not.toContain('500');
        expect(text).not.toContain('GAIA answered with an error');
    });
});
