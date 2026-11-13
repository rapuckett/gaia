// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import {
    Pressable as RNPressable,
    type AccessibilityActionEvent,
    type AccessibilityActionInfo,
    type AccessibilityRole,
    type AccessibilityState,
} from 'react-native';

export interface PressableProps {
    children?: ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityRole?: AccessibilityRole;
    accessibilityState?: AccessibilityState;
    /** Extra screen-reader actions, e.g. what a long-press does. */
    accessibilityActions?: readonly AccessibilityActionInfo[];
    onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
    /** Minimum hit area in points; 48 unless a parent already guarantees it. */
    minSize?: number;
    testID?: string;
}

export function Pressable({
    children,
    onPress,
    onLongPress,
    disabled,
    accessibilityLabel,
    accessibilityRole = 'button',
    accessibilityState,
    accessibilityActions,
    onAccessibilityAction,
    minSize = 48,
    testID,
}: PressableProps) {
    return (
        <RNPressable
            onPress={onPress}
            onLongPress={onLongPress}
            disabled={disabled}
            accessibilityRole={accessibilityRole}
            accessibilityLabel={accessibilityLabel}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
            testID={testID}
            style={({ pressed }) => ({
                minWidth: minSize,
                minHeight: minSize,
                justifyContent: 'center',
                opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
            })}
        >
            {children}
        </RNPressable>
    );
}
