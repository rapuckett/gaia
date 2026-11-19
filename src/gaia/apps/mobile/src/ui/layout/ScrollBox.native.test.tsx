// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScrollBox, Text, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const scrolled = (y: number, content: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 300, height: content }, layoutMeasurement: { width: 300, height: 100 } } });

describeNative('ScrollBox stickToEnd', () => {
    let scrollToEnd: jest.SpiedFunction<typeof ScrollView.prototype.scrollToEnd>;
    beforeEach(() => {
        scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
    });
    afterEach(() => scrollToEnd.mockRestore());

    it('follows growing content, stops while scrolled up, and follows again back at the bottom', async () => {
        await render(
            <ScrollBox maxHeight={100} stickToEnd testID="box">
                <Text>Line</Text>
            </ScrollBox>,
            { wrapper: wrap },
        );
        const box = screen.getByTestId('box');
        await act(async () => fireEvent(box, 'contentSizeChange', 300, 260));
        expect(scrollToEnd).toHaveBeenCalledTimes(1);

        await act(async () => fireEvent.scroll(box, scrolled(40, 260)));
        await act(async () => fireEvent(box, 'contentSizeChange', 300, 300));
        expect(scrollToEnd).toHaveBeenCalledTimes(1);

        await act(async () => fireEvent.scroll(box, scrolled(195, 300)));
        await act(async () => fireEvent(box, 'contentSizeChange', 300, 340));
        expect(scrollToEnd).toHaveBeenCalledTimes(2);
    });

    it('never scrolls a box without it', async () => {
        await render(
            <ScrollBox maxHeight={100} testID="box">
                <Text>Line</Text>
            </ScrollBox>,
            { wrapper: wrap },
        );
        await act(async () => fireEvent(screen.getByTestId('box'), 'contentSizeChange', 300, 260));
        expect(scrollToEnd).not.toHaveBeenCalled();
    });
});
