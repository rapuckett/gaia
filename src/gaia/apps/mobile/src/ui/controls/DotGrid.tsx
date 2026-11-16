// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { type ComponentRef, forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Mask, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

// The desktop's new-chat backdrop at rest (webui npuTiles.ts): 2 px dots on a 30 px pitch.
const PITCH = 30;
const DOT = 2;
// Desktop setHole: dots sit at 30% inside the ellipse (d < 0.75) and ramp to full by d = 1.5.
const DIMMED = 0.3;
const FULL_AT = 1.5;
const EXTRA_Y = 10;

export type DotGridHandle = ComponentRef<typeof View>;

export interface DimRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface DotGridProps {
    /** Regions, in this grid's own coordinates, the dots fade out behind. */
    dimBehind?: DimRect[];
    onLayout?: () => void;
}

export const DotGrid = forwardRef<DotGridHandle, DotGridProps>(function DotGrid({ dimBehind = [], onLayout }, ref) {
    const { colors, scheme } = useTheme();
    const mid = (PITCH - DOT) / 2;
    const dimmed = Math.round(DIMMED * 255);
    const gray = `rgb(${dimmed},${dimmed},${dimmed})`;
    return (
        <View
            ref={ref}
            collapsable={false}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            onLayout={onLayout}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Defs>
                    <Pattern id="dot-grid" width={PITCH} height={PITCH} patternUnits="userSpaceOnUse">
                        <Rect x={mid} y={mid} width={DOT} height={DOT} fill={colors.textPrimary} fillOpacity={scheme === 'dark' ? 0.17 : 0.14} />
                    </Pattern>
                    {dimBehind.length > 0 && (
                        <>
                            <RadialGradient id="dot-dim" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
                                <Stop offset={0} stopColor={gray} stopOpacity={1} />
                                <Stop offset={0.75 / FULL_AT} stopColor={gray} stopOpacity={1} />
                                <Stop offset={1} stopColor={gray} stopOpacity={0} />
                            </RadialGradient>
                            <Mask id="dot-dim-mask" maskUnits="userSpaceOnUse" x={-2000} y={-2000} width={4000} height={4000}>
                                <Rect x={-2000} y={-2000} width={4000} height={4000} fill="white" />
                                {dimBehind.map((r, i) => {
                                    const rx = (r.width / 2) * FULL_AT;
                                    const ry = (r.height / 2 + EXTRA_Y) * FULL_AT;
                                    return (
                                        <Rect
                                            key={i}
                                            testID="dot-dim-region"
                                            x={r.x + r.width / 2 - rx}
                                            y={r.y + r.height / 2 - ry}
                                            width={rx * 2}
                                            height={ry * 2}
                                            fill="url(#dot-dim)"
                                        />
                                    );
                                })}
                            </Mask>
                        </>
                    )}
                </Defs>
                <Rect width="100%" height="100%" fill="url(#dot-grid)" mask={dimBehind.length > 0 ? 'url(#dot-dim-mask)' : undefined} />
            </Svg>
        </View>
    );
});
