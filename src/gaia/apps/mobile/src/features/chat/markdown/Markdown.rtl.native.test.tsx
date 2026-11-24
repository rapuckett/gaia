// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { I18nManager, Platform, StyleSheet } from 'react-native';

import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { Markdown } from './Markdown';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

type Host = ReturnType<typeof screen.getByText>;

function rowDirection(node: Host): unknown {
    for (let n: Host | null = node; n; n = n.parent) {
        const dir = StyleSheet.flatten(n.props.style)?.direction;
        if (dir) return dir;
    }
    return undefined;
}

function textAlign(node: Host): unknown {
    for (let n: Host | null = node; n; n = n.parent) {
        const align = StyleSheet.flatten(n.props.style)?.textAlign;
        if (align) return align;
    }
    return undefined;
}

beforeEach(() => useLocaleStore.getState().setLocale('ar'));
afterEach(() => useLocaleStore.getState().setLocale(null));

describeNative('Markdown lists in the Arabic UI', () => {
    it('lays an English item out left to right so its bullet sits beside its text', async () => {
        await render(
            <ThemeProvider>
                <Markdown text={'- Apples are red\n- Pears are green'} />
            </ThemeProvider>,
        );
        for (const bullet of screen.getAllByText('•')) expect(rowDirection(bullet)).toBe('ltr');
    });

    it('keeps an Arabic item right to left', async () => {
        await render(
            <ThemeProvider>
                <Markdown text={'- التفاح أحمر\n- الكمثرى خضراء'} />
            </ThemeProvider>,
        );
        for (const bullet of screen.getAllByText('•')) expect(rowDirection(bullet)).toBe('rtl');
    });

    it('aligns an English item to the left edge where native swaps left and right', async () => {
        jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ isRTL: true, doLeftAndRightSwapInRTL: true } as ReturnType<typeof I18nManager.getConstants>);
        await render(
            <ThemeProvider>
                <Markdown text={'- Apples are red'} />
            </ThemeProvider>,
        );
        expect(textAlign(screen.getByText('Apples are red'))).toBe('left');
        jest.restoreAllMocks();
    });

    it('leaves an Arabic item aligned to the UI start', async () => {
        jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ isRTL: true, doLeftAndRightSwapInRTL: true } as ReturnType<typeof I18nManager.getConstants>);
        await render(
            <ThemeProvider>
                <Markdown text={'- التفاح أحمر'} />
            </ThemeProvider>,
        );
        // Swapped: 'left' is drawn at the right edge.
        expect(textAlign(screen.getByText('التفاح أحمر'))).toBe('left');
        jest.restoreAllMocks();
    });
});
