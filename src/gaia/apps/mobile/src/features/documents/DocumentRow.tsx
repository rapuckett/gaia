// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { isolate } from '@webui/i18n/registry';
import {
    PERMANENT_FAILURE_HINTS,
    elapsed,
    formatFullTimestamp,
    formatTimestamp,
    isIndexing,
    progressLabel,
    progressPercent,
    splitFailureReason,
} from '@webui/utils/documentLibrary.core';
import { formatSize, middleTruncate } from '@webui/utils/format';

import type { DocumentListResponse, IndexProgress } from '@/api/client.types';
import { useT } from '@/i18n/useT';
import { Badge, Button, Disclosure, Icon, IconButton, ListRow, ProgressLine, Row, Stack, Text } from '@/ui';
import { FileText, RotateCcw, Square, Trash2 } from '@/ui/icons';

interface DocumentRowProps {
    document: DocumentListResponse['documents'][number];
    /** Set while the PC reports how far indexing has got. */
    progress?: IndexProgress;
    /** When the row was first seen indexing, and now, both epoch ms. */
    startedAt?: number;
    now: number;
    retrying: boolean;
    onCancel: (docId: string) => void;
    onRetry: (docId: string) => void;
    onRemove: (docId: string) => void;
}

// Name (extension kept), then the state: size and when it was indexed, how far indexing has got, or why it failed.
export function DocumentRow({ document: doc, progress, startedAt, now, retrying, onCancel, onRetry, onRemove }: DocumentRowProps) {
    const t = useT();
    const [reasonOpen, setReasonOpen] = useState(false);
    const status = doc.indexing_status || 'complete';
    const indexed = doc.indexed_at ? formatTimestamp(doc.indexed_at, t) : '';
    const full = doc.indexed_at ? formatFullTimestamp(doc.indexed_at, t) : '';
    const size = isolate(formatSize(doc.file_size), 'ltr');
    const running = isIndexing(status);
    const hint = doc.error_kind ? PERMANENT_FAILURE_HINTS[doc.error_kind] : undefined;
    const reason = doc.last_error ? splitFailureReason(doc.last_error) : null;
    const pct = progress ? progressPercent(progress) : null;
    const indexingText = startedAt ? t.hint(t('docs.indexingLabel'), elapsed(startedAt, now)) : t('docs.indexing');

    const badge =
        status === 'failed' ? (
            <Badge tone="danger" label={hint ? t('docs.cantRead') : t('docs.failed')} />
        ) : status === 'cancelled' ? (
            <Badge tone="neutral" label={t('docs.cancelled')} />
        ) : status === 'missing' ? (
            <Badge tone="warning" label={t('docs.missing')} />
        ) : null;

    const trailing = running ? (
        <Button size="sm" variant="secondary" icon={Square} label={t('docs.cancel')} onPress={() => onCancel(doc.id)} />
    ) : (
        <Row gap="xs">
            {status === 'failed' ? (
                <Button
                    size="sm"
                    variant={hint ? 'ghost' : 'secondary'}
                    icon={RotateCcw}
                    label={retrying ? t('docs.retrying') : t('docs.retry')}
                    disabled={retrying}
                    onPress={() => onRetry(doc.id)}
                />
            ) : null}
            <IconButton icon={Trash2} label={t('docs.removeAria', { name: doc.filename })} size="sm" onPress={() => onRemove(doc.id)} />
        </Row>
    );

    return (
        <Stack>
            <ListRow
                title={isolate(middleTruncate(doc.filename), 'ltr')}
                subtitle={running || badge ? undefined : indexed ? `${size} · ${indexed}` : size}
                leading={<Icon icon={FileText} size="md" tone="secondary" />}
                trailing={trailing}
                accessibilityLabel={full ? `${doc.filename}, ${size}, ${t('docs.indexedAt', { time: full })}` : doc.filename}
            />
            {badge ? (
                <Stack paddingX="lg" paddingY="xs">
                    {badge}
                </Stack>
            ) : null}
            {running ? (
                <Stack paddingX="lg" paddingY="xs">
                    <ProgressLine
                        value={pct === null ? undefined : pct / 100}
                        label={progress ? `${progressLabel(progress, t)}${pct === null ? '' : ` · ${isolate(String(pct), 'ltr')}%`}` : indexingText}
                    />
                </Stack>
            ) : null}
            {status === 'failed' ? (
                <Stack gap="xs" paddingX="lg" paddingY="xs">
                    {hint ? <Text role="caption" tone="secondary">{hint}</Text> : null}
                    {reason && reason.more ? (
                        <Disclosure title={reason.summary} open={reasonOpen} onToggle={() => setReasonOpen((o) => !o)}>
                            <Text role="caption" tone="secondary">{reason.more}</Text>
                        </Disclosure>
                    ) : reason ? (
                        <Text role="caption" tone="secondary">{reason.summary}</Text>
                    ) : !hint ? (
                        <Text role="caption" tone="secondary">{t('docs.noReason')}</Text>
                    ) : null}
                </Stack>
            ) : null}
        </Stack>
    );
}
