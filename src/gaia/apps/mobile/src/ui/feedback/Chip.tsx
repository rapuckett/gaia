// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from '../controls/Icon';
import { Pressable } from '../controls/Pressable';
import { Check } from '../icons';
import { Row } from '../layout/layout';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';

export interface ChipProps {
    label: string;
    /** The full label a screen reader says when `label` is the bare one. */
    accessibilityLabel?: string;
    /** What pressing it does, when the label alone doesn't say. */
    hint?: string;
    selected?: boolean;
    /** `tab` for a chip in a tab list, `checkbox` for an on/off chip (`selected` is its checked state); the others stay buttons. */
    role?: 'tab' | 'checkbox';
    onPress?: () => void;
    icon?: LucideIcon;
    testID?: string;
}

// Selected shows a check beside the label as well as the accent fill.
export function Chip({ label, accessibilityLabel, hint, selected, role, onPress, icon, testID }: ChipProps) {
    const { colors, radius } = useTheme();
    return (
        <Pressable inline hugHeight shape={{ radius: radius.full, hug: true }} onPress={onPress} accessibilityRole={role} accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={hint} aria-selected={role === 'checkbox' ? undefined : !!selected} aria-checked={role === 'checkbox' ? !!selected : undefined} testID={testID}>
            <View
                style={{
                    alignSelf: 'flex-start',
                    maxWidth: '100%',
                    minHeight: 32,
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: selected ? colors.accentSolid : colors.borderLight,
                    backgroundColor: selected ? colors.accentDim : colors.bgCard,
                }}
            >
                <Row gap="xs">
                    {selected ? <Icon icon={Check} size="sm" tone="accent" /> : icon ? <Icon icon={icon} size="sm" tone="secondary" /> : null}
                    <View style={{ flexShrink: 1 }}>
                        <Text role="label" weight="medium" tone={selected ? 'accent' : 'primary'} numberOfLines={1} compact>
                            {label}
                        </Text>
                    </View>
                </Row>
            </View>
        </Pressable>
    );
}
