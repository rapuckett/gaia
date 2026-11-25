// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { ScrollFade, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

async function setup(view: number, content: number) {
    await render(<ScrollFade testID="row"><Text>x</Text></ScrollFade>, { wrapper: wrap });
    const scroller = screen.getByTestId('row');
    await fireEvent(scroller, 'layout', { nativeEvent: { layout: { width: view, height: 40, x: 0, y: 0 } } });
    await fireEvent(scroller, 'contentSizeChange', content, 40);
    return scroller;
}

describeNative('ScrollFade', () => {
    it('shows the start fade only after a scroll, and the end fade until the end', async () => {
        const scroller = await setup(300, 500);
        expect(screen.queryByTestId('row-fade-start')).toBeNull();
        expect(screen.getByTestId('row-fade')).toBeOnTheScreen();
        await fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 60, y: 0 } } });
        expect(screen.getByTestId('row-fade-start')).toBeOnTheScreen();
        expect(screen.getByTestId('row-fade')).toBeOnTheScreen();
        await fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 200, y: 0 } } });
        expect(screen.getByTestId('row-fade-start')).toBeOnTheScreen();
        expect(screen.queryByTestId('row-fade')).toBeNull();
    });

    it('draws no fade when everything fits', async () => {
        await setup(300, 300);
        expect(screen.queryByTestId('row-fade-start')).toBeNull();
        expect(screen.queryByTestId('row-fade')).toBeNull();
    });

    it('makes each fade 24 pt wide and ignores touches', async () => {
        const scroller = await setup(300, 500);
        await fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 60, y: 0 } } });
        for (const id of ['row-fade-start', 'row-fade']) {
            const fade = screen.getByTestId(id);
            expect(StyleSheet.flatten(fade.props.style).width).toBe(24);
            expect(fade.props.pointerEvents).toBe('none');
        }
    });
});
