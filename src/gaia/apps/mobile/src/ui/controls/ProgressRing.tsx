// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';
import { toneColor, type Tone } from '../theme/tone';
import { useAnnounceOnIos } from './Spinner';

export interface ProgressRingProps {
    /** Outer diameter; the ring fills the box and takes no layout space from its parent. */
    size: number;
    tone?: Tone;
    /** Names the wait for a screen reader, which hears it once when the ring appears. */
    accessibilityLabel?: string;
}

const STROKE = 2;

// An indeterminate ring laid over its parent (like the App Store's download button); touches pass through. Holds still under reduced motion.
export function ProgressRing({ size, tone = 'accent', accessibilityLabel }: ProgressRingProps) {
    const { colors } = useTheme();
    const reduced = useReducedMotion();
    const turn = useSharedValue(0);
    useAnnounceOnIos(accessibilityLabel);
    useEffect(() => {
        if (reduced) return;
        turn.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false);
        return () => cancelAnimation(turn);
    }, [reduced, turn]);
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
    const color = toneColor(colors, tone);
    return (
        <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
            {...(accessibilityLabel ? { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel, accessibilityLiveRegion: 'polite' as const } : null)}
        >
            <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: STROKE, borderColor: 'transparent', borderTopColor: color, borderRightColor: color }, style]} />
        </View>
    );
}
