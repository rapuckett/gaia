// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import { translator } from '@/i18n/useT';

import { loadFailedText } from './loadFailedText';

describe('loadFailedText', () => {
    it('keeps the PC reason out of the sentence and returns it as the detail', () => {
        const detail = 'The PC didn’t answer.';
        const t = translator('ar');
        const { text, detail: got } = loadFailedText(t, new GaiaApiError(500, detail));
        expect(text).toBe(t('docs.loadFailedNoReason'));
        expect(text).not.toContain(detail);
        expect(got).toBe(detail);
    });

    it('keeps an error the app translates itself inline in the sentence', () => {
        const { text, detail } = loadFailedText(translator('ar'), new GaiaNetworkError('http://pc', new Error('offline')));
        expect(detail).toBeUndefined();
        expect(text).not.toContain('GAIA answered with an error');
        expect(text.length).toBeGreaterThan(0);
    });
});
