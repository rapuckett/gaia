// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { isolate } from '@webui/i18n/registry';
import { middleTruncate } from '@webui/utils/format';
import { isLongUserMessage, sizeLabel, USER_COLLAPSE_LINES } from '@webui/utils/longContent';
import type { Message } from '@/api/client.types';
import { useDirection, useT } from '@/i18n/useT';
import { contentDir, Icon, Pressable, Row, Stack, Surface, Text } from '@/ui';
import { FileText } from '@/ui/icons';

import { splitAttachmentLinks } from './attachedLinks';
import { ImageThumbs } from './ImageThumbs';
import { useMessageActions, type MessageContext, type StartOpen } from './useMessageActions';

export interface UserBubbleProps {
    message: Message;
    /** Called after "Show less", so the list can bring the bubble back into view. */
    onCollapse?: () => void;
    context?: MessageContext;
    startOpen?: StartOpen;
}

export function UserBubble({ message, onCollapse, context, startOpen }: UserBubbleProps) {
    const t = useT();
    const uiDir = useDirection();
    const actions = useMessageActions(message, message.content, context, startOpen);
    const { text, files: attached } = splitAttachmentLinks(message.content);
    const images = attached.filter((f) => f.isImage);
    const files = attached.filter((f) => !f.isImage);
    const long = isLongUserMessage(text);
    const [expanded, setExpanded] = useState(false);
    const collapsed = long && !expanded;

    const toggle = () => {
        setExpanded(!expanded);
        if (expanded) onCollapse?.();
    };

    return (
        <Stack paddingX="lg" paddingY="xs">
            <Stack self="end" maxWidth="85%">
                <Surface tone="userMsg" radius="lg" padding="md">
                    <Stack gap="sm">
                        {actions.editor ?? (text || attached.length === 0 ? (
                            <Pressable onLongPress={actions.openSheet} accessibilityRole="text" minSize={0} {...actions.a11y}>
                                <Text
                                    role="body"
                                    dir={contentDir(text, uiDir)}
                                    align={contentDir(text, uiDir)}
                                    numberOfLines={collapsed ? USER_COLLAPSE_LINES : undefined}
                                >
                                    {text}
                                </Text>
                            </Pressable>
                        ) : null)}
                        {!actions.editor ? <ImageThumbs images={images} /> : null}
                        {!actions.editor
                            ? files.map((f) => (
                                  <Row key={f.url} gap="sm" testID="user-attachment">
                                      <Icon icon={FileText} size="sm" tone="secondary" />
                                      <Text role="label" numberOfLines={1} compact dir="ltr" accessibilityLabel={f.name}>
                                          {middleTruncate(f.name)}
                                      </Text>
                                  </Row>
                              ))
                            : null}
                        {long && !actions.editor ? (
                            <Pressable
                                onPress={toggle}
                                aria-expanded={expanded}
                                minSize={48}
                                testID="user-show-all"
                                accessibilityLabel={
                                    expanded
                                        ? t('msg.showLess')
                                        : t.hint(t('msg.showAll'), sizeLabel(t, text))
                                }
                            >
                                <Text role="label" tone="accent" weight="medium">
                                    {expanded
                                        ? t('msg.showLess')
                                        : t.hint(t('msg.showAll'), isolate(sizeLabel(t, text), 'ltr'))}
                                </Text>
                            </Pressable>
                        ) : null}
                    </Stack>
                </Surface>
            </Stack>
            {actions.notice}
            {actions.sheet}
        </Stack>
    );
}
