// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { Log } from './ProfileCard';
import type { LogLine } from './useProfileRun';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const LINES = [
    { kind: 'progress', text: 'Scanning installed applications...' },
    { kind: 'finding', text: 'Bookmarks cooking blogs and Calgary transit pages' },
] as unknown as LogLine[];

const wrap = ({ children }: { children: React.ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('Scan log', () => {
    it('grows to its content once the scan is done, so no line spills past the border', async () => {
        await render(<Log lines={LINES} running={false} />, { wrapper: wrap });
        expect(StyleSheet.flatten(screen.getByTestId('profile-log').props.style).maxHeight).toBeUndefined();
    });

    it('clips to its cap while scanning', async () => {
        await render(<Log lines={LINES} running />, { wrapper: wrap });
        const style = StyleSheet.flatten(screen.getByTestId('profile-log').props.style);
        expect(style.overflow).toBe('hidden');
        expect(style.maxHeight).toBeGreaterThan(0);
    });
});
