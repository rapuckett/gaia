// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Icon, Pressable, Row, Text, useTheme, type Tone } from '@/ui';

export interface ChipButtonProps {
    label: string;
    /** Spoken label when the visible one is shortened; defaults to `label`. */
    accessibilityLabel?: string;
    icon?: LucideIcon;
    /** `danger` is the desktop's tan outlined button; `accent` is its filled "New" button; `plain` is `.btn-secondary` and `primary` is `.btn-primary`. */
    variant?: 'default' | 'danger' | 'accent' | 'plain' | 'primary';
    disabled?: boolean;
    onPress: () => void;
    testID?: string;
}

/** The desktop's compact action button (`.btn-sm`): a small bordered chip inside a 44 pt touch target. */
export function ChipButton({ label, accessibilityLabel, icon, variant = 'default', disabled, onPress, testID }: ChipButtonProps) {
    const { colors, radius, space } = useTheme();
    const accent = variant === 'accent' || variant === 'plain' || variant === 'primary';
    const tone: Tone = variant === 'default' || variant === 'plain' ? 'primary' : variant === 'primary' ? 'onAccent' : 'accent';
    return (
        <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? label} minSize={44} testID={testID}>
            <View
                style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: accent ? space.lg : space.md,
                    paddingVertical: accent ? space.sm + 2 : space.xs + 2,
                    borderRadius: accent ? radius.md : radius.sm,
                    borderWidth: accent ? 0 : 1,
                    borderColor: variant === 'danger' ? colors.accent : colors.border,
                    backgroundColor: variant === 'accent' ? colors.accentDim : variant === 'primary' ? colors.accentFill : colors.bgTertiary,
                }}
            >
                <Row gap="xs" justify="center">
                    {icon ? <Icon icon={icon} size="sm" tone={tone} /> : null}
                    <Text role={accent ? 'ui' : 'caption'} weight={accent ? 'semibold' : 'medium'} tone={tone} numberOfLines={1}>
                        {label}
                    </Text>
                </Row>
            </View>
        </Pressable>
    );
}
