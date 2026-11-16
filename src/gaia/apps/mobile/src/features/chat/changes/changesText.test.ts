// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { SessionChanges } from '@/api/client.types';
import { translator } from '@/i18n/useT';

import { summaryText, totalText } from './changesText';

const changes = { totals: { files: 4, additions: 52, deletions: 22, uncounted: 0 } } as SessionChanges;

describe('Changes totals in Arabic', () => {
    it.each([
        ['total', totalText],
        ['summary', summaryText],
    ])('keep the %s signed counts as one left-to-right run', (_name, build) => {
        const text = build(changes, translator('ar'));
        expect(text).toContain('⁦+52 −22⁩');
    });
});
