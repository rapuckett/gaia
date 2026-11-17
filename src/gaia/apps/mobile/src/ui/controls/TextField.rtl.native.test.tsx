// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { I18nManager, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocaleStore } from '@/state/locale';
import { TextField, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

function nativeLayout(swap: boolean) {
    jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ isRTL: true, doLeftAndRightSwapInRTL: swap, localeIdentifier: 'ar' });
}

async function styleOf(value: string, props: Record<string, unknown> = {}) {
    await render(<TextField testID="f" value={value} onChangeText={jest.fn()} {...props} />, { wrapper: wrap });
    await waitFor(() => expect(screen.getAllByTestId('f')).toHaveLength(1));
    return screen.getAllByTestId('f')[0].props.style;
}

beforeEach(() => useLocaleStore.getState().setLocale('ar'));
afterEach(() => {
    useLocaleStore.getState().setLocale(null);
    jest.restoreAllMocks();
});

describeNative('TextField alignment in the Arabic UI', () => {
    // Unlike Text, neither iOS nor Android swaps an input's left and right, so the swap setting must not move the text.
    it.each([true, false])('puts an English draft on the left and an Arabic draft on the right (swap %s)', async (swap) => {
        nativeLayout(swap);
        expect(await styleOf('hello')).toMatchObject({ writingDirection: 'ltr', textAlign: 'left' });
        expect(await styleOf('مرحبا')).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
    });

    it('keeps a secret on the UI side whatever is typed', async () => {
        nativeLayout(true);
        expect(await styleOf('hello', { secureTextEntry: true })).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
    });

    it('types a web address left to right, with an empty placeholder on the UI side', async () => {
        nativeLayout(true);
        expect(await styleOf('https://x.test', { url: true })).toMatchObject({ writingDirection: 'ltr', textAlign: 'left' });
        expect(await styleOf('', { url: true })).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
    });

    it('keeps an empty web address field left to right in English', async () => {
        useLocaleStore.getState().setLocale('en');
        expect(await styleOf('', { url: true })).toMatchObject({ writingDirection: 'ltr', textAlign: 'left' });
    });
});
