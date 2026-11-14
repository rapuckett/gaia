// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { isolate } from '@webui/i18n/registry';

import { useDocuments } from '@/data';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeError, useT } from '@/i18n/useT';
import { Button, EmptyState, ErrorState, IconButton, List, ListSkeleton, Notice, Row, Screen, Stack, Text, useTheme } from '@/ui';
import { X } from '@/ui/icons';

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
    const documents = query.data?.documents ?? [];
    const stats = libraryStats(documents, t);
    const loadFailed = query.isError ? t('docs.loadFailed', { error: describeError(query.error, t) }) : null;
    const retry = { label: t('docs.loadRetry'), onPress: () => void query.refetch() };

    return (
        <Screen header={<ScreenHeader title={t('docs.title')} />}>
            {query.isPending ? <ListSkeleton rows={4} /> : null}
            {loadFailed && documents.length === 0 ? <ErrorState title={loadFailed} action={retry} /> : null}
            {query.data && documents.length === 0 ? <EmptyState title={t('docs.empty')} message={t('docs.emptyHintPhone')} /> : null}
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
                    renderItem={({ item }) => <DocumentRow document={item} />}
                />
            ) : null}
        </Screen>
    );
}
