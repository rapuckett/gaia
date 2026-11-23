// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { View } from 'react-native';

import { pluralKey } from '@webui/i18n/registry';
import { dateLocale } from '@webui/i18n/translator';
import { needsRetry, waitsForServerReturn } from '@webui/utils/documentFailure';
import { indexLimitHit, PASSAGES_AT_ONCE, SEARCHED_AT_ONCE } from '@webui/utils/docsLimits.core';
import { middleTruncate } from '@webui/utils/format';

import type { DocumentListResponse } from '@/api/client.types';
import { useDetachDocument, useDocuments, useSession } from '@/data';
import { ltr, useT } from '@/i18n/useT';
import { Button, Icon, IconButton, Ltr, Notice, Pressable, Row, Stack, Surface, Text } from '@/ui';
import { CircleAlert, CircleCheck, FileText, X } from '@/ui/icons';

import { failureNotice } from './failureText';

type LibraryDocument = DocumentListResponse['documents'][number];

const COLLAPSED_PILLS = 3;

/** The documents in this chat, under the header; renders nothing when there are none. */
export function DocsBar({ sessionId, onFailed, onManage }: { sessionId: string; onFailed: (failure: { text: string; detail?: string }) => void; onManage?: () => void }) {
    const t = useT();
    const session = useSession(sessionId);
    const library = useDocuments();
    const detach = useDetachDocument();
    const [expanded, setExpanded] = useState(false);

    const ids = new Set(session.data?.document_ids ?? []);
    const docs = (library.data?.documents ?? [])
        .filter((d) => ids.has(d.id))
        .sort((a, b) => (b.last_accessed_at || b.indexed_at || '').localeCompare(a.last_accessed_at || a.indexed_at || ''));
    if (docs.length === 0) return null;

    const failedDocs = docs.filter((d) => d.indexing_status === 'failed');
    const failedCount = failedDocs.length;
    const waitingCount = failedDocs.filter((d) => waitsForServerReturn(d.error_kind)).length;
    const retryCount = failedDocs.filter((d) => needsRetry(d.error_kind)).length;
    const unreadableCount = failedCount - waitingCount - retryCount;
    const summaryTone = unreadableCount + retryCount > 0 ? 'danger' : waitingCount > 0 ? 'warning' : 'success';
    const readable = docs.length - failedCount;
    const label = t.compose((say) =>
        [
            readable > 0 ? say(pluralKey('docsBar.count', readable), { n: readable }) : null,
            unreadableCount > 0 ? say(pluralKey('docsBar.failed', unreadableCount), { n: unreadableCount }) : null,
            waitingCount > 0 ? say(pluralKey('docsBar.serverWaiting', waitingCount), { n: waitingCount }) : null,
            retryCount > 0 ? say(pluralKey('docsBar.needsRetry', retryCount), { n: retryCount }) : null,
        ]
            .filter(Boolean)
            .join(' · '),
    );
    const byId = new Map(docs.map((d) => [d.id, d]));
    const loadOrder = (session.data?.document_ids ?? []).flatMap((id) => {
        const d = byId.get(id);
        return d && d.indexing_status !== 'failed' ? [d] : [];
    });
    const limitHit = indexLimitHit(loadOrder);
    const visible = expanded ? docs : docs.slice(0, COLLAPSED_PILLS);
    const hidden = docs.length - COLLAPSED_PILLS;

    const remove = (doc: LibraryDocument) =>
        detach.mutate(
            { sessionId, docId: doc.id },
            {
                onSuccess: () => {
                    if (docs.length - 1 <= COLLAPSED_PILLS) setExpanded(false);
                },
                onError: (err) => onFailed(failureNotice(err, t, { withReason: 'chat.detachFailed', noReason: 'mobileApp.chat.detachFailedShort' }, { name: ltr(doc.filename) })),
            },
        );

    return (
        <Stack paddingX="lg" paddingY="xs" gap="xs" testID="docs-bar">
            <Row gap="xs">
                <Icon icon={failedCount > 0 ? CircleAlert : CircleCheck} size="sm" tone={summaryTone} />
                <Text role="label" tone="secondary" accessibilityLabel={failedCount > 0 ? label : t.plural('docsBar.aria', readable)}>
                    {label}
                </Text>
            </Row>
            <Row gap="xs" wrap>
                {onManage ? (
                    <View style={{ minHeight: 48, justifyContent: 'center' }}>
                        <Button variant="secondary" size="sm" label={t('docsBar.manage')} onPress={onManage} testID="docs-manage" />
                    </View>
                ) : null}
                {visible.map((doc) => {
                    const failed = doc.indexing_status === 'failed';
                    return (
                        <Surface key={doc.id} tone="card" radius="full" border padding="xs">
                            <Row gap="xs">
                                <Icon icon={failed ? CircleAlert : FileText} size="sm" tone={failed ? (waitsForServerReturn(doc.error_kind) ? 'warning' : 'danger') : 'secondary'} />
                                <Pressable
                                    accessibilityLabel={failed ? t(waitsForServerReturn(doc.error_kind) ? 'docsBar.serverTitle' : needsRetry(doc.error_kind) ? 'docsBar.busyTitle' : 'docsBar.failedTitle', { name: doc.filename }) : doc.filename}
                                    minSize={32}
                                >
                                    <Ltr>{middleTruncate(doc.filename, 24)}</Ltr>
                                </Pressable>
                                <IconButton
                                    icon={X}
                                    size="sm"
                                    label={t('docsBar.remove', { name: doc.filename })}
                                    onPress={() => remove(doc)}
                                />
                            </Row>
                        </Surface>
                    );
                })}
                {!expanded && hidden > 0 ? (
                    <Button variant="secondary" size="sm" label={t('docsBar.more', { n: hidden })} onPress={() => setExpanded(true)} />
                ) : null}
                {expanded && hidden > 0 ? (
                    <Button variant="secondary" size="sm" label={t('docsBar.less')} onPress={() => setExpanded(false)} />
                ) : null}
            </Row>
            {limitHit ? (
                <Notice
                    tone="warning"
                    testID="docs-past-limit"
                    role="status"
                    message={
                        limitHit === 'size'
                            ? t('docsBar.pastSize', { passages: PASSAGES_AT_ONCE.toLocaleString(dateLocale(t)), n: readable })
                            : t('docsBar.pastCap', { limit: SEARCHED_AT_ONCE, n: readable })
                    }
                />
            ) : null}
        </Stack>
    );
}
