// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/ui';

import { Markdown } from './Markdown';

let mockRendererLoads = 0;
jest.mock('./math/renderer', () => {
    mockRendererLoads += 1;
    return jest.requireActual('./math/renderer');
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

const show = (text: string) =>
    render(
        <ThemeProvider>
            <Markdown text={text} />
        </ThemeProvider>,
    );

const PROSE_LINE = 26;

describe('formulas in an answer', () => {
    // First, so nothing earlier in this file has loaded the renderer.
    it('loads the formula renderer only for an answer with a formula', async () => {
        await show('Here is what I found.\n\n- It copied **12** files\n- `$HOME` was set');
        expect(mockRendererLoads).toBe(0);
        await show('So $E=mc^2$.');
        await screen.findByTestId('math-inline');
        expect(mockRendererLoads).toBe(1);
    });

    it('leaves money as text', async () => {
        await show('It costs $5 and $10, or $3.50 each.');
        expect(screen.getByText('It costs $5 and $10, or $3.50 each.')).toBeTruthy();
        expect(screen.queryByTestId('math-inline')).toBeNull();
    });

    it('draws an inline formula in the line, read out as its TeX and never as an image', async () => {
        await show('Energy is $E=mc^2$ here.');
        const formula = await screen.findByTestId('math-inline');
        expect(formula.props.accessibilityLabel).toBe('E=mc^2');
        expect(formula.props.accessibilityRole).toBe('text');
        expect(screen.queryAllByRole('image')).toHaveLength(0);
        expect(screen.getByText(/Energy is/)).toBeTruthy();
        expect(screen.queryByText(/\$/)).toBeNull();
    });

    it('draws a display formula as its own block, labeled with its TeX', async () => {
        await show('The area:\n\n$$\\int_0^1 x\\,dx$$\n\nis one half.');
        const formula = await screen.findByTestId('math-display');
        expect(formula.props.accessibilityLabel).toBe('\\int_0^1 x\\,dx');
        expect(formula.props.accessibilityRole).toBe('text');
        expect(screen.getByTestId('math-display-scroll')).toBeTruthy();
        expect(screen.queryByText(/\\int/)).toBeNull();
    });

    it('shows a formula that does not parse as code: a code span inline, a code block on its own line', async () => {
        await show('Broken:\n\n$$\\frac{1}{$$\n\nand $\\badmacro{x}$ too.');
        expect(screen.getByText('\\frac{1}{')).toBeTruthy();
        expect(screen.getByText(/\\badmacro\{x\}/)).toBeTruthy();
        expect(screen.queryByTestId('math-display')).toBeNull();
        expect(screen.queryByTestId('math-inline')).toBeNull();
    });

    it('fades a wide formula at the edge where more is hidden, and at the start once scrolled', async () => {
        await show('Term by term:\n\n$$e^x = 1 + x + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\frac{x^4}{4!} + \\frac{x^5}{5!} + \\frac{x^6}{6!}$$');
        const scroller = await screen.findByTestId('math-display-scroll');
        expect(scroller.props.horizontal).toBe(true);
        expect(screen.queryByTestId('math-display-scroll-fade')).toBeNull();
        await act(async () => fireEvent(scroller, 'layout', { nativeEvent: { layout: { width: 358, height: 40 } } }));
        await act(async () => fireEvent(scroller, 'contentSizeChange', 700, 40));
        expect(screen.getByTestId('math-display-scroll-fade')).toBeTruthy();
        expect(screen.queryByTestId('math-display-scroll-fade-start')).toBeNull();
        await act(async () => fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 100, y: 0 } } }));
        expect(screen.getByTestId('math-display-scroll-fade')).toBeTruthy();
        expect(screen.getByTestId('math-display-scroll-fade-start')).toBeTruthy();
        await act(async () => fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 342, y: 0 } } }));
        expect(screen.queryByTestId('math-display-scroll-fade')).toBeNull();
        expect(screen.getByTestId('math-display-scroll-fade-start')).toBeTruthy();
    });

    it('gives a paragraph with a tall inline formula enough line height, and leaves other paragraphs alone', async () => {
        await show('Plain $E=mc^2$ here.\n\nTall $\\frac{\\frac{a}{b}}{\\frac{c}{d}}$ here.');
        const lineHeight = (text: RegExp) => StyleSheet.flatten(screen.getByText(text).props.style).lineHeight as number;
        await screen.findAllByTestId('math-inline');
        expect(lineHeight(/Plain/)).toBe(PROSE_LINE);
        expect(lineHeight(/Tall/)).toBeGreaterThan(PROSE_LINE);
    });
});
