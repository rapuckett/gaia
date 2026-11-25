// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useDirection } from '@/i18n/useT';
import { Icon } from '../controls/Icon';
import { Pressable } from '../controls/Pressable';
import { Row } from '../layout/layout';
import { ScrollFade, type ScrollFadeHandle } from '../layout/ScrollFade';
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

/** The desktop's `.provider-tabs` as one scrolling row: the active pill accent-tinted and kept in view, a fade while more is hidden. */
export function PillTabs({ tabs, value, onChange, accessibilityLabel, testID }: PillTabsProps) {
    const { colors, radius, space } = useTheme();
    const dir = useDirection();
    const scroller = useRef<ScrollFadeHandle>(null);
    const xs = useRef<Record<string, number>>({});
    const reveal = () => {
        const x = xs.current[value];
        if (x !== undefined && dir === 'ltr') scroller.current?.scrollTo({ x: Math.max(0, x - space.sm), animated: true });
    };
    useEffect(reveal, [value]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <ScrollFade
            ref={scroller}
            showsHorizontalScrollIndicator={false}
            testID={testID}
            accessibilityRole="radiogroup"
            accessibilityLabel={accessibilityLabel}
            contentContainerStyle={{ gap: space.sm }}
            onContentSizeChange={reveal}
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
        </ScrollFade>
    );
}
