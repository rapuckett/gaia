// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Children, createContext, useContext, type ReactNode } from 'react';
import { Platform, Text as RNText, View, type AccessibilityRole, type TextStyle } from 'react-native';
import { glossParts, stripIsolates } from '@webui/i18n/registry';
import { useDirection } from '@/i18n/useT';
import { metrics } from '../tokens/generated';
import { fontFamily, type Weight } from '../theme/fonts';
import { COMPACT_MAX_FONT_SCALE, TITLE_MAX_FONT_SCALE, useLargeText } from '../theme/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { toneColor, type Tone } from '../theme/tone';
import { ForcedDirection } from './ForcedDirection';
import { contentDir, physicalAlign } from './direction';
import type { TypeRole } from '../tokens/type';

export interface TextProps {
    children?: ReactNode;
    role?: TypeRole;
    tone?: Tone;
    weight?: Weight;
    mono?: boolean;
    italic?: boolean;
    /** `start`/`end` follow the UI direction, whatever `dir` is; `ltr`/`rtl` pin the block to that direction's start edge (code, logs, content blocks). */
    align?: 'start' | 'center' | 'end' | 'ltr' | 'rtl';
    /** Lines to show at normal text size; a person who chose a large size gets the whole text (up to 3 lines) unless `compact`. A string carrying an English gloss gets twice as many. */
    numberOfLines?: number;
    /** Lines kept at large sizes instead of the whole text: only for long user content in a list (a chat title, a file name) or a header title. */
    largeLines?: number;
    /** A label inside a fixed-size control: stops scaling at 1.3x and keeps `numberOfLines`. Give the control the full label in `accessibilityLabel`. */
    compact?: boolean;
    /** Where this text stops growing with the person's text size, for a label that is not a title (a navigation row). */
    maxScale?: number;
    selectable?: boolean;
    /** Where a one-line text is cut; `middle` keeps both ends of a path. */
    ellipsize?: 'tail' | 'middle';
    strike?: boolean;
    underline?: boolean;
    /** Equal-width digits, so numbers in a column line up. */
    tabular?: boolean;
    /** Inline code: mono on the code surface. */
    code?: boolean;
    /** Writing direction of this run; explicit `ltr`/`rtl` never move the line, `auto` aligns the block to its content. Content whose language differs from the UI's. `auto` follows the first strong letter of a string child. */
    dir?: 'ltr' | 'rtl' | 'auto';
    /** Keeps a long English gloss inline in brackets instead of a block under the text: for labels inside a control. */
    glossInline?: boolean;
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: AccessibilityRole;
    testID?: string;
}

const InsideText = createContext(false);

/** The largest text-size multiplier a role follows: titles cap at 2x, compact labels at 1.3x, the rest scale fully. */
export function maxScaleFor(role: TypeRole | undefined, compact?: boolean): number | undefined {
    if (compact) return COMPACT_MAX_FONT_SCALE;
    return role === 'title' || role === 'display' ? TITLE_MAX_FONT_SCALE : undefined;
}

/** A role's line height in points before the person's text size applies. */
export function lineHeightOf(size: number, role: TypeRole, rtl: boolean): number {
    const ratio = rtl ? (role === 'prose' || role === 'body' ? metrics.lineHeightArProse : metrics.lineHeightAr) : metrics.lineHeight;
    return Math.round(size * ratio);
}

const GLOSS_MIN_SIZE = 11;
const GLOSS_LINE_HEIGHT = 1.3;
const LONG_GLOSS_LENGTH = 40;
const NBSP = '\u00A0';

/** Whether a string child carries an English gloss, which roughly doubles its length. */
function hasGloss(children: ReactNode): boolean {
    let found = false;
    Children.forEach(children, (child) => {
        if (typeof child === 'string' && glossParts(child)) found = true;
    });
    return found;
}

/** A gloss that is a sentence (or several), or longer than `limit` characters, wraps badly inline, so it gets its own block. */
export function isLongGloss(english: string, limit = LONG_GLOSS_LENGTH): boolean {
    const sentence = /[.!?]$/.test(english) && english.split(/\s+/).length > 3;
    return english.length > limit || sentence || /[.!?]\s+\S/.test(english);
}

/** The English of a gloss part, without its isolates and brackets. */
function glossEnglish(part: string): string {
    return stripIsolates(part).trim().replace(/^\(/, '').replace(/\)$/, '');
}

/** Splits each string child at its English glosses and sets them small and muted, as the web's `.i18n-gloss` does; with `blocks`, long glosses are moved into it instead. */
function withGlosses(children: ReactNode, size: number, color: string, blocks: string[] | null, limit = LONG_GLOSS_LENGTH): ReactNode {
    const gloss = Math.max(size * 0.8, GLOSS_MIN_SIZE);
    // Native keeps the paragraph's direction (a nested writingDirection would apply to the whole line); the gloss's own isolates keep its English run LTR.
    const style = { fontSize: gloss, lineHeight: Math.round(gloss * GLOSS_LINE_HEIGHT), fontWeight: '400' as const, color, ...(Platform.OS === 'web' ? { writingDirection: 'ltr' as const } : null) };
    let changed = false;
    const mapped = Children.map(children, (child, i) => {
        if (typeof child !== 'string') return child;
        const parts = glossParts(child);
        if (!parts) return child;
        changed = true;
        return parts.map((part, j) => {
            if (!part.gloss) {
                const next = parts[j + 1];
                return blocks && next?.gloss && isLongGloss(glossEnglish(next.text), limit) ? part.text.trimEnd() : part.text;
            }
            const english = glossEnglish(part.text);
            if (blocks && isLongGloss(english, limit)) {
                blocks.push(english);
                return null;
            }
            return (
                <RNText key={`${i}.${j}`} style={style}>
                    {part.text.replace(/ /g, NBSP)}
                </RNText>
            );
        });
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
    largeLines,
    compact,
    maxScale,
    selectable,
    ellipsize,
    strike,
    underline,
    tabular,
    code,
    dir: dirProp,
    glossInline,
    onPress,
    accessibilityLabel,
    accessibilityRole,
    testID,
}: TextProps) {
    const { colors, type, space } = useTheme();
    const uiDir = useDirection();
    const rtl = uiDir === 'rtl';
    const dir = dirProp === 'auto' ? (typeof children === 'string' ? contentDir(children, uiDir) : uiDir) : dirProp;
    const nested = useContext(InsideText);
    const forced = useContext(ForcedDirection);
    const largeText = useLargeText();
    const capped = !compact && largeText && numberOfLines !== undefined && numberOfLines <= 3 ? largeLines : numberOfLines;
    // A cap sized for English would cut the gloss off a translated line, at the wrong end in RTL.
    const lines = capped !== undefined && !compact && hasGloss(children) ? capped * 2 : capped;

    // A nested Text is a span: it inherits everything it isn't given.
    const baseSize = type[role ?? 'body'];
    const style: { -readonly [K in keyof TextStyle]: TextStyle[K] } = {};
    const display = role === 'display';
    if (!nested || role || weight || mono || code || tone) {
        const r: TypeRole = role ?? 'body';
        const w: Weight = weight ?? 'regular';
        style.fontFamily = fontFamily({ weight: w, mono: !!mono || !!code, display });
        if (!nested || role) {
            style.fontSize = type[r];
            style.lineHeight = lineHeightOf(type[r], r, rtl);
        }
    }
    if (!nested || tone) style.color = toneColor(colors, tone ?? 'primary');
    if (italic) style.fontStyle = 'italic';
    if (tabular) style.fontVariant = ['tabular-nums'];
    if (code) {
        style.backgroundColor = colors.bgCode;
        style.color = colors.textCode;
    }
    if (strike || underline) style.textDecorationLine = strike && underline ? 'underline line-through' : strike ? 'line-through' : 'underline';
    if (dir) style.writingDirection = dir;
    // iOS lays a paragraph with a nested span out left to right unless told the UI direction.
    else if (Platform.OS !== 'web' && !nested && !dirProp && !forced && hasGloss(children)) style.writingDirection = uiDir;
    // `auto` is a block that follows its own content, as the web's dir="auto" does; explicit ltr/rtl only set the run.
    const startsRight = dirProp === 'auto' ? dir === 'rtl' : rtl;
    // Inside a pinned-direction block native does not swap left and right, so the side is taken literally.
    const side = (right: boolean): 'left' | 'right' => (forced ? (right ? 'right' : 'left') : physicalAlign(right));
    const pinnedStartsRight = forced ? (dirProp === 'auto' ? dir === 'rtl' : forced === 'rtl') : startsRight;
    if (align === 'center') style.textAlign = 'center';
    else if (align === 'ltr' || align === 'rtl') style.textAlign = side(align === 'rtl');
    else if (align === 'end') style.textAlign = side(!pinnedStartsRight);
    else if (align === 'start' || !nested) style.textAlign = side(pinnedStartsRight);
    if (rtl) style.letterSpacing = 0;

    const blocks: string[] | null = !nested && !glossInline && !compact && numberOfLines === undefined ? [] : null;
    // Larger type wraps sooner, so headings move a shorter gloss to its own line.
    const glossLimit = Math.round((LONG_GLOSS_LENGTH * type.body) / baseSize);
    const body = withGlosses(children, baseSize, toneColor(colors, 'muted'), blocks, glossLimit);
    const glossSize = Math.max(baseSize * 0.8, GLOSS_MIN_SIZE);
    const blockStyle: TextStyle = {
        fontFamily: fontFamily({ weight: 'regular', mono: false, display: false }),
        fontSize: glossSize,
        lineHeight: Math.round(glossSize * GLOSS_LINE_HEIGHT),
        color: toneColor(colors, 'muted'),
        writingDirection: 'ltr',
        // The gloss sits on the same reading edge as the text it translates, though it reads left to right.
        textAlign: style.textAlign ?? side(pinnedStartsRight),
        marginTop: space.xs,
    };
    const main = (
        <InsideText.Provider value>
            <RNText
                style={style}
                numberOfLines={lines}
                maxFontSizeMultiplier={maxScale ?? maxScaleFor(role, compact)}
                ellipsizeMode={ellipsize ?? 'tail'}
                selectable={selectable}
                onPress={onPress}
                accessibilityLabel={accessibilityLabel}
                accessibilityRole={accessibilityRole}
                testID={testID}
            >
                {body}
            </RNText>
        </InsideText.Provider>
    );
    if (!blocks?.length) return main;
    return (
        // Shrinks inside a row like the Text it replaces.
        <View style={{ flexShrink: 1 }}>
            {main}
            {blocks.map((english, i) => (
                <RNText key={i} style={blockStyle} maxFontSizeMultiplier={maxScale ?? maxScaleFor(role, compact)} testID={testID ? `${testID}-gloss` : undefined}>
                    {english}
                </RNText>
            ))}
        </View>
    );
}
