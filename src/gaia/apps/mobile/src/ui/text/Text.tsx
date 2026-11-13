// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, type ReactNode } from 'react';
import { Text as RNText, type AccessibilityRole, type TextStyle } from 'react-native';
import { useDirection } from '@/i18n/useT';
import { metrics } from '../tokens/generated';
import { fontFamily, type Weight } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { toneColor, type Tone } from '../theme/tone';
import type { TypeRole } from '../tokens/type';

export interface TextProps {
    children?: ReactNode;
    role?: TypeRole;
    tone?: Tone;
    weight?: Weight;
    mono?: boolean;
    italic?: boolean;
    align?: 'start' | 'center' | 'end';
    numberOfLines?: number;
    selectable?: boolean;
    strike?: boolean;
    /** Inline code: mono on the code surface. */
    code?: boolean;
    /** Writing direction of this run, for content whose language differs from the UI's. */
    dir?: 'ltr' | 'rtl';
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: AccessibilityRole;
    testID?: string;
}

const InsideText = createContext(false);

export function Text({
    children,
    role,
    tone,
    weight,
    mono,
    italic,
    align,
    numberOfLines,
    selectable,
    strike,
    code,
    dir,
    onPress,
    accessibilityLabel,
    accessibilityRole,
    testID,
}: TextProps) {
    const { colors, type } = useTheme();
    const rtl = useDirection() === 'rtl';
    const nested = useContext(InsideText);

    // A nested Text is a span: it inherits everything it isn't given.
    const style: { -readonly [K in keyof TextStyle]: TextStyle[K] } = {};
    const display = role === 'display';
    if (!nested || role || weight || mono || code || tone) {
        const r: TypeRole = role ?? 'body';
        const w: Weight = weight ?? 'regular';
        style.fontFamily = fontFamily({ weight: w, mono: !!mono || !!code, display });
        if (!nested || role) {
            const size = type[r];
            const ratio = rtl
                ? r === 'prose' || r === 'body'
                    ? metrics.lineHeightArProse
                    : metrics.lineHeightAr
                : metrics.lineHeight;
            style.fontSize = size;
            style.lineHeight = Math.round(size * ratio);
        }
    }
    if (!nested || tone) style.color = toneColor(colors, tone ?? 'primary');
    if (italic) style.fontStyle = 'italic';
    if (code) {
        style.backgroundColor = colors.bgCode;
        style.color = colors.textCode;
    }
    if (strike) style.textDecorationLine = 'line-through';
    if (dir) style.writingDirection = dir;
    if (align) style.textAlign = align === 'start' ? 'auto' : align === 'end' ? (rtl ? 'left' : 'right') : 'center';
    else if (!nested) style.textAlign = 'auto';
    if (rtl) style.letterSpacing = 0;

    return (
        <InsideText.Provider value>
            <RNText
                style={style}
                numberOfLines={numberOfLines}
                ellipsizeMode="tail"
                selectable={selectable}
                onPress={onPress}
                accessibilityLabel={accessibilityLabel}
                accessibilityRole={accessibilityRole}
                testID={testID}
            >
                {children}
            </RNText>
        </InsideText.Provider>
    );
}
