// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { isolate } from '@webui/i18n/registry';

import { useCancelIndexing, useDocumentRemoval, useDocuments, useIndexingView, useReindexDocument } from '@/data';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeErrorWith, useT } from '@/i18n/useT';
import { EmptyState, ErrorState, IconButton, List, ListSkeleton, Notice, Row, Screen, Stack, Text, useTheme } from '@/ui';
import { X } from '@/ui/icons';

import { AddDocuments, ChatAddDocuments } from './AddDocuments';
import { DocumentRow } from './DocumentRow';
import { libraryStats } from './libraryStats';
import { ChatTargetChooser, TargetChooser, type LibraryTarget } from './TargetChooser';

export interface DocumentsScreenProps {
    // The chat the library was opened from, if any.
    chatId?: string;
}

// A failed library action (remove, cancel) shows here until dismissed; only one shows at a time.
export function useActionError() {
    const [error, setError] = useState<string | null>(null);
    return { error, report: setError, dismiss: () => setError(null) };
}

export function DocumentsScreen({ chatId }: DocumentsScreenProps) {
    const t = useT();
    const { space } = useTheme();
    const query = useDocuments();
    const [target, setTarget] = useState<LibraryTarget>('chat');
    const action = useActionError();
    const removal = useDocumentRemoval((r, error) => action.report(t.compose((say) => say('docs.deleteFailed', { name: r.name, error: describeErrorWith(error, say) }))));
    const cancel = useCancelIndexing();
    const reindex = useReindexDocument();
    const all = query.data?.documents ?? [];
    const documents = all.filter((d) => d.id !== removal.pending?.id);
    const view = useIndexingView(all);
    const stats = libraryStats(documents, t);
    const nameOf = (id: string) => all.find((d) => d.id === id)?.filename ?? id;
    const onCancel = (id: string) => {
        action.dismiss();
        cancel.mutate(id, { onError: (e) => action.report(t.compose((say) => say('docs.cancelFailed', { name: nameOf(id), error: describeErrorWith(e, say) }))) });
    };
    const onRetry = (id: string) => {
        action.dismiss();
        reindex.mutate(id, { onError: (e) => action.report(t.compose((say) => say('docs.retryFailed', { name: nameOf(id), error: describeErrorWith(e, say) }))) });
    };
    const onRemove = (id: string) => {
        action.dismiss();
        removal.remove({ id, name: nameOf(id) });
    };
    const loadFailed = query.isError ? t.compose((say) => say('docs.loadFailed', { error: describeErrorWith(query.error, say) })) : null;
    const adder = chatId ? (
        <ChatAddDocuments chatId={chatId} target={target} onStart={action.dismiss} />
    ) : (
        <AddDocuments chatId={null} chatName={null} onStart={action.dismiss} />
    );
    const retry = { label: t('docs.loadRetry'), onPress: () => void query.refetch() };

    return (
        <Screen header={<ScreenHeader title={t('docs.title')} />}>
            {query.data ? (
                <Stack paddingX="lg" paddingY="sm">
                    {adder}
                </Stack>
            ) : null}
            {query.isPending ? <ListSkeleton rows={4} /> : null}
            {loadFailed && documents.length === 0 ? <ErrorState title={loadFailed} action={retry} /> : null}
            {query.data && documents.length === 0 ? <EmptyState title={t('docs.empty')} message={t('docs.emptyHintPhone')} /> : null}
            {removal.pending ? (
                <Stack paddingX="lg" paddingY="sm">
                    <Notice
                        tone="info"
                        role="note"
                        message={t('docs.removed', { name: isolate(removal.pending.name, 'ltr') })}
                        action={{ label: t('docs.undo'), onPress: removal.undo }}
                    />
                </Stack>
            ) : null}
            {documents.length > 0 ? (
                <List
                    data={documents}
                    keyExtractor={(d) => d.id}
                    accessibilityLabel={t('docs.title')}
                    contentContainerStyle={{ paddingBottom: space.xl }}
                    ListHeaderComponent={
                        <Stack gap="sm" paddingX="lg" paddingY="sm">
                            {chatId ? (
                                <ChatTargetChooser chatId={chatId} target={target} onChange={setTarget} />
                            ) : (
                                <TargetChooser chatTitle={null} target={target} onChange={setTarget} />
                            )}
                            {loadFailed ? <Notice tone="danger" message={loadFailed} action={retry} /> : null}
                            {action.error ? (
                                <Row gap="sm" align="start">
                                    <Stack flex={1}>
                                        <Notice tone="danger" message={action.error} />
                                    </Stack>
                                    <IconButton icon={X} label={t('docs.dismissError')} onPress={action.dismiss} />
                                </Row>
                            ) : null}
                            {stats ? (
                                <Row gap="sm" wrap>
                                    <Text role="caption" tone="secondary">
                                        {stats.readable}
                                    </Text>
                                    {stats.unreadable ? (
                                        <Text role="caption" tone="danger">
                                            {stats.unreadable}
                                        </Text>
                                    ) : null}
                                    <Text role="caption" tone="secondary">
                                        {`· ${isolate(stats.size, 'ltr')}`}
                                    </Text>
                                </Row>
                            ) : null}
                        </Stack>
                    }
                    renderItem={({ item }) => (
                        <DocumentRow
                            document={item}
                            progress={view.progress[item.id]}
                            startedAt={view.startedAt[item.id]}
                            now={view.now}
                            retrying={reindex.isPending && reindex.variables === item.id}
                            onCancel={onCancel}
                            onRetry={onRetry}
                            onRemove={onRemove}
                        />
                    )}
                />
            ) : null}
        </Screen>
    );
}
