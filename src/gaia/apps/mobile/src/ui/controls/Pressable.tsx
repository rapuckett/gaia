// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';
import {
    Platform,
    Pressable as RNPressable,
    View,
    type AccessibilityActionEvent,
    type AccessibilityActionInfo,
    type AccessibilityRole,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export const PRESSABLE_MIN_SIZE = 48;

/** Android shows press feedback as the Material ripple, bounded to the Pressable (a rounded parent clips it); iOS and web a highlight. */
export const RIPPLE = Platform.OS === 'android';
// The ripple draws over the label, so it is a light state layer of the text color, as the tint tokens are.
const RIPPLE_ALPHA = 0.12;

export interface PressState {
    pressed: boolean;
    /** Draw the pressed look (the pressed background token): true while pressed, except on Android, whose ripple is the feedback. */
    highlight: boolean;
}

export interface PressableProps {
    children?: ReactNode | ((state: PressState) => ReactNode);
    onPress?: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    accessibilityRole?: AccessibilityRole;
    'aria-busy'?: boolean;
    'aria-checked'?: boolean | 'mixed';
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'dialog' | 'listbox' | 'menu';
    'aria-selected'?: boolean;
    /** Extra screen-reader actions, e.g. what a long-press does. */
    accessibilityActions?: readonly AccessibilityActionInfo[];
    onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
    /** False lets a screen reader reach the children (links) instead of reading one element. */
    accessible?: boolean;
    /** Minimum hit area in points; 48 unless a parent already guarantees it. */
    minSize?: number;
    /** Sizes to its content (a short label in a row of text); a horizontal hit slop keeps the target `minSize` wide. */
    inline?: boolean;
    /**
     * A touchable ring around a shape smaller than its target: this much space on every side, in points. With `radius`
     * (the shape's corners) Android's ripple is clipped to the shape; leave `radius` unset for a shape with a shadow.
     */
    slop?: number;
    radius?: number;
    testID?: string;
}

export function Pressable({
    children,
    onPress,
    onLongPress,
    disabled,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole = 'button',
    'aria-busy': ariaBusy,
    'aria-checked': ariaChecked,
    'aria-expanded': ariaExpanded,
    'aria-haspopup': ariaHasPopup,
    'aria-selected': ariaSelected,
    accessibilityActions,
    onAccessibilityAction,
    accessible,
    minSize = PRESSABLE_MIN_SIZE,
    inline,
    radius,
    slop: ring = 0,
    testID,
}: PressableProps) {
    const { colors } = useTheme();
    const [width, setWidth] = useState(0);
    const slop = inline ? Math.max(0, Math.ceil((minSize - width) / 2)) : 0;
    const hitSlop = slop || ring ? { left: slop + ring, right: slop + ring, top: ring, bottom: ring } : undefined;
    const pressable = (
        <RNPressable
            onPress={onPress}
            onLongPress={onLongPress}
            disabled={disabled}
            accessibilityRole={accessibilityRole}
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            accessible={accessible}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            aria-busy={ariaBusy}
            aria-checked={ariaChecked}
            aria-disabled={!!disabled}
            aria-expanded={ariaExpanded}
            aria-haspopup={ariaHasPopup}
            aria-selected={ariaSelected}
            testID={testID}
            hitSlop={hitSlop}
            android_ripple={RIPPLE ? { color: colors.textPrimary, alpha: RIPPLE_ALPHA, borderless: false, foreground: true } : undefined}
            onLayout={inline ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}
            style={({ pressed }) => ({
                minWidth: inline ? undefined : minSize,
                minHeight: minSize,
                justifyContent: 'center',
                opacity: disabled ? 0.45 : pressed && !RIPPLE ? 0.72 : 1,
            })}
        >
            {({ pressed }) => (typeof children === 'function' ? children({ pressed, highlight: pressed && !RIPPLE }) : children)}
        </RNPressable>
    );
    if (!ring) return pressable;
    if (!RIPPLE || radius == null) return <View style={{ padding: ring }}>{pressable}</View>;
    // A view's own overflow doesn't clip its foreground, where the ripple draws, so the shape is clipped from outside;
    // the ring is a transparent border because touches outside a clipping view's bounds never reach it.
    return (
        <View style={{ overflow: 'hidden', borderWidth: ring, borderColor: 'transparent', borderRadius: radius + ring }}>
            {pressable}
        </View>
    );
}
