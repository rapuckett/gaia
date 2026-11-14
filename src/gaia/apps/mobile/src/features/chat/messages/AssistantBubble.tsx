// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { SERVER_CANCELLED_TEXT, splitCutOff } from '@webui/utils/turnEnding.core';

import type { Message } from '@/api/client.types';
import { useMemo } from 'react';

import { useT } from '@/i18n/useT';
import { IconButton, Pressable, Row, Stack } from '@/ui';
import { Check, Copy, Ellipsis } from '@/ui/icons';

import { ActivityTimeline } from '../activity/ActivityTimeline';
import { AnswerFooter } from '../activity/AnswerFooter';
import { savedActivity } from '../activity/savedActivity';
import { CutOffNote, StoppedNote } from '../EndingNotes';
import { Markdown } from '../markdown/Markdown';
import { useMessageActions, type MessageContext } from './useMessageActions';

export interface AssistantBubbleProps {
    message: Message;
    /** The answer is still being written: the row stays hidden. */
    streaming?: boolean;
    /** How long the reply took, from the question before it. */
    latencyMs?: number;
    context?: MessageContext;
}

export function AssistantBubble({ message, streaming = false, latencyMs, context }: AssistantBubbleProps) {
    const t = useT();
    const cutOff = streaming ? null : splitCutOff(message.content);
    const cancelled = message.content.trim() === SERVER_CANCELLED_TEXT;
    const text = cancelled ? '' : cutOff ? cutOff.body : message.content;
    const actions = useMessageActions(message, text, context);
    const activity = useMemo(() => savedActivity(message), [message]);
    return (
        <Stack paddingX="lg" paddingY="xs">
            {activity.steps.length > 0 ? <ActivityTimeline steps={activity.steps} answer={text} /> : null}
            <Pressable onLongPress={cancelled ? undefined : actions.openSheet} accessible={false} minSize={0}>
                {text ? <Markdown text={text} streaming={streaming} /> : null}
            </Pressable>
            {!streaming && !cancelled ? <AnswerFooter latencyMs={latencyMs} stats={message.stats} ended={activity.ended} /> : null}
            {cutOff ? <CutOffNote cutOff={cutOff} /> : null}
            {cancelled ? <StoppedNote stop={{ state: 'stopped' }} /> : null}
            {!streaming && !cancelled ? (
                <Row>
                    <IconButton
                        icon={actions.copied ? Check : Copy}
                        label={actions.copied ? t('msg.copiedAria') : t('msg.copy')}
                        size="sm"
                        onPress={actions.copy}
                    />
                    <IconButton icon={Ellipsis} label={t('msg.actions')} size="sm" onPress={actions.openSheet} />
                </Row>
            ) : null}
            {actions.notice}
            {actions.sheet}
        </Stack>
    );
}
