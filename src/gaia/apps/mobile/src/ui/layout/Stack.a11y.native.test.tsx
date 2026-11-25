// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform, Pressable } from 'react-native';

import { Stack, Text, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Stack accessibility', () => {
    it('a label alone does not merge the box into one element', async () => {
        await render(
            <ThemeProvider>
                <Stack testID="box" accessibilityLabel="Group">
                    <Text>Inside</Text>
                </Stack>
            </ThemeProvider>,
        );
        expect(screen.getByTestId('box').props.accessible).toBeUndefined();
        expect(screen.getByTestId('box').props.accessibilityLabel).toBe('Group');
    });

    it('accessible merges the box into one element', async () => {
        await render(
            <ThemeProvider>
                <Stack testID="box" accessible accessibilityLabel="Group">
                    <Text>Inside</Text>
                </Stack>
            </ThemeProvider>,
        );
        expect(screen.getByTestId('box').props.accessible).toBe(true);
    });

    it('a labeled box holding a button leaves the button reachable by role', async () => {
        await render(
            <ThemeProvider>
                <Stack testID="box" accessibilityLabel="Group">
                    <Pressable accessibilityRole="button" accessibilityLabel="Go" />
                </Stack>
            </ThemeProvider>,
        );
        expect(screen.getByTestId('box').props.accessible).not.toBe(true);
        expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
    });
});
