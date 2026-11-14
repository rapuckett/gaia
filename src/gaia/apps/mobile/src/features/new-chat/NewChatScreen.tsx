// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { bracketParts } from '@webui/i18n/registry';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCreateSession, useDocuments, useSystemStatus } from '@/data';
import { Composer, useComposerQueue } from '@/features/composer';
import { QueuedMessages } from '@/features/composer/QueuedMessages';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { useT } from '@/i18n/useT';
import { Disclosure, Notice, ProgressLine, Screen, Stack, Text } from '@/ui';

import { LibraryDocuments } from './LibraryDocuments';
import { greetingKey } from './greeting';
import { setupError } from './setupFailed';
import { showWarmUp, startingReason } from './starting';
import { TryChips } from './TryChips';
import { withExample } from './tryExamples';
import { useAssistantNotice, useFirstSend } from './useNewChat';
import { shortModelName, warmUpLine, warmUpProgress } from './warmUp';

export interface NewChatScreenProps {
    // Opens the chat once its first message is under way.
    onOpen: (sessionId: string) => void;
    initialText?: string;
    // A skill's prompt goes in the box under any unsent draft; a new `id` adds it again.
    prompt?: { id: string; text: string };
}

export function NewChatScreen({ onOpen, initialText = '', prompt }: NewChatScreenProps) {
    const t = useT();
    const status = useSystemStatus().data;
    const createSession = useCreateSession();
    const documents = useDocuments().data?.documents;
    const [attachedIds, setAttachedIds] = useState<string[]>([]);
    const queue = useComposerQueue(null);
    const { state, setText, submit } = useFirstSend(
        {
            createSession: () => createSession.mutateAsync({ document_ids: attachedIds }),
            deliver: queue.deliver,
            flush: queue.flush,
            queueHeld: queue.queueHeld,
            takeHeld: () => queue.takeHeld().map((item) => item.text),
        },
        initialText,
    );
    const assistant = useAssistantNotice();
    const [detailsOpen, setDetailsOpen] = useState(false);

    useEffect(() => {
        if (state.open) onOpen(state.open);
    }, [state.open, onOpen]);

    const promptId = prompt?.id;
    const promptText = prompt?.text;
    useEffect(() => {
        if (promptText) setText((draft) => (draft.trim() ? `${draft}\n\n${promptText}` : promptText));
    }, [promptId, promptText, setText]);

    const lastExample = useRef('');
    const fillExample = useCallback(
        (example: string) => {
            setText((draft) => withExample(draft, lastExample.current, example));
            lastExample.current = example;
        },
        [setText],
    );

    const failedSetup = setupError(status);
    const warming = warmUpProgress(status?.warm_up);
    const [greeting, gloss] = bracketParts(t(greetingKey(new Date())));

    return (
        <Screen
            keyboard="avoid"
            scroll
            header={<ScreenHeader />}
            footer={
                <>
                    <QueuedMessages items={queue.held} replying={false} onRemove={queue.remove} onRetry={queue.retry} />
                    <Composer
                        value={state.text}
                        onChange={setText}
                        onSend={(message) => void submit(message, queue.hold)}
                        disabledReason={startingReason(status, t) ?? undefined}
                    />
                </>
            }
        >
            <Stack gap="lg" paddingX="lg" paddingY="xl" flex={1} justify="center">
                {!state.sending && (
                    <Stack gap="xs">
                        <Text role="display" accessibilityRole="header">
                            {greeting}
                        </Text>
                        {gloss !== undefined && (
                            <Text role="caption" tone="secondary">
                                {`\u200F${gloss}`}
                            </Text>
                        )}
                    </Stack>
                )}
                {failedSetup !== null && (
                    <Notice
                        tone="danger"
                        title={t('newChat.setupFailed.title')}
                        message={`${failedSetup}\n\n${t('newChat.setupFailed.hint')}`}
                    />
                )}
                {documents && !state.sending && (
                    <LibraryDocuments
                        documents={documents}
                        attachedIds={attachedIds}
                        onAttach={(ids) => setAttachedIds((cur) => [...cur, ...ids.filter((id) => !cur.includes(id))])}
                        onRemove={(id) => setAttachedIds((cur) => cur.filter((x) => x !== id))}
                    />
                )}
                {warming !== null && showWarmUp(status) && (
                    <ProgressLine label={warmUpLine(warming, t, shortModelName)} />
                )}
                {state.error !== null && <Notice tone="danger" message={state.error} />}
                {!state.sending && startingReason(status, t) === null && <TryChips onPick={fillExample} />}
                {assistant.problem !== null && (
                    <Stack gap="sm">
                        <Notice
                            tone="warning"
                            message={t('newChat.assistantUnavailable')}
                            action={{ label: t('newChat.tryAgain'), onPress: assistant.retry }}
                        />
                        <Disclosure
                            title={t('newChat.details')}
                            open={detailsOpen}
                            onToggle={() => setDetailsOpen((v) => !v)}
                        >
                            <Text role="caption" tone="secondary" mono selectable>
                                {assistant.problem}
                            </Text>
                        </Disclosure>
                    </Stack>
                )}
            </Stack>
        </Screen>
    );
}
