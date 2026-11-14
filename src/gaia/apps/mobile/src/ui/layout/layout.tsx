// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View, type AccessibilityRole, type DimensionValue, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { Space } from '../tokens/space';

type Align = 'start' | 'center' | 'end' | 'stretch';
type Justify = 'start' | 'center' | 'end' | 'between';

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const;
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const;

interface BoxProps {
    children?: ReactNode;
    gap?: Space;
    align?: Align;
    justify?: Justify;
    flex?: number;
    /** Where this box sits across its parent's axis; `end` is the reading end in either direction. */
    self?: 'start' | 'center' | 'end';
    maxWidth?: DimensionValue;
    /** Layout direction of this box, for content whose language differs from the UI's. */
    dir?: 'ltr' | 'rtl';
    testID?: string;
    accessibilityRole?: AccessibilityRole;
}

export interface StackProps extends BoxProps {
    padding?: Space;
    paddingX?: Space;
    paddingY?: Space;
}

export interface RowProps extends BoxProps {
    wrap?: boolean;
}

type Mut<T> = { -readonly [K in keyof T]: T[K] };

function boxStyle(space: Record<Space, number>, p: BoxProps): Mut<ViewStyle> {
    const style: Mut<ViewStyle> = {};
    if (p.gap) style.gap = space[p.gap];
    if (p.align) style.alignItems = ALIGN[p.align];
    if (p.justify) style.justifyContent = JUSTIFY[p.justify];
    if (p.flex !== undefined) style.flex = p.flex;
    if (p.dir) style.direction = p.dir;
    if (p.self) style.alignSelf = ALIGN[p.self];
    if (p.maxWidth !== undefined) style.maxWidth = p.maxWidth;
    return style;
}

export function Stack({ children, padding, paddingX, paddingY, testID, accessibilityRole, ...box }: StackProps) {
    const { space } = useTheme();
    const style = boxStyle(space, box);
    if (padding) style.padding = space[padding];
    if (paddingX) style.paddingHorizontal = space[paddingX];
    if (paddingY) style.paddingVertical = space[paddingY];
    return (
        <View style={style} testID={testID} accessibilityRole={accessibilityRole}>
            {children}
        </View>
    );
}

export function Row({ children, wrap, align = 'center', testID, accessibilityRole, ...box }: RowProps) {
    const { space } = useTheme();
    const style = boxStyle(space, { ...box, align });
    style.flexDirection = 'row';
    if (wrap) style.flexWrap = 'wrap';
    return (
        <View style={style} testID={testID} accessibilityRole={accessibilityRole}>
            {children}
        </View>
    );
}

export function Spacer() {
    return <View style={{ flex: 1 }} />;
}
