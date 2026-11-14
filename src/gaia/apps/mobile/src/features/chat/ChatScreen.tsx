// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { useChatStream, useMessages, useSession } from '@/data';
import { Composer, useComposerQueue } from '@/features/composer';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeError, useT } from '@/i18n/useT';
import { ErrorState, Notice, Screen, Stack } from '@/ui';

import { ChatPrompts } from './ChatPrompts';
import { PermissionPromptSlot } from './permission/PermissionPromptSlot';
import { usePermissionPrompt } from './permission/usePermissionPrompt';
import { liveStatusLine } from './liveStatus';
import { MessageList } from './messages/MessageList';
import { buildTail } from './tailState';
import { TurnTail } from './TurnTail';

const NO_MESSAGES: never[] = [];

export function ChatScreen({ sessionId }: { sessionId: string }) {
    const t = useT();
    const session = useSession(sessionId);
    const messages = useMessages(sessionId);
    const stream = useChatStream(sessionId);
    const queue = useComposerQueue(sessionId);
    const permission = usePermissionPrompt(sessionId);
    const [actionError, setActionError] = useState<unknown>(null);
    const busy = stream.status !== 'idle';
    const saved = messages.data?.messages ?? NO_MESSAGES;

    const tail = buildTail(saved, stream);
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

    const placeholder = stream.pendingQuestion
        ? t('composer.answerQuestion')
        : busy
          ? t('composer.queueNext')
          : saved.length > 0 || tail
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
                    {permission ? <PermissionPromptSlot {...permission} key={permission.prompt.id} /> : null}
                    <Composer onSend={send} onStop={stream.stop} running={busy} placeholder={placeholder} />
                </>
            }
        >
            {session.isError ? (
                <ErrorState title={describeError(session.error, t)} onRetry={() => void session.refetch()} />
            ) : (
                <MessageList
                    sessionId={sessionId}
                    live={
                        <>
                            {tail ? (
                                <TurnTail
                                    tail={tail}
                                    line={line}
                                    awaitingUser={!!stream.pendingPermission || !!stream.pendingQuestion}
                                    onTryAgain={() => tryAgain(tail.replyId)}
                                    onContinue={continueReply}
                                />
                            ) : null}
                            <ChatPrompts question={stream.pendingQuestion} />
                        </>
                    }
                />
            )}
        </Screen>
    );
}
