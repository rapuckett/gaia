// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { APP_NAME } from '@webui/utils/constants';

import { useSessions } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import {
    Badge,
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
    StatusDot,
    Text,
} from '@/ui';
import { EyeOff, X } from '@/ui/icons';

import {
    buildChatSections,
    chatListState,
    rowErrorMessage,
    rowText,
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
    live?: LiveRuns;
    queues?: Readonly<Record<string, readonly QueuedMessage[]>>;
    /** The last failed row action, shown as an alert until the next one succeeds. */
    error?: ChatListError | null;
}

export function ChatDrawerContent({ activeId, onSelect, onClose, live, queues, error }: ChatDrawerContentProps) {
    const t = useT();
    const sessions = useSessions();
    const sections = useMemo(
        () => buildChatSections({ sessions: sessions.data?.sessions ?? [], activeId, live, queues }),
        [sessions.data, activeId, live, queues],
    );
    const state = chatListState(sessions, sections);

    return (
        <Screen edges={['top', 'bottom', 'start']} header={<Header onClose={onClose} />}>
            {error ? (
                <Notice tone="danger" message={rowErrorMessage(error.kind, error.error, t)} />
            ) : null}
            {state === 'loading' ? <ListSkeleton rows={8} /> : null}
            {state === 'error' ? <ErrorState title={describeError(sessions.error, t)} onRetry={() => void sessions.refetch()} /> : null}
            {state === 'empty' ? <EmptyState title={t('sidebar.empty')} /> : null}
            {state === 'list' ? (
                <SectionList<ChatRow, ChatSection>
                    sections={sections}
                    keyExtractor={(row) => row.id}
                    accessibilityLabel={t('sidebar.recent')}
                    renderSectionHeader={({ section }) => <SectionHeader title={t(section.titleKey)} />}
                    renderItem={({ item }) => <ChatListRow row={item} onSelect={onSelect} />}
                />
            ) : null}
        </Screen>
    );
}

function Header({ onClose }: { onClose: () => void }) {
    const t = useT();
    return (
        <Row gap="sm">
            <Text role="title" weight="semibold">{APP_NAME}</Text>
            <Spacer />
            <IconButton icon={X} label={t('sidebar.collapse')} onPress={onClose} />
        </Row>
    );
}

function ChatListRow({ row, onSelect }: { row: ChatRow; onSelect: (sessionId: string) => void }) {
    const t = useT();
    const text = rowText(row, t);
    return (
        <ListRow
            title={row.title}
            selected={row.active}
            accessibilityLabel={text.aria}
            onPress={() => onSelect(row.id)}
            leading={
                <Row gap="xs">
                    {row.dot && text.status ? <StatusDot tone={statusTone(row.dot)} label={text.status} /> : null}
                    {row.private ? <Icon icon={EyeOff} size="sm" label={t('row.private')} /> : null}
                </Row>
            }
            trailing={
                text.note || row.unread ? (
                    <Row gap="xs">
                        {text.note ? <Text role="caption" tone={text.noteFailed ? 'danger' : 'muted'}>{text.note}</Text> : null}
                        {row.unread ? <Badge label={t('row.unread')} tone="accent" /> : null}
                    </Row>
                ) : undefined
            }
        />
    );
}
