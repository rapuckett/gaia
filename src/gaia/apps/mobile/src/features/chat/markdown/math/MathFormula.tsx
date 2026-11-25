// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { PhrasingContent } from 'mdast';
import type { ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';

import { dirProp } from '@/platform/dirProp';
import { ScrollFade } from '@/ui';

import { CodeBlock } from '../CodeBlock';
import type { DrawnFormula } from './texToSvg';
import type { MathModule } from './mathRenderer';

/** What a formula needs from the answer around it. */
export interface MathContext {
    /** Null for an answer without formulas. */
    renderer: MathModule | null;
    /** The formula's em, in points: the prose size at the person's text size. */
    size: number;
    color: string;
    /** The answer column's width, 0 before it is measured. */
    columnWidth: number;
}

// The desktop draws formulas at 1.05em of the prose.
export const MATH_SCALE = 1.05;

function rendererOf(math: MathContext): MathModule {
    if (!math.renderer) throw new Error('A formula was rendered without the formula renderer: Markdown loads it when the tree has math.');
    return math.renderer;
}

/** The drawn formula, or null when it doesn't parse. */
export function drawFormula(math: MathContext, tex: string, display: boolean): DrawnFormula | null {
    return rendererOf(math).texToSvg(tex, display);
}

/** A drawn formula, read out as its TeX source; inline, its baseline sits on the text's. */
export function FormulaDrawing({ formula, tex, math, inline }: { formula: DrawnFormula; tex: string; math: MathContext; inline: boolean }) {
    const { SvgXml } = rendererOf(math);
    const width = formula.width * math.size;
    const height = (formula.height + formula.depth) * math.size;
    const depth = formula.depth * math.size;
    // Web lowers the box in the line, so the line grows only as much as the formula needs; native lays an inline
    // box on the baseline at a fixed line height, so it is moved down after layout (Markdown makes the room).
    const place = !inline || depth <= 0 ? null : Platform.OS === 'web' ? ({ verticalAlign: -depth } as unknown as ViewStyle) : { transform: [{ translateY: depth }] };
    return (
        <View accessible accessibilityRole="text" accessibilityLabel={tex} testID={inline ? 'math-inline' : 'math-display'} style={{ width, height, ...place }}>
            <SvgXml xml={formula.svg} width={width} height={height} color={math.color} />
        </View>
    );
}

/** Content wider than the answer scrolls sideways on its own, with the shared fades at the edges while more is hidden. */
function FormulaScroller({ children, center, testID }: { children: ReactNode; center: boolean; testID: string }) {
    return (
        <View style={{ direction: 'ltr' }} {...dirProp('ltr')}>
            <ScrollFade
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                contentContainerStyle={center ? { flexGrow: 1, justifyContent: 'center' } : undefined}
                testID={testID}
            >
                {children}
            </ScrollFade>
        </View>
    );
}

/** A display formula, or an inline one wider than the column, on its own line; a display formula that doesn't parse shows as a code block. */
export function BlockFormula({ tex, math, display, streaming = false }: { tex: string; math: MathContext; display: boolean; streaming?: boolean }) {
    const formula = drawFormula(math, tex, display);
    if (!formula) return <CodeBlock lang="tex" code={tex} streaming={streaming} />;
    return (
        <FormulaScroller center={display} testID={display ? 'math-display-scroll' : 'math-wide-scroll'}>
            <FormulaDrawing formula={formula} tex={tex} math={math} inline={false} />
        </FormulaScroller>
    );
}

export type ParagraphRun = { kind: 'text'; nodes: PhrasingContent[] } | { kind: 'wide'; tex: string };

/** A paragraph split around its inline formulas that are wider than the column, which can't wrap and get lines of their own. */
export function splitWideFormulas(nodes: PhrasingContent[], math: MathContext): ParagraphRun[] {
    if (!math.renderer || math.columnWidth <= 0) return [{ kind: 'text', nodes }];
    const runs: ParagraphRun[] = [];
    let current: PhrasingContent[] = [];
    const flush = () => {
        if (current.some((n) => n.type !== 'text' || n.value.trim() !== '')) runs.push({ kind: 'text', nodes: current });
        current = [];
    };
    for (const node of nodes) {
        const formula = node.type === 'inlineMath' ? drawFormula(math, node.value, false) : null;
        if (node.type === 'inlineMath' && formula && formula.width * math.size > math.columnWidth) {
            flush();
            runs.push({ kind: 'wide', tex: node.value });
        } else {
            current.push(node);
        }
    }
    flush();
    return runs;
}

// Inter's ascent and descent, in ems: where a line of prose has room above and below its baseline.
const PROSE_ASCENT = 0.969;
const PROSE_DESCENT = 0.241;

/**
 * The line height, in points, a native paragraph needs so its inline formulas don't reach into the lines around it,
 * or null when `lineHeight` already holds them. Native text has one line height per paragraph, so every line grows.
 */
export function lineHeightForFormulas(nodes: PhrasingContent[], math: MathContext, fontSize: number, lineHeight: number): number | null {
    if (Platform.OS === 'web' || !math.renderer) return null;
    const ascent = PROSE_ASCENT * fontSize;
    const descent = PROSE_DESCENT * fontSize;
    let need = lineHeight;
    const visit = (list: PhrasingContent[]) => {
        for (const node of list) {
            if (node.type === 'inlineMath') {
                const formula = drawFormula(math, node.value, false);
                if (!formula) continue;
                // Text sits centered in its line, so the line grows by twice whichever side lacks room.
                const above = formula.height * math.size - ascent;
                const below = formula.depth * math.size - descent;
                need = Math.max(need, ascent + descent + 2 * Math.max(above, below));
            } else if ('children' in node) {
                visit(node.children as PhrasingContent[]);
            }
        }
    };
    visit(nodes);
    return need > lineHeight ? Math.ceil(need) : null;
}
