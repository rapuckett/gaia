// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { isolateUnit } from '@webui/i18n/registry';

import { useT } from '@/i18n/useT';
import { ActionSheet, Pressable, Row, Stack, Text } from '@/ui';

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
                {t('mobileApp.docs.addsToNext')}
            </Text>
        );
    }
    const quoted = `“${chatTitle}”`;
    return (
        <Row gap="sm" align="center" testID="docs-target">
            <Stack flex={1}>
                <Text weight="semibold" numberOfLines={1} testID="docs-target-value">
                    {target === 'chat' ? t('mobileApp.docs.addsTo', { title: isolateUnit(chatTitle) }) : t('mobileApp.docs.addsToNext')}
                </Text>
            </Stack>
            <Pressable accessibilityLabel={t('mobileApp.docs.targetChangeAria')} testID="docs-target-change" onPress={() => setOpen(true)}>
                <Text tone="accent">{t('mobileApp.docs.targetChange')}</Text>
            </Pressable>
            <ActionSheet
                open={open}
                onClose={() => setOpen(false)}
                title={t('docs.addTo')}
                message={t('docs.hint')}
                actions={[
                    { label: t.bare('docs.thisChat', { chat: quoted }), testID: 'docs-target-chat', onPress: () => onChange('chat') },
                    { label: t('docs.nextChat'), testID: 'docs-target-next', onPress: () => onChange('next') },
                ]}
            />
        </Row>
    );
}
