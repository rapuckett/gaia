// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { ThemeProvider } from '@/ui';

import { TerminalOutput } from './TerminalOutput';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Terminal header', () => {
    it('keeps the exit badge on one line at its full width', async () => {
        await render(
            <ThemeProvider>
                <TerminalOutput output={{ command: 'false', stdout: 'x', stderr: '', returnCode: 2, truncated: false } as never} />
            </ThemeProvider>,
        );
        const badge = screen.getByTestId('terminal-exit');
        expect(StyleSheet.flatten(badge.props.style)).toMatchObject({ flexShrink: 0 });
    });
});
