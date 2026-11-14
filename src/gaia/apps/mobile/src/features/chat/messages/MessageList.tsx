// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, type ReactNode } from 'react';

import type { Message } from '@/api/client.types';
import { useMessages } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import { ErrorState, List, ListSkeleton, Stack } from '@/ui';

import { AssistantBubble } from './AssistantBubble';
import { JumpButton } from './JumpButton';
import { UserBubble } from './UserBubble';
import { useFollowScroll } from './useFollowScroll';
import type { MessageContext } from './useMessageActions';

export interface MessageListViewProps {
    /** Oldest first, as GAIA stores them. */
    messages: readonly Message[];
    loading?: boolean;
    error?: unknown;
    onRetry?: () => void;
    /** The answer being written, shown under the last message. */
    live?: ReactNode;
}

/** `shown` is newest first, so the messages after `index` are the ones before it. */
function contextOf(shown: readonly Message[], index: number): MessageContext {
    for (let i = index - 1; i >= 0; i--) {
        if (shown[i].role === 'user') return { later: index, laterTurns: i + 1 };
    }
    return { later: index, laterTurns: 0 };
}

export function MessageListView({ messages, loading = false, error, onRetry, live }: MessageListViewProps) {
    const t = useT();
    const { listRef, following, showJump, onScroll, jumpToBottom } = useFollowScroll<Message>();
    const shown = useMemo(() => messages.filter((m) => m.role !== 'system').reverse(), [messages]);

    const bringIntoView = useCallback(
        (index: number) => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }),
        [listRef],
    );

    if (loading) return <ListSkeleton rows={6} label={t('chat.loadingMessages')} />;
    if (error) return <ErrorState title={describeError(error, t)} onRetry={onRetry} />;

    return (
        <Stack flex={1}>
            <List<Message>
                listRef={listRef}
                inverted
                data={shown}
                keyExtractor={(m) => String(m.id)}
                renderItem={({ item, index }) => {
                    const context = contextOf(shown, index);
                    return item.role === 'user' ? (
                        <UserBubble message={item} onCollapse={() => bringIntoView(index)} context={context} />
                    ) : (
                        <AssistantBubble message={item} context={context} />
                    );
                }}
                ListHeaderComponent={live ? <>{live}</> : undefined}
                onScroll={onScroll}
                scrollEventThrottle={64}
                maintainVisibleContentPosition={following ? undefined : { minIndexForVisible: 0 }}
                onScrollToIndexFailed={({ averageItemLength, index }) =>
                    listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })
                }
            />
            <JumpButton visible={showJump} onPress={jumpToBottom} />
        </Stack>
    );
}

/** A chat's transcript, from the PC. `live` is the answer still being written. */
export function MessageList({ sessionId, live }: { sessionId: string; live?: ReactNode }) {
    const query = useMessages(sessionId);
    return (
        <MessageListView
            messages={query.data?.messages ?? []}
            loading={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            live={live}
        />
    );
}
