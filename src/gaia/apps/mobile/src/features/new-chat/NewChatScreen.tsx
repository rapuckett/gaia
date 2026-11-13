// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { bracketParts } from '@webui/i18n/registry';
import { useEffect, useState } from 'react';

import { useCreateSession, useSystemStatus } from '@/data';
import { Composer, useComposerQueue } from '@/features/composer';
import { useComposerQueueStore } from '@/features/composer/composerQueue';
import { useT } from '@/i18n/useT';
import { Disclosure, Notice, ProgressLine, Screen, Stack, Text } from '@/ui';

import { greetingKey } from './greeting';
import { showWarmUp, startingReason } from './starting';
import { useAssistantNotice, useFirstSend } from './useNewChat';
import { shortModelName, warmUpLine, warmUpProgress } from './warmUp';

export interface NewChatScreenProps {
    // Opens the chat once its first message is under way.
    onOpen: (sessionId: string) => void;
    initialText?: string;
    // A skill's prompt goes in the box under any unsent draft; a new `id` adds it again.
    prompt?: { id: string; text: string };
}

// Texts typed while the chat was being created, taken out of the queue for good.
function takeHeld(): string[] {
    const items = useComposerQueueStore.getState().byChat[''] ?? [];
    useComposerQueueStore.setState((s) => ({ byChat: { ...s.byChat, '': [] } }));
    return items.map((i) => i.text);
}

export function NewChatScreen({ onOpen, initialText = '', prompt }: NewChatScreenProps) {
    const t = useT();
    const status = useSystemStatus().data;
    const createSession = useCreateSession();
    const queue = useComposerQueue(null);
    const { state, setText, submit } = useFirstSend(
        {
            createSession: () => createSession.mutateAsync(),
            deliver: queue.deliver,
            flush: queue.flush,
            queueHeld: queue.queueHeld,
            takeHeld,
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

    const warming = warmUpProgress(status?.warm_up);
    const [greeting, gloss] = bracketParts(t(greetingKey(new Date())));

    return (
        <Screen
            keyboard="avoid"
            scroll
            footer={
                <Composer
                    value={state.text}
                    onChange={setText}
                    onSend={(message) => void submit(message, queue.hold)}
                    disabledReason={startingReason(status, t) ?? undefined}
                />
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
                {warming !== null && showWarmUp(status) && (
                    <ProgressLine label={warmUpLine(warming, t, shortModelName)} />
                )}
                {state.error !== null && <Notice tone="danger" message={state.error} />}
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
