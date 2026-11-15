// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, Pressable, Row, Stack, Surface, Text, useTheme } from '@/ui';
import { ChevronDown, ChevronRight } from '@/ui/icons';

export interface SettingsGroupProps {
    title: string;
    hint?: string | null;
    count: number;
    open: boolean;
    onToggle: () => void;
    children?: ReactNode;
}

/** The desktop's `.settings-disclosure`: a bordered group whose header shows a chevron, title, hint and count. */
export function SettingsGroup({ title, hint, count, open, onToggle, children }: SettingsGroupProps) {
    const { colors, radius, space } = useTheme();
    return (
        <Surface tone="primary" radius="md" border>
            <Pressable onPress={onToggle} accessibilityLabel={title} accessibilityState={{ expanded: open }}>
                <View style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}>
                    <Row gap="sm" align={hint ? 'start' : 'center'}>
                        <Icon icon={open ? ChevronDown : ChevronRight} size="sm" tone="secondary" />
                        <Stack flex={1} gap="xs">
                            <Text role="ui" weight="semibold">{title}</Text>
                            {hint ? <Text role="label" tone="secondary">{hint}</Text> : null}
                        </Stack>
                        <View style={{ backgroundColor: colors.bgHover, borderRadius: radius.full, paddingHorizontal: 7, minWidth: 22 }}>
                            <Text role="caption" tone="secondary" align="center">{String(count)}</Text>
                        </View>
                    </Row>
                </View>
            </Pressable>
            {open ? (
                <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.sm }}>{children}</View>
            ) : null}
        </Surface>
    );
}
