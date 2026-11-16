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
    it('puts an English draft on the physical left and an Arabic draft on the right when native flips sides', async () => {
        nativeLayout(true);
        expect(await styleOf('hello')).toMatchObject({ writingDirection: 'ltr', textAlign: 'right' });
        expect(await styleOf('مرحبا')).toMatchObject({ writingDirection: 'rtl', textAlign: 'left' });
    });

    it('passes the physical sides when the swap is off', async () => {
        nativeLayout(false);
        expect(await styleOf('hello')).toMatchObject({ writingDirection: 'ltr', textAlign: 'left' });
        expect(await styleOf('مرحبا')).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
    });

    it('leaves a web address on auto', async () => {
        nativeLayout(true);
        expect(await styleOf('https://x.test', { url: true })).toMatchObject({ textAlign: 'auto' });
    });
});
