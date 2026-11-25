// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useDirection } from '@/i18n/useT';
import { Icon } from '../controls/Icon';
import { Pressable } from '../controls/Pressable';
import { Row } from '../layout/layout';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';

export interface PillTab {
    value: string;
    label: string;
    icon?: LucideIcon;
    /** A small green dot after the label, e.g. a connected provider. */
    dot?: string;
    disabled?: boolean;
    accessibilityLabel?: string;
}

export interface PillTabsProps {
    tabs: PillTab[];
    value: string;
    onChange: (value: string) => void;
    accessibilityLabel?: string;
    testID?: string;
}

const FADE_STEPS = [0.15, 0.35, 0.55, 0.75, 0.9];

/** The desktop's `.provider-tabs` as one scrolling row: the active pill accent-tinted and kept in view, a fade while more is hidden. */
export function PillTabs({ tabs, value, onChange, accessibilityLabel, testID }: PillTabsProps) {
    const { colors, radius, space } = useTheme();
    const dir = useDirection();
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const xs = useRef<Record<string, number>>({});
    const [box, setBox] = useState({ view: 0, content: 0 });
    const [offset, setOffset] = useState(0);
    const more = box.content > box.view + 1 && Math.abs(offset) < box.content - box.view - 1;
    const reveal = () => {
        const x = xs.current[value];
        if (x !== undefined && dir === 'ltr') scroller.current?.scrollTo({ x: Math.max(0, x - space.sm), animated: true });
    };
    useEffect(reveal, [value, box.content]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <View>
        <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            testID={testID}
            accessibilityRole="radiogroup"
            accessibilityLabel={accessibilityLabel}
            contentContainerStyle={{ gap: space.sm }}
            onLayout={(e) => setBox((b) => ({ ...b, view: e.nativeEvent.layout.width }))}
            onContentSizeChange={(w) => setBox((b) => ({ ...b, content: w }))}
            onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={64}
        >
            {tabs.map((tab) => {
                const on = tab.value === value;
                return (
                    <View key={tab.value} onLayout={(e) => { xs.current[tab.value] = e.nativeEvent.layout.x; if (on) reveal(); }}>
                    <Pressable
                        onPress={() => onChange(tab.value)}
                        disabled={tab.disabled && !on}
                        accessibilityRole="radio"
                        accessibilityLabel={tab.accessibilityLabel ?? tab.label}
                        aria-checked={on}
                        minSize={44}
                        testID={testID ? `${testID}-${tab.value}` : undefined}
                    >
                        <View
                            style={{
                                minHeight: 36,
                                paddingHorizontal: space.md,
                                justifyContent: 'center',
                                borderRadius: radius.full,
                                borderWidth: 1,
                                borderColor: on ? colors.accentLight : colors.borderLight,
                                backgroundColor: on ? colors.accentDim : 'transparent',
                                opacity: tab.disabled && !on ? 0.6 : 1,
                            }}
                        >
                            <Row gap="xs">
                                {tab.icon ? <Icon icon={tab.icon} size="sm" tone="secondary" /> : null}
                                <View style={{ flexShrink: 1 }}>
                                    <Text role="label" tone={on ? 'primary' : 'secondary'} numberOfLines={1} compact>
                                        {tab.label}
                                    </Text>
                                </View>
                                {tab.dot ? (
                                    <View
                                        accessibilityLabel={tab.dot}
                                        style={{ width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.accentGreen }}
                                    />
                                ) : null}
                            </Row>
                        </View>
                    </Pressable>
                    </View>
                );
            })}
        </ScrollView>
        {more ? (
            <View pointerEvents="none" testID={testID ? `${testID}-fade` : undefined} style={{ position: 'absolute', end: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
                {(dir === 'ltr' ? FADE_STEPS : [...FADE_STEPS].reverse()).map((o, i) => (
                    <View key={i} style={{ width: 6, backgroundColor: colors.bgPrimary, opacity: o }} />
                ))}
            </View>
        ) : null}
        </View>
    );
}
