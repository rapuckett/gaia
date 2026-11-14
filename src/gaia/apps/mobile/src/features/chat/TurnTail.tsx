// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { useT } from '@/i18n/useT';
import { Button, Notice, Row, Spinner, Stack, Text } from '@/ui';
import { RotateCcw } from '@/ui/icons';

import { ActivityTimeline } from './activity/ActivityTimeline';
import { stepsFromEvents } from './activity/stepsFromEvents';
import { chatErrorText } from './chatErrors';
import { StoppedNote } from './EndingNotes';
import { Markdown } from './markdown/Markdown';
import type { TurnTail as Tail } from './tailState';

export interface TurnTailProps {
    tail: Tail;
    /** What the agent is doing now, or null for "Thinking...". Only used while the turn is live. */
    line: string | null;
    /** The turn is waiting on the person's answer. */
    awaitingUser?: boolean;
    onTryAgain(): void;
    onContinue(): void;
}

/** The running or just-ended turn, under the saved messages. */
export function TurnTail({ tail, line, awaitingUser = false, onTryAgain, onContinue }: TurnTailProps) {
    const t = useT();
    const steps = useMemo(() => stepsFromEvents(tail.events, t), [tail.events, t]);
    // A running step row already says what is happening.
    const rowRuns = steps.some((s) => s.active && s.type !== 'status');
    const showLine = tail.live && !rowRuns && (line !== null || !tail.text);
    return (
        <Stack gap="sm" paddingX="lg" paddingY="xs" testID="turn-tail">
            <ActivityTimeline steps={steps} running={tail.live} awaitingUser={awaitingUser} answer={tail.text} />
            {tail.text ? <Markdown text={tail.text} streaming={tail.live} /> : null}
            {showLine ? (
                <Row gap="sm" accessibilityRole="progressbar">
                    <Spinner size="sm" />
                    <Text role="label" tone="secondary" numberOfLines={1} testID="live-line">
                        {line ?? t('msg.thinking')}
                    </Text>
                </Row>
            ) : null}
            {tail.error ? <Notice tone="danger" message={chatErrorText(tail.error, t)} testID="reply-error" /> : null}
            {tail.stop ? <StoppedNote stop={tail.stop} /> : null}
            {tail.canContinue || tail.canTryAgain ? (
                <Row gap="sm" wrap>
                    {tail.canContinue ? <Button size="sm" label={t('msg.continue')} onPress={onContinue} testID="continue" /> : null}
                    {tail.canTryAgain ? (
                        <Button size="sm" icon={RotateCcw} label={t('msg.tryAgain')} onPress={onTryAgain} testID="try-again" />
                    ) : null}
                </Row>
            ) : null}
        </Stack>
    );
}
