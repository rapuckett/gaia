// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { I18nManager, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocaleStore } from '@/state/locale';
import { SearchField, ThemeProvider } from '@/ui';
import { LEADING_INSET } from './TextField';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const ICON_START = 12;
const ICON_WIDTH = 16;

afterEach(() => {
    useLocaleStore.getState().setLocale(null);
    jest.restoreAllMocks();
});

function inset(rtl: boolean) {
    const flat = StyleSheet.flatten(screen.getByTestId('s').props.style);
    return rtl ? flat.paddingRight : flat.paddingLeft;
}

describeNative.each([
    ['en', false],
    ['ar', true],
])('search field icon room (%s)', (locale, rtl) => {
    it('keeps the icon side inset through focus, blur, typing and clearing', async () => {
        useLocaleStore.getState().setLocale(locale as 'en' | 'ar');
        jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ isRTL: rtl, doLeftAndRightSwapInRTL: true, localeIdentifier: locale });
        const onChange = jest.fn();
        await render(<SearchField testID="s" value="" onChangeText={onChange} placeholder="Search chats" />, { wrapper: wrap });
        const before = inset(rtl);
        expect(before).toBe(LEADING_INSET);
        expect(before).toBeGreaterThanOrEqual(ICON_START + ICON_WIDTH);
        const input = screen.getByTestId('s');
        await act(async () => fireEvent(input, 'focus'));
        expect(inset(rtl)).toBe(before);
        await act(async () => fireEvent(input, 'blur'));
        expect(inset(rtl)).toBe(before);
        await act(async () => fireEvent.changeText(input, 'مرحبا'));
        await act(async () => fireEvent(input, 'blur'));
        expect(inset(rtl)).toBe(before);
        await act(async () => fireEvent.changeText(input, ''));
        expect(inset(rtl)).toBe(before);
    });
});
