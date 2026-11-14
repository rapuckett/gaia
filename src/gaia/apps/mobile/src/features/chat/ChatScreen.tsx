// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useChatStream, useMessages, useSession } from '@/data';
import { Composer, useComposerQueue } from '@/features/composer';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeError, useT } from '@/i18n/useT';
import { Button, ErrorState, List, LoadingState, Notice, Screen, Stack, useTheme } from '@/ui';
import { ArrowDown } from '@/ui/icons';

import { ChatPrompts } from './ChatPrompts';
import { liveStatusLine } from './liveStatus';
import { ReplyBubble } from './ReplyBubble';
import { buildRows, type ChatRow } from './rows';
import { UserBubble } from './UserBubble';

const NO_MESSAGES: never[] = [];

export function ChatScreen({ sessionId }: { sessionId: string }) {
    const t = useT();
    const { space } = useTheme();
    const session = useSession(sessionId);
    const messages = useMessages(sessionId);
    const stream = useChatStream(sessionId);
    const queue = useComposerQueue(sessionId);
    const [actionError, setActionError] = useState<unknown>(null);
    const busy = stream.status !== 'idle';
    const saved = messages.data?.messages ?? NO_MESSAGES;

    const rows = useMemo(() => buildRows(saved, stream), [saved, stream]);
    const line = liveStatusLine(
        stream.events,
        { waitingOnPerson: !!stream.pendingPermission || !!stream.pendingQuestion, answering: stream.liveText !== '' },
        t,
    );

    // Messages typed while a reply runs wait here and go out one by one once it ends.
    const heldCount = queue.held.length;
    const { flush } = queue;
    useEffect(() => {
        if (!busy && heldCount > 0) void flush(sessionId);
    }, [busy, heldCount, flush, sessionId]);

    const send = (text: string) => {
        setActionError(null);
        if (busy) queue.hold(text);
        else stream.send(text);
    };
    const tryAgain = (replyId: number | null) => {
        setActionError(null);
        stream.retry(replyId).catch((err: unknown) => setActionError(err));
    };
    const continueReply = () => {
        setActionError(null);
        stream.send(t('msg.continuePrompt'));
    };

    const listRef = useRef<FlatList<ChatRow>>(null);
    const atBottomRef = useRef(true);
    const [atBottom, setAtBottom] = useState(true);
    const onScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const near = contentSize.height - (contentOffset.y + layoutMeasurement.height) <= space.xl;
            atBottomRef.current = near;
            setAtBottom(near);
        },
        [space.xl],
    );
    // New content follows only while the person is already at the newest.
    const followNewest = useCallback(() => {
        if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
    }, []);
    const jumpToLatest = () => {
        atBottomRef.current = true;
        setAtBottom(true);
        listRef.current?.scrollToEnd({ animated: true });
    };

    const placeholder = stream.pendingQuestion
        ? t('composer.answerQuestion')
        : busy
          ? t('composer.queueNext')
          : rows.length > 0
            ? t('composer.reply')
            : undefined;

    return (
        <Screen
            keyboard="avoid"
            header={<ScreenHeader title={session.data?.title} />}
            footer={
                <>
                    {actionError ? (
                        <Stack paddingX="lg">
                            <Notice tone="danger" message={describeError(actionError, t)} testID="action-error" />
                        </Stack>
                    ) : null}
                    <Composer onSend={send} onStop={stream.stop} running={busy} placeholder={placeholder} />
                </>
            }
        >
            {session.isError ? (
                <ErrorState title={describeError(session.error, t)} onRetry={() => void session.refetch()} />
            ) : messages.isError ? (
                <ErrorState title={describeError(messages.error, t)} onRetry={() => void messages.refetch()} />
            ) : messages.isPending ? (
                <LoadingState title={t('chat.loadingMessages')} />
            ) : (
                <>
                    <List
                        listRef={listRef}
                        data={rows}
                        keyExtractor={(row) => row.key}
                        renderItem={({ item }) =>
                            item.kind === 'user' ? (
                                <UserBubble text={item.text} />
                            ) : (
                                <ReplyBubble
                                    reply={item}
                                    line={line}
                                    onTryAgain={() => tryAgain(item.replyId)}
                                    onContinue={continueReply}
                                />
                            )
                        }
                        ItemSeparatorComponent={() => <Stack padding="sm" />}
                        ListFooterComponent={<ChatPrompts permission={stream.pendingPermission} question={stream.pendingQuestion} />}
                        contentContainerStyle={{ paddingVertical: space.lg }}
                        onScroll={onScroll}
                        scrollEventThrottle={100}
                        onContentSizeChange={followNewest}
                    />
                    {atBottom ? null : (
                        <Stack align="center" padding="sm">
                            <Button size="sm" icon={ArrowDown} label={t('chat.scrollToBottom')} onPress={jumpToLatest} testID="jump-to-latest" />
                        </Stack>
                    )}
                </>
            )}
        </Screen>
    );
}
