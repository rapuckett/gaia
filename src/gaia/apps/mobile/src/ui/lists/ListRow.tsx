// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Pressable } from '../controls/Pressable';
import { Row } from '../layout/layout';
import { FirstLine } from '../text/FirstLine';
import { useLargeText } from '../theme/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';
import type { Tone } from '../theme/tone';

export interface ListRowProps {
    title: string;
    subtitle?: string;
    /** `danger` for a failed state such as "1 not sent". */
    subtitleTone?: Tone;
    leading?: ReactNode;
    trailing?: ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    selected?: boolean;
    titleLines?: number;
    /** For long user content (a chat title): the lines it keeps at large sizes, where other titles show in full. */
    titleLargeLines?: number;
    /** Where the title stops growing with the person's text size: for navigation labels. */
    titleMaxScale?: number;
    /** Let a long subtitle wrap to this many lines instead of truncating. */
    subtitleLines?: number;
    /** Semibold title, e.g. an unread chat. */
    emphasized?: boolean;
    accessibilityLabel?: string;
    testID?: string;
}

export function ListRow({
    title,
    subtitle,
    subtitleTone = 'muted',
    leading,
    trailing,
    onPress,
    onLongPress,
    selected,
    titleLines = 1,
    titleLargeLines,
    titleMaxScale,
    subtitleLines = 1,
    emphasized,
    accessibilityLabel,
    testID,
}: ListRowProps) {
    const { colors, space } = useTheme();
    const largeText = useLargeText();
    const body = (
        <View
            style={{
                minHeight: 48,
                paddingHorizontal: space.lg,
                paddingVertical: space.sm,
                backgroundColor: selected ? colors.bgActive : 'transparent',
                justifyContent: 'center',
            }}
        >
            <Row gap="md" align={largeText ? 'start' : 'center'}>
                {leading ? <FirstLine role="ui" maxScale={titleMaxScale}>{leading}</FirstLine> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text role="ui" weight={selected || emphasized ? 'semibold' : 'medium'} numberOfLines={titleLines} largeLines={titleLargeLines} maxScale={titleMaxScale}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text role="caption" tone={subtitleTone} numberOfLines={subtitleLines}>
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
            aria-selected={!!selected}
            minSize={48}
            testID={testID}
        >
            {body}
        </Pressable>
    );
}
