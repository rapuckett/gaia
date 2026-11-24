// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// MathJax and its font are large: only mathRenderer loads this module (through renderer.ts), on an answer's first formula.
import { restoreNavigator } from './mathjaxEnv';
import { mathjax } from '@mathjax/src/cjs/mathjax.js';
import { TeX } from '@mathjax/src/cjs/input/tex.js';
import { SVG } from '@mathjax/src/cjs/output/svg.js';
import { liteAdaptor } from '@mathjax/src/cjs/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/cjs/handlers/html.js';
import TexError from '@mathjax/src/cjs/input/tex/TexError.js';
import type { LiteElement } from '@mathjax/src/cjs/adaptors/lite/Element.js';
import '@mathjax/src/cjs/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/cjs/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/cjs/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/cjs/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/cjs/input/tex/gensymb/GensymbConfiguration.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/cjs/svg.js';

/** A drawn formula: a standalone SVG in `currentColor`, and its box in ems of the text around it. */
export interface DrawnFormula {
    svg: string;
    width: number;
    /** Above the baseline. */
    height: number;
    /** Below the baseline. */
    depth: number;
}

restoreNavigator();

const UNITS_PER_EM = 1000;
const CACHE_LIMIT = 200;

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', {
    InputJax: new TeX({
        packages: ['base', 'ams', 'newcommand', 'boldsymbol', 'cancel', 'color', 'gensymb'],
        // A formula that doesn't parse throws, so the caller shows its source instead of MathJax's message.
        formatError: (_jax: unknown, error: Error) => {
            throw error;
        },
    }),
    // Every glyph inline, so the SVG stands alone; one SVG per formula, since the phone can't break a line inside one.
    OutputJax: new SVG({ fontData: MathJaxTexFont, fontCache: 'none', linebreaks: { inline: false } }),
});

const cache = new Map<string, DrawnFormula | null>();

function draw(tex: string, display: boolean): DrawnFormula | null {
    let container: LiteElement;
    try {
        container = document.convert(tex, { display, em: 16, ex: 8, containerWidth: 80 * 16 });
    } catch (error) {
        if (error instanceof TexError) return null;
        throw new Error(`MathJax failed on "${tex}": ${String(error)}`, { cause: error });
    }
    const parts = adaptor.childNodes(container);
    if (parts.length !== 1) throw new Error(`MathJax drew "${tex}" as ${parts.length} pieces, not one SVG`);
    const svg = parts[0] as LiteElement;
    const box = String(adaptor.getAttribute(svg, 'viewBox') ?? '').split(/\s+/).map(Number);
    if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) throw new Error(`MathJax drew "${tex}" without a viewBox`);
    const [minX, minY, w, h] = box;
    return {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}">${adaptor.innerHTML(svg)}</svg>`,
        width: w / UNITS_PER_EM,
        height: -minY / UNITS_PER_EM,
        depth: (h + minY) / UNITS_PER_EM,
    };
}

/** The formula drawn as SVG, or null when the TeX doesn't parse. */
export function texToSvg(tex: string, display: boolean): DrawnFormula | null {
    const key = `${display ? 'D' : 'I'}${tex}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    const drawn = draw(tex, display);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, drawn);
    return drawn;
}
