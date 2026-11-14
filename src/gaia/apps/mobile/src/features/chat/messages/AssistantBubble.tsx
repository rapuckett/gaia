// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Message } from '@/api/client.types';
import { useT } from '@/i18n/useT';
import { IconButton, Pressable, Row, Stack } from '@/ui';
import { Check, Copy, Ellipsis } from '@/ui/icons';

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
    return (
        <Stack paddingX="lg" paddingY="xs">
            <Pressable onLongPress={actions.openSheet} accessible={false} minSize={0}>
                <Markdown text={message.content} streaming={streaming} />
            </Pressable>
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
