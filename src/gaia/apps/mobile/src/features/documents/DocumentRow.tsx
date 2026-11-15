// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import { formatFullTimestamp, formatTimestamp } from '@webui/utils/documentLibrary.core';
import { formatSize, middleTruncate } from '@webui/utils/format';

import type { DocumentListResponse } from '@/api/client.types';
import { useT } from '@/i18n/useT';
import { Icon, ListRow } from '@/ui';
import { FileText } from '@/ui/icons';

interface DocumentRowProps {
    document: DocumentListResponse['documents'][number];
}

// Name (extension kept), size and when it was indexed; the full time is in the spoken label.
export function DocumentRow({ document: doc }: DocumentRowProps) {
    const t = useT();
    const indexed = doc.indexed_at ? formatTimestamp(doc.indexed_at, t) : '';
    const full = doc.indexed_at ? formatFullTimestamp(doc.indexed_at, t) : '';
    const size = isolate(formatSize(doc.file_size), 'ltr');
    return (
        <ListRow
            title={isolate(middleTruncate(doc.filename), 'ltr')}
            subtitle={indexed ? `${size} · ${indexed}` : size}
            leading={<Icon icon={FileText} size="md" tone="secondary" />}
            accessibilityLabel={full ? `${doc.filename}, ${size}, ${t('docs.indexedAt', { time: full })}` : doc.filename}
        />
    );
}
