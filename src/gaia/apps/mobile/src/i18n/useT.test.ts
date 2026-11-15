// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaNetworkError } from '@/api/errors';

import { describeError, technicalDetail, translator } from './useT';

describe('nested error messages', () => {
    const error = new GaiaNetworkError('http://127.0.0.1:4210/api/setup/check', new Error('fetch failed'));

    it('brackets an Arabic error once, with no URL or raw cause', () => {
        const t = translator('ar');
        const text = t('setup.unknown.failed', { error: describeError(error, t, true) });
        expect(text.split('(').length - 1).toBe(1);
        expect(text).not.toContain('127.0.0.1');
        expect(text).not.toContain('fetch failed');
        expect(technicalDetail(error)).toContain('fetch failed');
    });
});
