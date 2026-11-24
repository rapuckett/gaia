// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { ChoiceList } from './ChoiceList';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('ChoiceList', () => {
    it('gives each option a stable id and picks it on press', async () => {
        const onChange = jest.fn();
        await render(<ChoiceList testID="pick" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={onChange} />, { wrapper: wrap });
        expect(screen.getByTestId('pick')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('pick-option-b'));
        expect(onChange).toHaveBeenCalledWith('b');
    });
});
