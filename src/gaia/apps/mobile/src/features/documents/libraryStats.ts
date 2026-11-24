// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { needsRetry, waitsForServerReturn } from '@webui/utils/documentFailure';
import { countText } from '@webui/utils/documentLibrary.core';
import { formatSize } from '@webui/utils/format';

import type { DocumentListResponse } from '@/api/client.types';
import type { Translate } from '@/i18n/useT';

type LibraryDoc = DocumentListResponse['documents'][number];

export interface LibraryStats {
    readable: string;
    unreadable: string | null;
    serverWaiting: string | null;
    needsRetry: string | null;
    size: string;
}

// The count, the unreadable count and the total size; null when the library is empty.
export function libraryStats(documents: readonly LibraryDoc[], t: Translate): LibraryStats | null {
    if (documents.length === 0) return null;
    const failed = documents.filter((d) => d.indexing_status === 'failed');
    const serverWaiting = failed.filter((d) => waitsForServerReturn(d.error_kind)).length;
    const retry = failed.filter((d) => needsRetry(d.error_kind)).length;
    const unreadable = failed.length - serverWaiting - retry;
    return {
        readable: countText(t, 'docs.count', documents.length - failed.length),
        unreadable: unreadable > 0 ? countText(t, 'docs.unreadable', unreadable) : null,
        serverWaiting: serverWaiting > 0 ? countText(t, 'docs.serverWaiting', serverWaiting) : null,
        needsRetry: retry > 0 ? countText(t, 'docs.needsRetry', retry) : null,
        size: formatSize(documents.reduce((sum, d) => sum + d.file_size, 0)),
    };
}
