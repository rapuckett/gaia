// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { ThemeProvider } from '@/ui';

import { NumberMarker } from './NumberMarker';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('NumberMarker', () => {
    it('gives every number the same column width, in equal-width digits', async () => {
        await render(
            <ThemeProvider>
                <NumberMarker>{1}</NumberMarker>
                <NumberMarker>{10}</NumberMarker>
            </ThemeProvider>,
        );
        const columns = screen.getAllByTestId('number-marker').map((n) => StyleSheet.flatten(n.props.style));
        expect(columns[0].minWidth).toBeGreaterThan(0);
        expect(columns[0].minWidth).toBe(columns[1].minWidth);
        expect(columns[0].alignItems).toBe('flex-end');
        for (const digits of [screen.getByText('1'), screen.getByText('10')]) {
            expect(StyleSheet.flatten(digits.props.style).fontVariant).toEqual(['tabular-nums']);
        }
    });
});
