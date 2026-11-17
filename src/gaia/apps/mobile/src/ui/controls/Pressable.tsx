// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';
import {
    Pressable as RNPressable,
    type AccessibilityActionEvent,
    type AccessibilityActionInfo,
    type AccessibilityRole,
} from 'react-native';

export interface PressableProps {
    children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
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
    minSize = 48,
    inline,
    testID,
}: PressableProps) {
    const [width, setWidth] = useState(0);
    const slop = inline ? Math.max(0, Math.ceil((minSize - width) / 2)) : 0;
    return (
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
            hitSlop={slop ? { left: slop, right: slop } : undefined}
            onLayout={inline ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}
            style={({ pressed }) => ({
                minWidth: inline ? undefined : minSize,
                minHeight: minSize,
                justifyContent: 'center',
                opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
            })}
        >
            {({ pressed }) => (typeof children === 'function' ? children({ pressed }) : children)}
        </RNPressable>
    );
}
