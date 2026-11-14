// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { SERVER_CANCELLED_TEXT, splitCutOff } from '@webui/utils/turnEnding.core';

import type { Message } from '@/api/client.types';
import { useT } from '@/i18n/useT';
import { IconButton, Pressable, Row, Stack } from '@/ui';
import { Check, Copy, Ellipsis } from '@/ui/icons';

import { CutOffNote, StoppedNote } from '../EndingNotes';
import { Markdown } from '../markdown/Markdown';
import { useMessageActions } from './useMessageActions';

export interface AssistantBubbleProps {
    message: Message;
    /** The answer is still being written: the row stays hidden. */
    streaming?: boolean;
}

export function AssistantBubble({ message, streaming = false }: AssistantBubbleProps) {
    const t = useT();
    const actions = useMessageActions(message);
    const cutOff = streaming ? null : splitCutOff(message.content);
    const cancelled = message.content.trim() === SERVER_CANCELLED_TEXT;
    const text = cancelled ? '' : cutOff ? cutOff.body : message.content;
    return (
        <Stack paddingX="lg" paddingY="xs">
            <Pressable onLongPress={actions.openSheet} accessible={false} minSize={0}>
                {text ? <Markdown text={text} streaming={streaming} /> : null}
            </Pressable>
            {cutOff ? <CutOffNote cutOff={cutOff} /> : null}
            {cancelled ? <StoppedNote stop={{ state: 'stopped' }} /> : null}
            {!streaming ? (
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
