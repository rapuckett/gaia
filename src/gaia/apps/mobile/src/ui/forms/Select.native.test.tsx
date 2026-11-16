// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { Select } from './Select';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('Select', () => {
    it('tells assistive tech its trigger opens a listbox', async () => {
        await render(<Select label="Language" value="en" options={[{ value: 'en', label: 'English' }]} onChange={() => undefined} testID="sel" />, { wrapper: wrap });
        expect(screen.getByTestId('sel').props['aria-haspopup']).toBe('listbox');
    });
});
