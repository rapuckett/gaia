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

/** Android shows press feedback as the Material ripple (the `ripple` color token); iOS and web a highlight. */
export const RIPPLE = Platform.OS === 'android';

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
    /** Dims the control; defaults to `disabled`. False keeps a disabled control at full strength, like the desktop's not-yet-downloaded agent row. */
    dimmed?: boolean;
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
    /** iOS: VoiceOver's double tap and Full Keyboard Access's Space, in place of the simulated touch that reaches `onPress`. */
    onAccessibilityTap?: () => void;
    /** False lets a screen reader reach the children (links) instead of reading one element. */
    accessible?: boolean;
    /** Minimum hit area in points; 48 unless a parent already guarantees it. */
    minSize?: number;
    /** Sizes to its content (a short label in a row of text); hit slop keeps the target `minSize` wide and tall without changing the layout. */
    inline?: boolean;
    /** With `inline` or `shape`: keeps the content's own height, so a link inside a paragraph's rhythm doesn't grow; the target is `minSize` tall through hit slop. */
    hugHeight?: boolean;
    /** Android: an icon-only control's borderless ripple, a circle of half the target. */
    round?: boolean;
    /**
     * Android: clip the ripple to a drawn shape smaller than the target, with these corners. `hug` keeps the shape at
     * its content's width at the start; otherwise it fills the target's width.
     */
    shape?: { radius: number; hug?: boolean };
    testID?: string;
}

export function Pressable({
    children,
    onPress,
    onLongPress,
    disabled,
    dimmed = disabled,
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
    onAccessibilityTap,
    accessible,
    minSize = PRESSABLE_MIN_SIZE,
    inline,
    hugHeight,
    round,
    shape,
    testID,
}: PressableProps) {
    const { colors } = useTheme();
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const [box, setBox] = useState<{ width: number; height: number } | null>(null);
    const clip = RIPPLE && shape != null;
    const slop = inline && !clip ? Math.max(0, Math.ceil((minSize - width) / 2)) : 0;
    // A clipped shape keeps the full target through hit slop, since its own bounds are smaller.
    const ringX = clip && box ? Math.max(0, Math.ceil((minSize - box.width) / 2)) : 0;
    const ringY = clip && box ? Math.max(0, Math.ceil((minSize - box.height) / 2)) : 0;
    // Where an inline link keeps its content's height, the target grows by slop, not layout.
    const slopY = inline && !clip ? Math.max(0, Math.ceil((minSize - height) / 2)) : 0;
    const hitSlop = slop || ringX || ringY || slopY ? { left: slop + ringX, right: slop + ringX, top: ringY + slopY, bottom: ringY + slopY } : undefined;
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
            onAccessibilityTap={onAccessibilityTap}
            aria-busy={ariaBusy}
            aria-checked={ariaChecked}
            aria-disabled={!!disabled}
            aria-expanded={ariaExpanded}
            aria-haspopup={ariaHasPopup}
            aria-selected={ariaSelected}
            testID={testID}
            hitSlop={hitSlop}
            android_ripple={
                RIPPLE
                    ? round
                        ? { color: colors.ripple, borderless: true, radius: minSize / 2, foreground: true }
                        : { color: colors.ripple, borderless: false, foreground: true }
                    : undefined
            }
            onLayout={inline ? (e) => { setWidth(e.nativeEvent.layout.width); setHeight(e.nativeEvent.layout.height); } : undefined}
            style={({ pressed }) => ({
                minWidth: inline || clip ? undefined : minSize,
                minHeight: clip || (inline && hugHeight) ? undefined : minSize,
                maxWidth: hugHeight ? '100%' : undefined,
                justifyContent: 'center',
                opacity: dimmed ? 0.45 : pressed && !RIPPLE ? 0.72 : 1,
            })}
        >
            {({ pressed }) => (typeof children === 'function' ? children({ pressed, highlight: pressed && !RIPPLE }) : children)}
        </RNPressable>
    );
    if (!clip) return pressable;
    // A view's own overflow doesn't clip its foreground, where the ripple draws, so the shape is clipped from outside;
    // the clipping view takes the same hit slop, because touches outside its bounds never reach its children.
    return (
        <View testID={testID ? `${testID}-target` : undefined} style={{ minHeight: hugHeight ? undefined : minSize, maxWidth: hugHeight ? '100%' : undefined, justifyContent: 'center', alignItems: shape.hug ? 'flex-start' : 'stretch' }}>
            <View
                testID={testID ? `${testID}-clip` : undefined}
                hitSlop={hitSlop}
                onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                style={{ overflow: 'hidden', borderRadius: shape.radius, maxWidth: hugHeight ? '100%' : undefined }}
            >
                {pressable}
            </View>
        </View>
    );
}
