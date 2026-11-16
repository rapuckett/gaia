// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { bracketParts, glossParts } from '@webui/i18n/registry';

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

    it('keeps the English reason in its own isolate, closed before the gloss opens', () => {
        const detail = 'The PC didn’t answer.';
        const [own, gloss] = bracketParts(loadFailedText(translator('ar'), new GaiaApiError(500, detail)));
        expect(own).toBe(`\u2067تعذّر تحميل مستنداتك: \u2068${detail}\u2069\u2069`);
        expect(gloss?.startsWith('\u2066(')).toBe(true);
    });
});
