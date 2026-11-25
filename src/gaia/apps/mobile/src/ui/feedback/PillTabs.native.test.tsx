// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { PillTabs, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('PillTabs', () => {
    it('lays every tab in one horizontal scroller and marks the chosen one', async () => {
        const tabs = ['local', 'fireworks', 'amd'].map((value) => ({ value, label: value }));
        await render(<PillTabs tabs={tabs} value="fireworks" onChange={() => {}} testID="tabs" />, { wrapper: wrap });
        const scroller = screen.getByTestId('tabs');
        expect(scroller.props.horizontal).toBe(true);
        for (const t of tabs) expect(screen.getByTestId(`tabs-${t.value}`)).toBeOnTheScreen();
        expect(screen.getByRole('radio', { name: 'fireworks', checked: true })).toBeOnTheScreen();
        expect(screen.getByRole('radio', { name: 'local', checked: false })).toBeOnTheScreen();
        expect(screen.queryByTestId('tabs-fade')).toBeNull();
    });
});
