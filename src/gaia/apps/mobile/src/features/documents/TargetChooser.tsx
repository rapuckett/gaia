// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { isolateUnit } from '@webui/i18n/registry';

import { useT } from '@/i18n/useT';
import { ActionSheet, Button, Row, Stack, Text } from '@/ui';

export type LibraryTarget = 'chat' | 'next';

interface TargetChooserProps {
    // The open chat's title; null when no chat is open.
    chatTitle: string | null;
    target: LibraryTarget;
    onChange: (target: LibraryTarget) => void;
}

// Where documents added here go, on one line: the open chat or the next new chat, with a Change link inside a chat.
export function TargetChooser({ chatTitle, target, onChange }: TargetChooserProps) {
    const t = useT();
    const [open, setOpen] = useState(false);
    if (chatTitle === null) {
        return (
            <Text tone="secondary" testID="docs-target">
                {t('docs.nextChatOnly')}
            </Text>
        );
    }
    const quoted = `“${chatTitle}”`;
    return (
        <Row gap="sm" align="center" testID="docs-target">
            <Stack flex={1}>
                <Text role="caption" tone="secondary">
                    {t('docs.addTo')}
                </Text>
                <Text weight="semibold" numberOfLines={1} testID="docs-target-value">
                    {target === 'chat' ? isolateUnit(quoted) : t('docs.nextChat')}
                </Text>
            </Stack>
            <Button size="sm" variant="ghost" label={t('setup.plan.agentChange')} testID="docs-target-change" onPress={() => setOpen(true)} />
            <ActionSheet
                open={open}
                onClose={() => setOpen(false)}
                title={t('docs.addTo')}
                actions={[
                    { label: t.bare('docs.thisChat', { chat: quoted }), testID: 'docs-target-chat', onPress: () => onChange('chat') },
                    { label: t('docs.nextChat'), testID: 'docs-target-next', onPress: () => onChange('next') },
                ]}
            />
        </Row>
    );
}
