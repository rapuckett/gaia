// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { SearchField, TextField, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('TextField accessibility', () => {
    afterEach(() => jest.restoreAllMocks());

    it('an error is announced once on iOS, and again only when it changes', async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        const view = await render(<TextField value="" onChangeText={jest.fn()} label="Name" error="Name is required" />, { wrapper: wrap });
        await view.rerender(<TextField value="a" onChangeText={jest.fn()} label="Name" error="Name is required" />);
        await view.rerender(<TextField value="a" onChangeText={jest.fn()} label="Name" error="Too short" />);
        expect(announce.mock.calls.map((c) => c[0])).toEqual(Platform.OS === 'ios' ? ['Name is required', 'Too short'] : []);
    });

    it('the search input carries the field name and nothing else in the field is a stop', async () => {
        await render(<SearchField value="" onChangeText={jest.fn()} placeholder="Search" accessibilityLabel="Search chats" />, { wrapper: wrap });
        expect(screen.getByLabelText('Search chats')).toBeTruthy();
        expect(touchables()).toEqual([]);
    });

    it('the Clear button appears with text, is named and holds 44 pt', async () => {
        await render(<SearchField value="trip" onChangeText={jest.fn()} placeholder="Search" />, { wrapper: wrap });
        const list = touchables();
        expect(list).toHaveLength(1);
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('the box around the input is not a second stop for a screen reader', async () => {
        await render(<TextField value="" onChangeText={jest.fn()} label="Name" testID="f" />, { wrapper: wrap });
        const box = screen.getByTestId('f-box');
        expect(box.props.accessible).toBe(false);
        expect(touchables().filter((x) => x.testID === 'f-box')).toEqual([]);
    });

    it('a label names the input, and a disabled field is not editable', async () => {
        await render(<TextField value="" onChangeText={jest.fn()} label="Name" disabled testID="f" />, { wrapper: wrap });
        const input = screen.getByLabelText('Name');
        expect(input.props.editable).toBe(false);
    });

    it('an error is announced when it appears, not only drawn', async () => {
        await render(<TextField value="" onChangeText={jest.fn()} label="Name" error="Name is required" />, { wrapper: wrap });
        const live = walk().find((n) => n.props.accessibilityLiveRegion && JSON.stringify(n).includes('Name is required'));
        expect(live).toBeTruthy();
    });

    it('the reveal button names what it will do and flips', async () => {
        await render(<TextField value="secret" onChangeText={jest.fn()} label="Key" secureTextEntry revealable />, { wrapper: wrap });
        const first = touchables()[0]!;
        expect(first.name).toBeTruthy();
        await fireEvent.press(screen.getByLabelText(first.name));
        expect(touchables()[0]!.name).not.toBe(first.name);
    });
});
