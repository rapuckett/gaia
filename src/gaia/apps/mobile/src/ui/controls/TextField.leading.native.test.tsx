// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Children, type ReactNode } from 'react';
import { I18nManager, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocaleStore } from '@/state/locale';
import { SearchField, TextField, ThemeProvider } from '@/ui';
import { LEADING_INSET } from './TextField';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const ICON_WIDTH = 16;

afterEach(() => {
    useLocaleStore.getState().setLocale(null);
    jest.restoreAllMocks();
});

const styleOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

describeNative.each([
    ['en', false],
    ['ar', true],
    ['ar', false],
])('search field icon room (%s, native RTL %s)', (locale, isRTL) => {
    beforeEach(() => {
        useLocaleStore.getState().setLocale(locale as 'en' | 'ar');
        jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ isRTL, doLeftAndRightSwapInRTL: true, localeIdentifier: locale });
    });

    it('lays the icon and the input out as siblings in a row, with no inset on the input', async () => {
        await render(<SearchField testID="s" value="" onChangeText={jest.fn()} placeholder="Search chats" />, { wrapper: wrap });
        const box = screen.getByTestId('s-box');
        expect(styleOf('s-box')).toMatchObject({ flexDirection: 'row' });
        expect(within(box).getByTestId('s')).toBeTruthy();
        const kids = Children.toArray(box.props.children);
        expect(kids.length).toBeGreaterThanOrEqual(2);
        const input = styleOf('s');
        for (const key of ['paddingLeft', 'paddingRight', 'paddingStart', 'paddingEnd', 'paddingHorizontal'] as const) {
            expect(input[key] ?? 0).toBe(0);
        }
        expect(input.flex).toBe(1);
        expect(styleOf('s-box').paddingStart + 1 + ICON_WIDTH).toBeLessThanOrEqual(LEADING_INSET + ICON_WIDTH);
    });

    it('keeps that layout through focus, blur, typing and clearing', async () => {
        await render(<SearchField testID="s" value="" onChangeText={jest.fn()} placeholder="Search chats" />, { wrapper: wrap });
        const layout = () => {
            const { paddingStart, flexDirection, gap } = styleOf('s-box');
            const { paddingLeft, paddingRight, paddingStart: s, paddingEnd: e } = styleOf('s');
            return JSON.stringify({ paddingStart, flexDirection, gap, paddingLeft, paddingRight, s, e });
        };
        const before = layout();
        const input = screen.getByTestId('s');
        await act(async () => fireEvent(input, 'focus'));
        expect(layout()).toBe(before);
        await act(async () => fireEvent(input, 'blur'));
        expect(layout()).toBe(before);
        await act(async () => fireEvent.changeText(input, 'مرحبا'));
        await act(async () => fireEvent(input, 'blur'));
        expect(layout()).toBe(before);
        await act(async () => fireEvent.changeText(input, ''));
        expect(layout()).toBe(before);
    });

    it('focuses the input when the box is pressed', async () => {
        let node: { focus: () => void } | null = null;
        await render(<TextField testID="f" value="" onChangeText={jest.fn()} inputRef={(n) => { node = n as unknown as { focus: () => void }; }} />, { wrapper: wrap });
        const focus = jest.spyOn(node as unknown as { focus: () => void }, 'focus');
        await act(async () => fireEvent.press(screen.getByTestId('f-box')));
        expect(focus).toHaveBeenCalled();
    });

    it('leaves the input as the accessible element, with the label and hint, and the box out of the tree', async () => {
        await render(<TextField testID="f" value="" onChangeText={jest.fn()} label="Name" accessibilityHint="Type a name" />, { wrapper: wrap });
        const box = screen.getByTestId('f-box');
        expect(box.props.accessible).toBe(false);
        expect(box.props.importantForAccessibility).toBe('no');
        expect(box.props.accessibilityRole).toBeUndefined();
        expect(box.props.accessibilityLabel).toBeUndefined();
        const input = screen.getByTestId('f');
        expect(input.props.accessibilityLabel).toBe('Name');
        expect(input.props.accessibilityHint).toBe('Type a name');
    });

    it('hands callers the input itself, not the box', async () => {
        let node: unknown = null;
        await render(<TextField testID="f" value="" onChangeText={jest.fn()} inputRef={(n) => { node = n; }} />, { wrapper: wrap });
        expect(node).not.toBe(screen.getByTestId('f-box'));
        expect(typeof (node as { focus?: unknown }).focus).toBe('function');
    });
});
