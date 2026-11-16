// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { isolate, isolateUnit } from '@webui/i18n/registry';

import { useAttachDocument, useCancelIndexing, useDocumentRemoval, useDocuments, useIndexingView, type IndexingSeed, useReindexDocument, useSession } from '@/data';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeErrorWith, useT } from '@/i18n/useT';
import { EmptyState, ErrorState, List, ListSkeleton, Notice, Row, Screen, Stack, Text, useTheme } from '@/ui';

import { AddDocuments, type AddStart, type StartMessage } from './AddDocuments';
import { DocumentRow } from './DocumentRow';
import { libraryStats } from './libraryStats';
import { loadFailedText } from './loadFailedText';
import { useNextChatDocs } from './nextChatDocs';
import { TargetChooser, type LibraryTarget } from './TargetChooser';

export interface DocumentsScreenProps {
    // The chat the library was opened from, if any.
    chatId?: string;
    // Opens the PC's file browser for a chat.
    onBrowseFiles?: (chatId: string) => void;
    // Opens a library document's preview and share screen, from the chat the library was opened from.
    onPreview?: (chatId: string, docId: string, name: string) => void;
    // Dev gallery only: opens the screen already in a transient state.
    initial?: LibraryStart;
}

export interface LibraryStart {
    target?: LibraryTarget;
    note?: StartMessage;
    // A failed action: the message and the error filled into it, translated like production's.
    error?: StartMessage & { cause: unknown };
    // A document id: its removal is waiting on Undo.
    removing?: string;
    add?: AddStart;
    // The text in the PC path box.
    path?: string;
    // A frozen clock and when each row began indexing, so the elapsed time is the same on every shot.
    indexing?: IndexingSeed;
}

function startError(t: ReturnType<typeof useT>, error: LibraryStart['error']): string | null {
    if (!error) return null;
    return t.compose((say) => say(error.key, { ...error.params, error: describeErrorWith(error.cause, say) }));
}

// A failed library action (remove, cancel) shows here until dismissed; only one shows at a time.
export function useActionError(first: string | null = null) {
    const [error, setError] = useState<string | null>(first);
    return { error, report: setError, dismiss: () => setError(null) };
}

interface OpenChat {
    id: string;
    /** Quoted, for messages. */
    name: string;
    title: string;
    documentIds: readonly string[];
}

export function DocumentsScreen({ chatId, onBrowseFiles, onPreview, initial }: DocumentsScreenProps) {
    return chatId ? <ChatLibrary chatId={chatId} onBrowseFiles={onBrowseFiles} onPreview={onPreview} initial={initial} /> : <Library chat={null} initial={initial} />;
}

function ChatLibrary({ chatId, onBrowseFiles, onPreview, initial }: { chatId: string; onBrowseFiles?: (chatId: string) => void; onPreview?: DocumentsScreenProps['onPreview']; initial?: LibraryStart }) {
    const t = useT();
    const session = useSession(chatId);
    const title = session.data?.title || t.bare('docs.untitledChat');
    return <Library chat={{ id: chatId, title, name: `“${title}”`, documentIds: session.data?.document_ids ?? [] }} onBrowseFiles={onBrowseFiles} onPreview={onPreview} initial={initial} />;
}

function Library({ chat, onBrowseFiles, onPreview, initial }: { chat: OpenChat | null; onBrowseFiles?: (chatId: string) => void; onPreview?: DocumentsScreenProps['onPreview']; initial?: LibraryStart }) {
    const t = useT();
    const { space } = useTheme();
    const query = useDocuments();
    const [target, setTarget] = useState<LibraryTarget>(initial?.target ?? 'chat');
    const action = useActionError(startError(t, initial?.error));
    const [note, setNote] = useState<string | null>(initial?.note ? t(initial.note.key, initial.note.params) : null);
    const attachDocument = useAttachDocument();
    const nextIds = useNextChatDocs((s) => s.ids);
    const addNext = useNextChatDocs((s) => s.add);
    // The open chat when documents go there, else null: the next new chat.
    const targetChat = chat && target === 'chat' ? chat : null;
    const removal = useDocumentRemoval((r, error) => action.report(t.compose((say) => say('docs.deleteFailed', { name: r.name, error: describeErrorWith(error, say) }))));
    const startRemoving = initial?.removing;
    useEffect(() => {
        if (startRemoving) removal.remove({ id: startRemoving, name: nameOfStart(query.data?.documents, startRemoving) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startRemoving, !!query.data]);
    const cancel = useCancelIndexing();
    const reindex = useReindexDocument();
    const all = query.data?.documents ?? [];
    const documents = all.filter((d) => d.id !== removal.pending?.id);
    const view = useIndexingView(all, initial?.indexing);
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
    const onAttach = (id: string) => {
        action.dismiss();
        setNote(null);
        if (!targetChat) {
            addNext([id]);
            setNote(t('docs.willAttach', { name: nameOf(id) }));
            return;
        }
        attachDocument.mutate(
            { sessionId: targetChat.id, docId: id },
            {
                onSuccess: () => setNote(t('docs.attached', { name: isolateUnit(nameOf(id)), chat: targetChat.name })),
                onError: (e) => action.report(t.compose((say) => say('docs.attachFailed', { name: nameOf(id), chat: targetChat.name, error: describeErrorWith(e, say) }))),
            },
        );
    };
    const attachedIds = targetChat ? targetChat.documentIds : nextIds;
    const loadFailed = query.isError ? loadFailedText(t, query.error) : null;
    const adder = <AddDocuments chatId={targetChat?.id ?? null} chatName={chat?.name ?? null} onStart={action.dismiss} onBrowse={onBrowseFiles} pcChatId={chat?.id ?? null} initialLine={initial?.add} initialPath={initial?.path} />;
    const retry = { label: t('docs.loadRetry'), onPress: () => void query.refetch() };

    return (
        <Screen header={<ScreenHeader title={t('docs.title')} />}>
            {query.data ? (
                <Stack gap="md" paddingX="lg" paddingY="sm">
                    <TargetChooser chatTitle={chat?.title ?? null} target={target} onChange={setTarget} />
                    {adder}
                </Stack>
            ) : null}
            {query.isPending ? <ListSkeleton rows={4} /> : null}
            {loadFailed && documents.length === 0 ? <ErrorState title={loadFailed.text} detail={loadFailed.detail} action={retry} /> : null}
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
                            {note ? <Notice tone="success" role="note" message={note} onDismiss={() => setNote(null)} /> : null}
                            {loadFailed ? <Notice tone="danger" message={loadFailed.text} detail={loadFailed.detail} action={retry} /> : null}
                            {action.error ? <Notice tone="danger" message={action.error} onDismiss={action.dismiss} dismissLabel={t('docs.dismissError')} /> : null}
                            {stats ? (
                                <Row gap="sm" wrap>
                                    <Text role="caption" tone="secondary">
                                        {`${stats.readable} · ${isolate(stats.size, 'ltr')}`}
                                    </Text>
                                    {stats.unreadable ? (
                                        <Text role="caption" tone="danger">
                                            {stats.unreadable}
                                        </Text>
                                    ) : null}
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
                            attach={attachedIds.includes(item.id) ? undefined : { chatName: targetChat?.name ?? null, onAttach }}
                            onPreview={chat && onPreview ? (docId, name) => onPreview(chat.id, docId, name) : undefined}
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

function nameOfStart(docs: readonly { id: string; filename: string }[] | undefined, id: string): string {
    return docs?.find((d) => d.id === id)?.filename ?? id;
}
