// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { stripIsolates } from '@webui/i18n/registry';
import type { AboutYouItem } from '@webui/utils/memoryFormat.core';

import { translator } from '@/i18n/useT';

import { memoryMeta } from './MemoryRow';

const FSI = '⁨';
const item = { source: 'user', updated_at: '2020-08-18T09:00:00' } as AboutYouItem;

describe('memoryMeta', () => {
    it('keeps the date whole in both halves of the Arabic line', () => {
        const meta = memoryMeta(item, translator('ar'));
        const english = 'Aug 18, 2020';
        expect(meta.split(`${FSI}${english}`)).toHaveLength(2);
        expect(stripIsolates(meta).replace(/ /g, ' ')).toContain('Aug 18, 2020');
    });

    it('does not isolate a relative day', () => {
        const now = new Date().toISOString();
        expect(memoryMeta({ ...item, updated_at: now }, translator('en'))).not.toContain(' ');
    });
});
