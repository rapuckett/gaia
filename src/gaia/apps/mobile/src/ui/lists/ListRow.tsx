// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../controls/Icon';
import { Pressable } from '../controls/Pressable';
import { Check } from '../icons';
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
    /** A choice row: `false` keeps the check's column empty so labels line up, `true` draws the check. Leave unset for any other row. */
    checked?: boolean;
    titleLines?: number;
    /** For long user content (a chat title): the lines it keeps at large sizes, where other titles show in full. */
    titleLargeLines?: number;
    /** Where a clipped title loses its characters: `middle` keeps a file's extension visible. */
    titleEllipsize?: 'tail' | 'middle';
    /** Where the title stops growing with the person's text size: for navigation labels. */
    titleMaxScale?: number;
    /** Let a long subtitle wrap to this many lines instead of truncating. */
    subtitleLines?: number;
    /** Semibold title, e.g. an unread chat. */
    emphasized?: boolean;
    accessibilityLabel?: string;
    testID?: string;
}

/** Reports the pressable's pressed look up to the row, so the highlight covers the trailing control too. */
function PressMirror({ highlight, onChange }: { highlight: boolean; onChange: (held: boolean) => void }) {
    useEffect(() => {
        onChange(highlight);
        return () => onChange(false);
    }, [highlight, onChange]);
    return null;
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
    checked,
    titleLines = 1,
    titleLargeLines,
    titleEllipsize,
    titleMaxScale,
    subtitleLines = 1,
    emphasized,
    accessibilityLabel,
    testID,
}: ListRowProps) {
    const { colors, space } = useTheme();
    const largeText = useLargeText();
    const [held, setHeld] = useState(false);
    // The whole row height stays tappable: the pressable grows to the trailing control's height.
    const [trailingHeight, setTrailingHeight] = useState(0);
    const pressable = !!onPress || !!onLongPress;
    const split = pressable && !!trailing;
    const content = (
        <Row gap="md" align={largeText ? 'start' : 'center'}>
            {checked !== undefined ? (
                <FirstLine role="ui" maxScale={titleMaxScale}>
                    <View testID="list-row-check" style={{ width: 16 }}>
                        {checked ? (
                            <View testID="list-row-check-mark">
                                <Icon icon={Check} size="sm" tone="accent" />
                            </View>
                        ) : null}
                    </View>
                </FirstLine>
            ) : leading ? (
                <FirstLine role="ui" maxScale={titleMaxScale}>{leading}</FirstLine>
            ) : null}
            {/* A row that isn't pressable keeps its label on the text block, so a trailing control stays a stop of its own. */}
            <View
                style={{ flex: 1, minWidth: 0 }}
                {...(!pressable && accessibilityLabel ? { accessible: true, accessibilityLabel } : null)}
            >
                <Text role="ui" weight={selected || emphasized ? 'semibold' : 'medium'} numberOfLines={titleLines} largeLines={titleLargeLines} ellipsize={titleEllipsize} maxScale={titleMaxScale}>
                    {title}
                </Text>
                {subtitle ? (
                    <Text role="caption" tone={subtitleTone} numberOfLines={subtitleLines}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {trailing && !split ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}
        </Row>
    );
    const surface = {
        minHeight: 48,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        backgroundColor: selected ? colors.bgActive : 'transparent',
        justifyContent: 'center',
    } as const;
    const body = <View style={surface}>{content}</View>;
    if (split) {
        // On iOS an accessible element hides its children, so the trailing control sits beside the pressable, not in it.
        return (
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    paddingEnd: space.lg,
                    gap: space.md,
                    backgroundColor: selected ? colors.bgActive : 'transparent',
                }}
            >
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                    <Pressable
                        onPress={onPress}
                        onLongPress={onLongPress}
                        accessibilityLabel={accessibilityLabel}
                        aria-selected={!!selected}
                        minSize={48}
                        testID={testID}
                    >
                        {({ highlight }) => (
                            <>
                                <PressMirror highlight={highlight} onChange={setHeld} />
                                <View style={{ ...surface, minHeight: Math.max(surface.minHeight, trailingHeight), backgroundColor: 'transparent', paddingEnd: 0 }}>{content}</View>
                            </>
                        )}
                    </Pressable>
                </View>
                <View
                    onLayout={(e) => setTrailingHeight(e.nativeEvent.layout.height)}
                    style={{ flexShrink: 0, paddingVertical: space.sm, alignSelf: largeText ? 'flex-start' : 'center', opacity: held ? 0.72 : 1 }}
                >
                    {trailing}
                </View>
            </View>
        );
    }
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
