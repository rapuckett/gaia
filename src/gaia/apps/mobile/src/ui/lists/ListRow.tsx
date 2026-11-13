// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Pressable } from '../controls/Pressable';
import { Row } from '../layout/layout';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';

export interface ListRowProps {
    title: string;
    subtitle?: string;
    leading?: ReactNode;
    trailing?: ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    selected?: boolean;
    titleLines?: number;
    /** Semibold title, e.g. an unread chat. */
    emphasized?: boolean;
    accessibilityLabel?: string;
    testID?: string;
}

export function ListRow({
    title,
    subtitle,
    leading,
    trailing,
    onPress,
    onLongPress,
    selected,
    titleLines = 1,
    emphasized,
    accessibilityLabel,
    testID,
}: ListRowProps) {
    const { colors, space } = useTheme();
    const body = (
        <View
            style={{
                minHeight: 48,
                paddingHorizontal: space.lg,
                paddingVertical: space.sm,
                backgroundColor: selected ? colors.bgActive : 'transparent',
                borderStartWidth: 3,
                borderStartColor: selected ? colors.accentSolid : 'transparent',
                justifyContent: 'center',
            }}
        >
            <Row gap="md">
                {leading}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text role="ui" weight={selected || emphasized ? 'semibold' : 'medium'} numberOfLines={titleLines}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text role="caption" tone="muted" numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                {trailing}
            </Row>
        </View>
    );
    if (!onPress && !onLongPress) return <View testID={testID}>{body}</View>;
    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ selected: !!selected }}
            minSize={48}
            testID={testID}
        >
            {body}
        </Pressable>
    );
}
