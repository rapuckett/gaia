// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { StartScreen } from '@webui/types';

import { useCreateSession, useSystemStatus } from '@/data';
import { Composer } from '@/features/composer';
import { useT } from '@/i18n/useT';
import { Disclosure, Notice, ProgressLine, Screen, Stack, Text } from '@/ui';
import { useState } from 'react';

import { greetingKey } from './greeting';
import { showWarmUp, startingReason } from './starting';
import type { NewChatDeps } from './useNewChat';
import { useFirstSend, useStartScreen } from './useNewChat';
import { shortModelName, warmUpLine, warmUpProgress } from './warmUp';

export interface NewChatScreenProps {
    // Opens the new chat and sends its first message; the route decides how.
    deliver: NewChatDeps['deliver'];
    queueHeld: NewChatDeps['queueHeld'];
    fetchStart: () => Promise<StartScreen>;
    initialText?: string;
}

export function NewChatScreen({ deliver, queueHeld, fetchStart, initialText = '' }: NewChatScreenProps) {
    const t = useT();
    const status = useSystemStatus().data;
    const createSession = useCreateSession();
    const { state, setText, submit } = useFirstSend(
        { createSession: () => createSession.mutateAsync(), deliver, queueHeld },
        initialText,
    );
    const start = useStartScreen(fetchStart);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const warming = warmUpProgress(status?.warm_up);
    const disabledReason = startingReason(status, t);

    return (
        <Screen
            keyboard="avoid"
            scroll
            footer={
                <Composer
                    value={state.text}
                    onChangeText={setText}
                    onSubmit={submit}
                    disabledReason={disabledReason}
                    autoFocus
                />
            }
        >
            <Stack gap="lg" paddingX="lg" paddingY="xl" flex={1} justify="center">
                {!state.sending && (
                    <Text role="display" accessibilityRole="header">
                        {t(greetingKey(new Date()))}
                    </Text>
                )}
                {warming !== null && showWarmUp(status) && (
                    <ProgressLine label={warmUpLine(warming, t, shortModelName)} />
                )}
                {state.error !== null && <Notice tone="danger" message={state.error} />}
                {start.error !== null && (
                    <Stack gap="sm">
                        <Notice
                            tone="warning"
                            message={t('newChat.assistantUnavailable')}
                            action={{ label: t('newChat.tryAgain'), onPress: start.retry }}
                        />
                        <Disclosure title={t('newChat.details')} open={detailsOpen} onToggle={() => setDetailsOpen((v) => !v)}>
                            <Text role="caption" tone="secondary" mono selectable>
                                {start.error}
                            </Text>
                        </Disclosure>
                    </Stack>
                )}
            </Stack>
        </Screen>
    );
}
