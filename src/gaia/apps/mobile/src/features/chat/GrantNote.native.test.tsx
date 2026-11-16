// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { GrantNote, isAgentNotGranted } from './GrantNote';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('GrantNote', () => {
    it('tells a connected account without a grant from one that is not connected, and offers no Connect', async () => {
        expect(isAgentNotGranted("AGENT_NOT_GRANTED: this agent isn't granted these scopes on microsoft: Mail.Read.")).toBe(true);
        expect(isAgentNotGranted('NOT_CONNECTED: microsoft is not currently connected.')).toBe(false);
        await render(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ThemeProvider>
                    <GrantNote />
                </ThemeProvider>
            </SafeAreaProvider>,
        );
        expect(screen.getByTestId('agent-not-granted')).toBeTruthy();
        expect(screen.queryByText(/^Connect /)).toBeNull();
    });
});
