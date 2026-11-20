// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { Log } from './ProfileCard';
import type { LogLine } from './useProfileRun';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: React.ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('Scan log', () => {
    it('keeps every line in a scroll box that clips at its border', async () => {
        const many = Array.from({ length: 50 }, (_, i) => ({ kind: 'log', text: `Line ${i + 1}` })) as LogLine[];
        await render(<Log lines={many} running={false} />, { wrapper: wrap });
        expect(screen.getByText('Line 1')).toBeTruthy();
        expect(screen.getByText('Line 50')).toBeTruthy();
        const box = screen.getByTestId('profile-log');
        expect(box.type).toBe('RCTScrollView');
        expect(StyleSheet.flatten(box.props.style).maxHeight).toBeLessThanOrEqual(200);
        expect(StyleSheet.flatten(box.parent?.props.style).overflow).toBe('hidden');
    });

    it('settles at the last line when the run ends, even after the person scrolled up mid-run', async () => {
        const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
        try {
            const first = [{ kind: 'log', text: 'Scanning Git identity...' }] as LogLine[];
            const { rerender } = await render(<Log lines={first} running />, { wrapper: wrap });
            const box = screen.getByTestId('profile-log');
            const at = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 300, height: 600 }, layoutMeasurement: { width: 300, height: 200 } } });
            await act(async () => fireEvent.scroll(box, at(400)));
            await act(async () => fireEvent.scroll(box, at(100)));
            scrollToEnd.mockClear();
            await act(async () => fireEvent(box, 'contentSizeChange', 300, 640));
            expect(scrollToEnd).not.toHaveBeenCalled();

            // The rest of the scan and its end land in one update; the final height is measured after.
            const all = [...first, ...Array.from({ length: 48 }, (_, i) => ({ kind: 'log', text: `Line ${i + 2}` })), { kind: 'log', text: 'Done. 21 items discovered.' }] as LogLine[];
            await act(async () => rerender(<Log lines={all} running={false} />));
            scrollToEnd.mockClear();
            await act(async () => fireEvent(box, 'contentSizeChange', 300, 2000));
            expect(scrollToEnd).toHaveBeenCalledTimes(1);
        } finally {
            scrollToEnd.mockRestore();
        }
    });
});
