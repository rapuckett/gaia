// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import { translator } from '@/i18n/useT';

import { failureNotice, MAINTENANCE_ACTIONS } from './maintenance';

describe('maintenance failureNotice', () => {
    const t = translator('en');

    it('puts the PC text on the detail line for every action, not in the sentence', () => {
        for (const action of MAINTENANCE_ACTIONS) {
            const n = failureNotice(action, new GaiaApiError(500, 'Database is locked'), t);
            expect(n.tone).toBe('danger');
            expect(n.detail).toBe('Database is locked');
            expect(n.text).not.toContain('locked');
            expect(n.text).toMatch(/^Couldn't .*\.$/);
        }
    });
});
