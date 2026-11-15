// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '../text/Text';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Spinner } from './Spinner';
import { Row } from '../layout/layout';
import { useLargeText } from '../theme/a11y';
import { useTheme } from '../theme/ThemeProvider';
import type { Tone } from '../theme/tone';

export interface ButtonProps {
    label: string;
    onPress?: () => void;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'md' | 'sm';
    icon?: LucideIcon;
    iconEnd?: LucideIcon;
    busy?: boolean;
    disabled?: boolean;
    full?: boolean;
    /** Let a long label take more lines instead of truncating. */
    wrap?: boolean;
    /** What a screen reader says instead of the visible label. */
    accessibilityLabel?: string;
    testID?: string;
}

export function Button({
    label,
    onPress,
    variant = 'secondary',
    size = 'md',
    icon,
    iconEnd,
    busy,
    disabled,
    full,
    wrap,
    accessibilityLabel,
    testID,
}: ButtonProps) {
    const { colors, radius } = useTheme();
    const largeText = useLargeText();
    const look: Record<NonNullable<ButtonProps['variant']>, { bg: string; border: string; tone: Tone }> = {
        primary: { bg: colors.accentFill, border: 'transparent', tone: 'onAccent' },
        secondary: { bg: colors.bgCard, border: colors.borderLight, tone: 'primary' },
        ghost: { bg: 'transparent', border: 'transparent', tone: 'accent' },
        danger: { bg: colors.dangerDim, border: 'transparent', tone: 'danger' },
    };
    const v = look[variant];
    return (
        <View style={full ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }}>
            <Pressable
                onPress={busy ? undefined : onPress}
                disabled={disabled}
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityState={{ busy: !!busy }}
                testID={testID}
            >
                <View
                    style={{
                        minHeight: size === 'sm' ? 36 : 48,
                        paddingHorizontal: size === 'sm' ? 12 : 16,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: v.border,
                        backgroundColor: v.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Row gap="sm" justify="center">
                        {busy ? (
                            <Spinner size="sm" tone={v.tone} />
                        ) : icon ? (
                            <Icon icon={icon} size="sm" tone={v.tone} />
                        ) : null}
                        {wrap || largeText ? (
                            <View style={{ flexShrink: 1, paddingVertical: 10 }}>
                                <Text role="ui" weight="medium" tone={v.tone} align="center">
                                    {label}
                                </Text>
                            </View>
                        ) : (
                            <Text role="ui" weight="medium" tone={v.tone} numberOfLines={1}>
                                {label}
                            </Text>
                        )}
                        {iconEnd && !busy ? <Icon icon={iconEnd} size="sm" tone={v.tone} /> : null}
                    </Row>
                </View>
            </Pressable>
        </View>
    );
}
