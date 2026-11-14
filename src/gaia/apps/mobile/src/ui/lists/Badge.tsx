// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';
import type { Tone } from '../theme/tone';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
    const { colors, radius } = useTheme();
    const look: Record<BadgeTone, { bg: string; text: Tone }> = {
        neutral: { bg: colors.bgTertiary, text: 'secondary' },
        accent: { bg: colors.accentDim, text: 'accent' },
        success: { bg: colors.accentGreenDim, text: 'success' },
        warning: { bg: colors.accentYellowDim, text: 'warning' },
        danger: { bg: colors.dangerDim, text: 'danger' },
    };
    const v = look[tone];
    return (
        <View style={{ alignSelf: 'flex-start', backgroundColor: v.bg, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, minWidth: 20 }}>
            <Text role="caption" weight="semibold" tone={v.text} numberOfLines={1} align="center">
                {label}
            </Text>
        </View>
    );
}
