// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { Pressable as RNPressable, type AccessibilityRole, type AccessibilityState } from 'react-native';

export interface PressableProps {
    children?: ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityRole?: AccessibilityRole;
    accessibilityState?: AccessibilityState;
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
