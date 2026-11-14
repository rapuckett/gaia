// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useState } from 'react';

import { APP_NAME } from '@webui/utils/constants';

import { useSessions, useSessionSearch } from '@/data';
import { ModelStatusPill } from '@/features/model';
import { describeError, useT } from '@/i18n/useT';
import {
    EmptyState,
    ErrorState,
    Icon,
    IconButton,
    ListRow,
    ListSkeleton,
    Notice,
    Row,
    Screen,
    SectionHeader,
    SectionList,
    Spacer,
    Stack,
    StatusDot,
    Text,
    TextField,
} from '@/ui';
import { EyeOff, Plus, X } from '@/ui/icons';

import { SearchResultRow } from './SearchResultRow';
import { useNow } from './useNow';
import {
    buildChatSections,
    chatListState,
    rowErrorMessage,
    rowText,
    searchedSessions,
    statusTone,
    type ChatRow,
    type ChatSection,
    type LiveRuns,
    type QueuedMessage,
    type RowErrorKind,
} from './chatList';

export interface ChatListError {
    kind: RowErrorKind;
    error: unknown;
}

export interface ChatDrawerContentProps {
    activeId?: string | null;
    /** Opens the chat; the drawer closes itself after the pick. */
    onSelect: (sessionId: string) => void;
    onClose: () => void;
    /** Shows a New chat button in the header when given. */
    onNewChat?: () => void;
    live?: LiveRuns;
    queues?: Readonly<Record<string, readonly QueuedMessage[]>>;
    /** The last failed row action, shown as an alert until the next one succeeds. */
    error?: ChatListError | null;
}

export function ChatDrawerContent({ activeId, onSelect, onClose, onNewChat, live, queues, error }: ChatDrawerContentProps) {
    const t = useT();
    const sessions = useSessions();
    const now = useNow();
    const [text, setText] = useState('');
    const search = useSessionSearch(text);
    const q = text.trim();
    // Opening a chat or leaving the drawer ends the search.
    const select = useCallback((id: string) => {
        setText('');
        onSelect(id);
    }, [onSelect]);
    const close = useCallback(() => {
        setText('');
        onClose();
    }, [onClose]);
    const newChat = useCallback(() => {
        setText('');
        onNewChat?.();
    }, [onNewChat]);
    const hits = useMemo(
        () => new Map(search.query === q ? (search.data?.results ?? []).map((r) => [r.session_id, r]) : []),
        [search.query, search.data, q],
    );
    const shown = useMemo(
        () => (q ? searchedSessions(sessions.data?.sessions ?? [], q, hits) : (sessions.data?.sessions ?? [])),
        [sessions.data, q, hits],
    );
    const sections = useMemo(
        () => buildChatSections({ sessions: shown, activeId, live, queues, now }),
        [shown, activeId, live, queues, now],
    );
    const state = chatListState(sessions, sections);
    const searchFailed = q !== '' && search.query === q && search.isError;
    const settled = search.settled || searchFailed;
    const rowCount = sections.reduce((n, s) => n + s.data.length, 0);

    return (
        <Screen
            edges={['top', 'bottom', 'start']}
            header={<Header onClose={close} onNewChat={onNewChat ? newChat : undefined} />}
            footer={<ModelStatusPill />}
        >
            <Stack paddingX="lg" paddingY="sm">
                <TextField
                    value={text}
                    onChangeText={setText}
                    placeholder={t('sidebar.search')}
                    accessibilityLabel={t('sidebar.search')}
                    returnKeyType="search"
                />
            </Stack>
            {error ? (
                <Notice tone="danger" message={rowErrorMessage(error.kind, error.error, t)} />
            ) : null}
            {state === 'loading' ? <ListSkeleton rows={8} /> : null}
            {state === 'error' ? <ErrorState title={describeError(sessions.error, t)} onRetry={() => void sessions.refetch()} /> : null}
            {state === 'empty' && q === '' ? <EmptyState title={t('sidebar.empty')} /> : null}
            {q !== '' && searchFailed ? (
                <Notice tone="danger" message={t('sidebar.searchFailed', { error: describeError(search.error, t) })} />
            ) : null}
            {q !== '' && !searchFailed && settled && search.data?.truncated ? (
                <Notice tone="info" role="note" message={t('sidebar.searchCapped', { n: search.data.results.length })} />
            ) : null}
            {q !== '' && settled && rowCount > 0 ? (
                <Stack paddingX="lg" paddingY="xs">
                    <Text role="caption" tone="muted">{t.plural('sidebar.matchCount', rowCount)}</Text>
                </Stack>
            ) : null}
            {q !== '' && rowCount === 0 && state !== 'loading' && state !== 'error' ? (
                <EmptyState title={settled ? t('sidebar.noMatch') : t('sidebar.searching')} />
            ) : null}
            {state === 'list' ? (
                <SectionList<ChatRow, ChatSection>
                    sections={sections}
                    keyExtractor={(row) => row.id}
                    accessibilityLabel={t('sidebar.recent')}
                    renderSectionHeader={({ section }) => <SectionHeader title={t(section.titleKey)} />}
                    renderItem={({ item }) =>
                        q ? (
                            <SearchResultRow
                                row={item}
                                query={q}
                                snippet={hits.get(item.id)?.field === 'message' ? hits.get(item.id)!.snippet : null}
                                onSelect={select}
                            />
                        ) : (
                            <ChatListRow row={item} onSelect={select} />
                        )
                    }
                />
            ) : null}
        </Screen>
    );
}

function Header({ onClose, onNewChat }: { onClose: () => void; onNewChat?: () => void }) {
    const t = useT();
    return (
        <Stack paddingX="lg" paddingY="sm">
            <Row gap="sm" accessibilityRole="header">
                <Text role="title" weight="semibold">{APP_NAME}</Text>
                <Spacer />
                {onNewChat ? <IconButton icon={Plus} label={t('sidebar.newChat')} onPress={onNewChat} /> : null}
                <IconButton icon={X} label={t('sidebar.collapse')} onPress={onClose} />
            </Row>
        </Stack>
    );
}

function ChatListRow({ row, onSelect }: { row: ChatRow; onSelect: (sessionId: string) => void }) {
    const t = useT();
    const text = rowText(row, t);
    return (
        <ListRow
            title={row.title}
            emphasized={row.unread}
            selected={row.active}
            accessibilityLabel={text.aria}
            onPress={() => onSelect(row.id)}
            leading={
                <Row gap="xs">
                    {row.dot && text.status ? <StatusDot tone={statusTone(row.dot)} label={text.status} /> : null}
                    {row.private ? <Icon icon={EyeOff} size="sm" label={t('row.private')} /> : null}
                </Row>
            }
            subtitle={text.note ?? undefined}
            subtitleTone={text.noteFailed ? 'danger' : undefined}
        />
    );
}
