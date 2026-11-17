// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { maxScaleFor, Text, type TextProps } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface NumberMarkerProps {
    children: ReactNode;
    role?: TextProps['role'];
    tone?: TextProps['tone'];
    weight?: TextProps['weight'];
    /** The number is followed by a period ("1."), which takes a little more room. */
    suffix?: boolean;
}

// A tabular digit is about 0.6 em wide; the column holds two of them so steps 1 to 99 share one text edge.
const DIGIT_EM = 0.6;
const COLUMN_DIGITS = 2;
const SUFFIX_EM = 0.3;

/** The marker column of a numbered list: equal-width digits in a fixed-width column, ending where the text begins. */
export function NumberMarker({ children, role = 'body', tone, weight, suffix }: NumberMarkerProps) {
    const { type } = useTheme();
    const { fontScale } = useWindowDimensions();
    const scale = Math.min(fontScale, maxScaleFor(role) ?? fontScale);
    const minWidth = Math.ceil(type[role] * scale * (COLUMN_DIGITS * DIGIT_EM + (suffix ? SUFFIX_EM : 0)));
    return (
        <View testID="number-marker" style={{ minWidth, alignItems: 'flex-end' }}>
            <Text role={role} tone={tone} weight={weight} tabular>
                {children}
            </Text>
        </View>
    );
}
