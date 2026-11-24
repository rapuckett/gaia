// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/ui';

import { Markdown } from './Markdown';

let mockRendererLoads = 0;
jest.mock('./math/renderer', () => {
    mockRendererLoads += 1;
    return jest.requireActual('./math/renderer');
});

const show = (text: string) =>
    render(
        <ThemeProvider>
            <Markdown text={text} />
        </ThemeProvider>,
    );

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

    it('draws an inline formula in the line, labeled with its TeX', async () => {
        await show('Energy is $E=mc^2$ here.');
        const formula = await screen.findByTestId('math-inline');
        expect(formula.props.accessibilityLabel).toBe('E=mc^2');
        expect(screen.getByText(/Energy is/)).toBeTruthy();
        expect(screen.queryByText(/\$/)).toBeNull();
    });

    it('draws a display formula as its own block', async () => {
        await show('The area:\n\n$$\\int_0^1 x\\,dx$$\n\nis one half.');
        const formula = await screen.findByTestId('math-display');
        expect(formula.props.accessibilityLabel).toBe('\\int_0^1 x\\,dx');
        expect(screen.getByTestId('math-display-scroll')).toBeTruthy();
        expect(screen.queryByText(/\\int/)).toBeNull();
    });

    it('shows a formula that does not parse as its source', async () => {
        await show('Broken:\n\n$$\\frac{1}{$$');
        const source = await screen.findByTestId('math-source');
        expect(source.props.children).toBe('\\frac{1}{');
        expect(screen.queryByTestId('math-display')).toBeNull();
    });
});
