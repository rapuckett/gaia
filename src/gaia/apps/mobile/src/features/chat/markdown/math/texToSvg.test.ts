// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { texToSvg } from './texToSvg';

describe('texToSvg', () => {
    it('draws an inline formula as a standalone SVG in the text color, with a box in ems', () => {
        const drawn = texToSvg('E=mc^2', false);
        expect(drawn).not.toBeNull();
        expect(drawn!.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d. ]+">/);
        expect(drawn!.svg).toContain('currentColor');
        expect(drawn!.svg).toContain('<path');
        expect(drawn!.svg).not.toContain('<use');
        expect(drawn!.width).toBeGreaterThan(2);
        expect(drawn!.height).toBeGreaterThan(0.5);
        expect(drawn!.depth).toBeGreaterThanOrEqual(0);
    });

    it('draws a display integral, and TeX-font letters MathJax 4 would otherwise load on demand', () => {
        const integral = texToSvg('\\int_0^1 x\\,dx', true);
        expect(integral?.depth).toBeGreaterThan(0.3);
        expect(texToSvg('\\mathbb{R}^n \\times \\mathcal{L} \\to \\mathfrak{g}', false)).not.toBeNull();
    });

    it("loads under React Native's navigator, which has no appVersion or userAgent, and leaves it as it was", () => {
        const host = ((globalThis as { window?: object }).window ?? globalThis) as object;
        const saved = Object.getOwnPropertyDescriptor(host, 'navigator');
        const reactNative = { product: 'ReactNative' };
        Object.defineProperty(host, 'navigator', { value: reactNative, configurable: true, writable: true });
        try {
            jest.isolateModules(() => {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const fresh = (require('./texToSvg') as typeof import('./texToSvg')).texToSvg;
                expect(fresh('x^2', false)).not.toBeNull();
            });
            expect(reactNative).toEqual({ product: 'ReactNative' });
        } finally {
            if (saved) Object.defineProperty(host, 'navigator', saved);
            else delete (host as { navigator?: unknown }).navigator;
        }
    });

    it('returns null for TeX that does not parse', () => {
        expect(texToSvg('\\frac{1}{', true)).toBeNull();
        expect(texToSvg('\\badmacro{x}', false)).toBeNull();
    });
});
