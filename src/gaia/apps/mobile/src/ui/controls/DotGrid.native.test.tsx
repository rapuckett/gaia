// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';
import { DotGrid } from './DotGrid';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('DotGrid', () => {
    it('masks one region per dim rectangle, and none without any', async () => {
        const rects = [
            { x: 10, y: 20, width: 200, height: 80 },
            { x: 0, y: 600, width: 390, height: 120 },
        ];
        const { unmount } = await render(<DotGrid dimBehind={rects} />, { wrapper: wrap });
        expect(screen.getAllByTestId('dot-dim-region', { hidden: true })).toHaveLength(2);
        unmount();
        await render(<DotGrid />, { wrapper: wrap });
        expect(screen.queryAllByTestId('dot-dim-region', { hidden: true })).toHaveLength(0);
    });
});
