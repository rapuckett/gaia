// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row, Spacer, Stack, Text, UpButton } from '@/ui';
import { useLargeText } from '@/ui/theme/a11y';

/** The settings header: back (when given), the title, and a badge beside the title, and actions at the end. At large text sizes the title goes under the buttons. */
export function SettingsHeader({ title, backLabel, onBack, titleEnd, end }: { title: string; backLabel?: string; onBack?: () => void; titleEnd?: ReactNode; end?: ReactNode }) {
    const largeText = useLargeText();
    const back = onBack && backLabel ? <UpButton label={backLabel} onPress={onBack} /> : null;
    const titleText = <Text role="title" weight="semibold" numberOfLines={1} largeLines={2}>{title}</Text>;
    if (largeText) {
        return (
            <Stack paddingX="lg" paddingY="sm" gap="xs" accessibilityRole="header">
                {back || end ? (
                    <Row gap="sm">
                        {back}
                        <Spacer />
                        {end}
                    </Row>
                ) : null}
                <Row gap="sm" wrap>
                    <View style={{ flexShrink: 1, minWidth: 0 }}>{titleText}</View>
                    {titleEnd}
                </Row>
            </Stack>
        );
    }
    return (
        <Stack paddingX="lg" paddingY="sm">
            <Row gap="sm" accessibilityRole="header">
                {back}
                <Row gap="sm" flex={1}>
                    <Stack>{titleText}</Stack>
                    {titleEnd}
                </Row>
                {end}
            </Row>
        </Stack>
    );
}
