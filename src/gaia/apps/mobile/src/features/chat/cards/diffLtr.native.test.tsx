// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { I18nManager, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocaleStore } from '@/state/locale';
import { HScroll, Text, ThemeProvider } from '@/ui';

import { DiffCard } from './DiffCard';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const directionOf = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never)?.direction;

describeNative('a diff is left to right in Arabic', () => {
    beforeEach(() => useLocaleStore.getState().setLocale('ar'));
    afterEach(() => useLocaleStore.getState().setLocale('en'));

    it('sets the diff scroller and its content left to right, rows included', async () => {
        await render(<DiffCard data={{ path: 'a.txt', unified: '@@ -1 +1,2 @@\n-one\n+two\n+an added line\n' }} />, { wrapper: wrap });
        const scroll = screen.getByTestId('card-diff-scroll');
        expect(directionOf(scroll)).toBe('ltr');
        expect(StyleSheet.flatten(scroll.props.contentContainerStyle)?.direction).toBe('ltr');
        expect(screen.getByText('an added line')).toBeTruthy();
    });

    it('aligns diff rows to the physical left, since native does not swap sides inside a pinned block', async () => {
        jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ isRTL: true, doLeftAndRightSwapInRTL: true, localeIdentifier: 'ar' });
        await render(<DiffCard data={{ path: 'a.txt', unified: '@@ -1 +1,2 @@\n-one\n+two\n+an added line\n' }} />, { wrapper: wrap });
        expect(StyleSheet.flatten(screen.getByText('an added line').props.style).textAlign).toBe('left');
        jest.restoreAllMocks();
    });

    it('leaves a scroller with no dir on the UI direction', async () => {
        await render(
            <HScroll testID="plain">
                <Text>x</Text>
            </HScroll>,
            { wrapper: wrap },
        );
        expect(directionOf(screen.getByTestId('plain'))).toBeUndefined();
    });
});
