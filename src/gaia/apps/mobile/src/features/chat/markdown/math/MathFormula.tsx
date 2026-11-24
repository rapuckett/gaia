// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { PhrasingContent } from 'mdast';
import { View } from 'react-native';

import { isolate } from '@webui/i18n/registry';
import { HScroll, Text } from '@/ui';

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
function drawn(math: MathContext, tex: string, display: boolean): DrawnFormula | null {
    return rendererOf(math).texToSvg(tex, display);
}

function Drawing({ formula, tex, math, inline }: { formula: DrawnFormula; tex: string; math: MathContext; inline: boolean }) {
    const width = formula.width * math.size;
    const height = (formula.height + formula.depth) * math.size;
    const { SvgXml } = rendererOf(math);
    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={tex}
            testID={inline ? 'math-inline' : 'math-display'}
            // An inline box sits on the baseline; moving it down by its depth lines the formula's baseline up with the text's.
            style={{ width, height, ...(inline && formula.depth > 0 ? { transform: [{ translateY: formula.depth * math.size }] } : null) }}
        >
            <SvgXml xml={formula.svg} width={width} height={height} color={math.color} />
        </View>
    );
}

/** A formula in a line of text; its TeX source in the danger color when it doesn't parse, as on the desktop. */
export function InlineFormula({ tex, math }: { tex: string; math: MathContext }) {
    const formula = drawn(math, tex, false);
    if (formula) return <Drawing formula={formula} tex={tex} math={math} inline />;
    return (
        <Text mono dir="ltr" tone="danger" testID="math-source">
            {isolate(tex, 'ltr')}
        </Text>
    );
}

/** A display formula, or an inline one wider than the column, on its own line: it scrolls sideways when wider than the answer. */
export function BlockFormula({ tex, math, display }: { tex: string; math: MathContext; display: boolean }) {
    const formula = drawn(math, tex, display);
    if (!formula) {
        return (
            <Text mono dir="ltr" align="ltr" selectable tone="danger" testID="math-source">
                {tex}
            </Text>
        );
    }
    return (
        <HScroll dir="ltr" testID={display ? 'math-display-scroll' : 'math-wide-scroll'}>
            {/* A display formula is centered in the column while it fits, as on the desktop. */}
            <View style={{ minWidth: math.columnWidth, alignItems: display ? 'center' : 'flex-start' }}>
                <Drawing formula={formula} tex={tex} math={math} inline={false} />
            </View>
        </HScroll>
    );
}

export type ParagraphRun = { kind: 'text'; nodes: PhrasingContent[] } | { kind: 'wide'; tex: string };

/** A paragraph split around its inline formulas that are wider than the column, which can't wrap and get lines of their own. */
export function splitWideFormulas(nodes: PhrasingContent[], math: MathContext | undefined): ParagraphRun[] {
    if (!math?.renderer || math.columnWidth <= 0) return [{ kind: 'text', nodes }];
    const { renderer } = math;
    const runs: ParagraphRun[] = [];
    let current: PhrasingContent[] = [];
    const flush = () => {
        if (current.some((n) => n.type !== 'text' || n.value.trim() !== '')) runs.push({ kind: 'text', nodes: current });
        current = [];
    };
    for (const node of nodes) {
        const formula = node.type === 'inlineMath' ? renderer.texToSvg(node.value, false) : null;
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
