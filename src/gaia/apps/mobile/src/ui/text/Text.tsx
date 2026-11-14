// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Children, createContext, useContext, type ReactNode } from 'react';
import { Text as RNText, type AccessibilityRole, type TextStyle } from 'react-native';
import { glossParts } from '@webui/i18n/registry';
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

const GLOSS_MIN_SIZE = 11;
const GLOSS_LINE_HEIGHT = 1.3;

/** Splits each string child at its English glosses and sets them small and muted, as the web's `.i18n-gloss` does. */
function withGlosses(children: ReactNode, size: number, color: string): ReactNode {
    const gloss = Math.max(size * 0.8, GLOSS_MIN_SIZE);
    const style = { fontSize: gloss, lineHeight: Math.round(gloss * GLOSS_LINE_HEIGHT), fontWeight: '400' as const, color };
    let changed = false;
    const mapped = Children.map(children, (child, i) => {
        if (typeof child !== 'string') return child;
        const parts = glossParts(child);
        if (!parts) return child;
        changed = true;
        return parts.map((part, j) =>
            part.gloss ? (
                <RNText key={`${i}.${j}`} style={style}>
                    {part.text}
                </RNText>
            ) : (
                part.text
            ),
        );
    });
    return changed ? mapped : children;
}

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
    const baseSize = type[role ?? 'body'];
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
    // textAlign left/right are physical on native too (not swapped under forceRTL), so the start side is picked by direction.
    const startsRight = (dir ?? (rtl ? 'rtl' : 'ltr')) === 'rtl';
    if (align === 'center') style.textAlign = 'center';
    else if (align === 'end') style.textAlign = startsRight ? 'left' : 'right';
    else if (align === 'start' || !nested) style.textAlign = startsRight ? 'right' : 'left';
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
                {withGlosses(children, baseSize, toneColor(colors, 'muted'))}
            </RNText>
        </InsideText.Provider>
    );
}
