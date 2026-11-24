// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { toneColor, type Tone } from '../theme/tone';

export interface SpinnerProps {
    size?: 'sm' | 'md';
    tone?: Tone;
    /** Names the wait for a screen reader, which hears it once when the spinner appears. Leave it out beside text that already says it. */
    accessibilityLabel?: string;
}

export function Spinner({ size = 'md', tone = 'secondary', accessibilityLabel }: SpinnerProps) {
    const { colors } = useTheme();
    // Android speaks a live region on its own; iOS needs the announcement.
    useEffect(() => {
        if (accessibilityLabel && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(accessibilityLabel);
    }, [accessibilityLabel]);
    return (
        <ActivityIndicator
            size={size === 'sm' ? 'small' : 'large'}
            color={toneColor(colors, tone)}
            {...(accessibilityLabel ? { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel, accessibilityLiveRegion: 'polite' as const } : null)}
        />
    );
}
