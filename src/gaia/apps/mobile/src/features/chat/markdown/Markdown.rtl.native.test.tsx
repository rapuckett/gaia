// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

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
});
