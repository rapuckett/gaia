// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import { needsOutcome, nextToSend } from '@webui/utils/messageQueue';

import { useAnswerQuestion, useChatStream, useMessages, useSession } from '@/data';
import { Composer, useComposerQueue, useFollowUpEvents } from '@/features/composer';
import { QueuedMessages } from '@/features/composer/QueuedMessages';
import { describeError, useT } from '@/i18n/useT';
import { isQuestionGone, questionCardData, resolveTypedAnswer } from '@/features/questions/questionLogic';
import { ErrorState, Notice, Screen, Stack } from '@/ui';

import { ChatPrompts } from './ChatPrompts';
import { ChatHeader } from './header';
import { PermissionPrompt } from './permission/PermissionPrompt';
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
    const answer = useAnswerQuestion();
    const followUps = useFollowUpEvents(sessionId, stream.events);
    const stopped = useRef(false);
    const [actionError, setActionError] = useState<unknown>(null);
    const busy = stream.status !== 'idle';
    const saved = messages.data?.messages ?? NO_MESSAGES;

    const tail = buildTail(saved, stream);
    const line = liveStatusLine(
        stream.events,
        { waitingOnPerson: !!stream.pendingPermission || !!stream.pendingQuestion, answering: stream.liveText !== '' },
        t,
    );

    const question = stream.pendingQuestion && !stream.pendingQuestion.sensitive ? stream.pendingQuestion : null;
    const steerable = stream.status === 'streaming' && !followUps.unavailable;

    // Messages typed while a reply runs go out one by one once it ends; after Stop they return to the box.
    const sendable = nextToSend(queue.held) !== undefined || needsOutcome(queue.held);
    const { flush, giveBack } = queue;
    useEffect(() => {
        if (busy) return;
        if (stopped.current) {
            stopped.current = false;
            giveBack();
            return;
        }
        if (sendable) void flush(sessionId);
    }, [busy, sendable, flush, giveBack, sessionId]);

    const stop = () => {
        stopped.current = true;
        stream.stop();
    };

    const answerQuestion = (message: string, asked: NonNullable<typeof question>): boolean => {
        const data = questionCardData(sessionId, asked);
        const resolved = data && resolveTypedAnswer(message, data);
        if (!resolved) {
            setActionError(t('composer.pickAnOption'));
            return false;
        }
        answer
            .mutateAsync({ session_id: sessionId, request_id: asked.request_id, value: resolved.value, display: message })
            .catch((err: unknown) => {
                // Back in the box, so nothing typed is lost; an expired question says so in its card.
                queue.setDraft((prev) => (prev.trim() ? `${message}\n\n${prev}` : message));
                if (!isQuestionGone(err)) setActionError(t('composer.answerFailed', { error: describeError(err, t) }));
            });
        return true;
    };

    const send = (message: string): boolean | void => {
        setActionError(null);
        if (question) return answerQuestion(message, question);
        if (busy) queue.hold(message);
        else stream.send(message);
    };
    const tryAgain = (replyId: number | null) => {
        setActionError(null);
        stream.retry(replyId).catch((err: unknown) => setActionError(err));
    };
    const continueReply = () => {
        setActionError(null);
        stream.send(t('msg.continuePrompt'));
    };

    const placeholder = question
        ? t('composer.answerQuestion')
        : busy
          ? t('composer.queueNext')
          : saved.length > 0 || tail
            ? t('composer.reply')
            : undefined;

    return (
        <Screen
            keyboard="avoid"
            header={<ChatHeader sessionId={sessionId} />}
            footer={
                <>
                    {actionError ? (
                        <Stack paddingX="lg">
                            <Notice tone="danger" message={describeError(actionError, t)} testID="action-error" />
                        </Stack>
                    ) : null}
                    {permission ? <PermissionPrompt key={permission.prompt.id} {...permission} /> : null}
                    <QueuedMessages
                        items={queue.held}
                        replying={busy}
                        onRemove={queue.remove}
                        onRetry={queue.retry}
                        onSteer={steerable ? queue.steer : undefined}
                    />
                    <Composer
                        value={queue.draft}
                        onChange={queue.setDraft}
                        onSend={send}
                        onStop={stop}
                        running={busy}
                        answering={!!question}
                        placeholder={placeholder}
                    />
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
                                    onTryAgain={() => tryAgain(tail.replyId)}
                                    onContinue={continueReply}
                                />
                            ) : null}
                            <ChatPrompts sessionId={sessionId} question={stream.pendingQuestion} />
                        </>
                    }
                />
            )}
        </Screen>
    );
}
