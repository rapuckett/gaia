// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { DocumentListResponse } from '@/api/client.types';
import { translator } from '@/i18n/useT';

import { libraryStats } from './libraryStats';

type Doc = DocumentListResponse['documents'][number];

const doc = (indexing_status: string, error_kind: string | null = null) => ({ id: 'x', filename: 'a.pdf', file_size: 1, indexing_status, error_kind }) as unknown as Doc;

describe('libraryStats', () => {
    it('splits failures into waiting, to retry and unreadable, the last being the remainder', () => {
        const t = translator('en');
        const stats = libraryStats(
            [doc('complete'), doc('failed', 'model_server_down'), doc('failed', 'model_server_busy'), doc('failed', 'model_server_busy'), doc('failed', 'corrupted'), doc('failed')],
            t,
        )!;
        expect(stats.serverWaiting).toContain('1');
        expect(stats.needsRetry).toContain('2');
        expect(stats.unreadable).toContain('2');
        expect(stats.readable).toContain('1');
    });
});
