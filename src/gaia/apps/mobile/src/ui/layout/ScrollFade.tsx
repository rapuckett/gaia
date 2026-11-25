// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { forwardRef, useState, type ComponentRef } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native';
import { useDirection } from '@/i18n/useT';
import { useTheme } from '../theme/ThemeProvider';

export const SCROLL_FADE_WIDTH = 24;
const SLICES = 12;
const SLICE_WIDTH = SCROLL_FADE_WIDTH / SLICES;
// Opacity per slice, from the content side to the edge.
const RAMP = Array.from({ length: SLICES }, (_, i) => ((i + 1) / SLICES) ** 1.4);

export type ScrollFadeHandle = ComponentRef<typeof ScrollView>;

export interface ScrollFadeProps extends Omit<ScrollViewProps, 'horizontal'> {
    /** Color the fades start from: the surface the scroller sits on. Defaults to the primary background. */
    background?: string;
    /** Also the scroller's testID; the fades are `<testID>-fade-start` and `<testID>-fade`. */
    testID?: string;
}

function Fade({ side, color, testID, ltr }: { side: 'start' | 'end'; color: string; testID?: string; ltr: boolean }) {
    // Slices run inner to outer in reading order at the end edge, so reverse them at the start edge.
    const towardEdgeIsRight = side === 'end' ? ltr : !ltr;
    const slices = towardEdgeIsRight ? RAMP : [...RAMP].reverse();
    return (
        <View
            pointerEvents="none"
            testID={testID}
            style={{ position: 'absolute', top: 0, bottom: 0, width: SCROLL_FADE_WIDTH, flexDirection: 'row', [side]: 0 }}
        >
            {slices.map((o, i) => (
                <View key={i} style={{ width: SLICE_WIDTH, backgroundColor: color, opacity: o }} />
            ))}
        </View>
    );
}

/** A horizontal ScrollView with a 24 pt fade at each edge while more content is hidden that way. */
export const ScrollFade = forwardRef<ScrollFadeHandle, ScrollFadeProps>(function ScrollFade(
    { background, testID, onLayout, onContentSizeChange, onScroll, scrollEventThrottle = 64, ...rest },
    ref,
) {
    const { colors } = useTheme();
    const dir = useDirection();
    const [box, setBox] = useState({ view: 0, content: 0 });
    const [offset, setOffset] = useState(0);
    const color = background ?? colors.bgPrimary;
    const overflowing = box.content > box.view + 1;
    const awayFromStart = overflowing && Math.abs(offset) > 1;
    const more = overflowing && Math.abs(offset) < box.content - box.view - 1;
    return (
        <View>
            <ScrollView
                {...rest}
                ref={ref}
                horizontal
                testID={testID}
                scrollEventThrottle={scrollEventThrottle}
                onLayout={(e: LayoutChangeEvent) => {
                    setBox((b) => ({ ...b, view: e.nativeEvent.layout.width }));
                    onLayout?.(e);
                }}
                onContentSizeChange={(w, h) => {
                    setBox((b) => ({ ...b, content: w }));
                    onContentSizeChange?.(w, h);
                }}
                onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                    setOffset(e.nativeEvent.contentOffset.x);
                    onScroll?.(e);
                }}
            />
            {awayFromStart ? <Fade side="start" color={color} ltr={dir === 'ltr'} testID={testID ? `${testID}-fade-start` : undefined} /> : null}
            {more ? <Fade side="end" color={color} ltr={dir === 'ltr'} testID={testID ? `${testID}-fade` : undefined} /> : null}
        </View>
    );
});
