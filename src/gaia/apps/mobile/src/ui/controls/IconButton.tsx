// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Icon } from './Icon';
import { Pressable, PRESSABLE_MIN_SIZE } from './Pressable';
import { Spinner } from './Spinner';
import { useTheme } from '../theme/ThemeProvider';
import type { Tone } from '../theme/tone';

export interface IconButtonProps {
    icon: LucideIcon;
    label: string;
    onPress?: () => void;
    variant?: 'ghost' | 'filled' | 'outlined' | 'primary' | 'danger' | 'raised';
    size?: 'md' | 'sm';
    busy?: boolean;
    disabled?: boolean;
    testID?: string;
}

export function IconButton({
    icon,
    label,
    onPress,
    variant = 'ghost',
    size = 'md',
    busy,
    disabled,
    testID,
}: IconButtonProps) {
    const { colors, radius, shadows } = useTheme();
    const look: Record<NonNullable<IconButtonProps['variant']>, { bg: string; tone: Tone }> = {
        ghost: { bg: 'transparent', tone: 'secondary' },
        filled: { bg: colors.bgTertiary, tone: 'primary' },
        outlined: { bg: colors.bgTertiary, tone: 'primary' },
        primary: { bg: colors.accentFill, tone: 'onAccent' },
        danger: { bg: colors.dangerDim, tone: 'danger' },
        raised: { bg: colors.bgSecondary, tone: 'primary' },
    };
    const v = look[variant];
    const box = size === 'sm' ? 36 : variant === 'raised' ? 38 : 44;
    return (
        <View style={{ minWidth: PRESSABLE_MIN_SIZE, minHeight: PRESSABLE_MIN_SIZE, alignItems: 'center', justifyContent: 'center' }}>
            <Pressable
                onPress={busy ? undefined : onPress}
                disabled={disabled}
                accessibilityLabel={label}
                aria-busy={!!busy}
                testID={testID}
                minSize={box}
                radius={variant === 'raised' ? undefined : radius.md}
                slop={(PRESSABLE_MIN_SIZE - box) / 2}
            >
                <View
                    style={{
                        width: box,
                        height: box,
                        borderRadius: radius.md,
                        backgroundColor: v.bg,
                        ...(variant === 'raised' ? { borderWidth: 1, borderColor: colors.border, boxShadow: shadows.sm } : null),
                        ...(variant === 'outlined' ? { borderWidth: 1, borderColor: colors.border } : null),
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {busy ? <Spinner size="sm" tone={v.tone} /> : <Icon icon={icon} tone={v.tone} />}
                </View>
            </Pressable>
        </View>
    );
}
