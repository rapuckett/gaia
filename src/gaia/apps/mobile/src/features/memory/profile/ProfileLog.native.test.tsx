// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
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
        await render(<Log lines={many} />, { wrapper: wrap });
        expect(screen.getByText('Line 1')).toBeTruthy();
        expect(screen.getByText('Line 50')).toBeTruthy();
        const box = screen.getByTestId('profile-log');
        expect(box.type).toBe('RCTScrollView');
        expect(StyleSheet.flatten(box.props.style).maxHeight).toBeLessThanOrEqual(200);
        expect(StyleSheet.flatten(box.parent?.props.style).overflow).toBe('hidden');
    });
});
