// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { Select } from './Select';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
            <SheetHost>{children}</SheetHost>
        </ThemeProvider>
    </SafeAreaProvider>
);

describeNative('Select', () => {
    it('tells assistive tech its trigger opens a listbox', async () => {
        await render(<Select label="Language" value="en" options={[{ value: 'en', label: 'English' }]} onChange={() => undefined} testID="sel" />, { wrapper: wrap });
        expect(screen.getByTestId('sel').props['aria-haspopup']).toBe('listbox');
    });

    describe('disabled option', () => {
        const options = [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta', disabled: true, reason: 'Not ready yet' },
        ];
        const open = async (onChange = jest.fn()) => {
            await render(<Select label="Pick" value="a" options={options} onChange={onChange} testID="sel" />, { wrapper: wrap });
            await fireEvent.press(screen.getByTestId('sel'));
            return onChange;
        };

        it('is announced as disabled and shows its reason', async () => {
            await open();
            const row = await screen.findByTestId('sel-option-b');
            expect(row.props.accessibilityState?.disabled ?? row.props['aria-disabled']).toBe(true);
            expect(screen.getByText('Not ready yet')).toBeTruthy();
            expect(screen.getByTestId('sel-option-a').props['aria-disabled']).toBeFalsy();
        });

        it('does not call onChange when pressed, while an enabled option still does', async () => {
            const onChange = await open();
            await fireEvent.press(await screen.findByTestId('sel-option-b'));
            expect(onChange).not.toHaveBeenCalled();
            await fireEvent.press(screen.getByTestId('sel-option-a'));
            expect(onChange).toHaveBeenCalledWith('a');
        });
    });
});
