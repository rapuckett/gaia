// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { ConnectorGuide } from './ConnectorGuide';

const mockOpenLink = jest.fn();
jest.mock('@/platform/openLink', () => ({ openLinkFromPress: (url: string) => mockOpenLink(url) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('ConnectorGuide', () => {
    beforeEach(() => mockOpenLink.mockClear());

    it("walks Slack's setup in four numbered steps, each link opening its own page", async () => {
        await render(<ConnectorGuide connectorId="mcp-slack" setupUrl="https://api.slack.com/apps?new_app=1" />, { wrapper });
        for (const n of [1, 2, 3, 4]) expect(screen.getByTestId(`connector-guide-step-${n}`)).toBeTruthy();
        expect(screen.queryByTestId('connector-guide-step-5')).toBeNull();
        expect(screen.getByText('Create the Slack app')).toBeTruthy();
        expect(screen.getByText('Paste it below')).toBeTruthy();
        fireEvent.press(screen.getByText('Create Slack app'));
        expect(mockOpenLink).toHaveBeenCalledWith('https://api.slack.com/apps?new_app=1');
    });

    it('gives Slack no link until the PC sends its app page', async () => {
        await render(<ConnectorGuide connectorId="mcp-slack" />, { wrapper });
        expect(screen.queryByTestId('connector-guide-link-1')).toBeNull();
    });

    it('opens the Google Cloud pages in five steps and ends on the paste step', async () => {
        await render(<ConnectorGuide connectorId="google" />, { wrapper });
        expect(screen.getByTestId('connector-guide-step-5')).toBeTruthy();
        fireEvent.press(screen.getByTestId('connector-guide-link-1'));
        expect(mockOpenLink).toHaveBeenCalledWith('https://console.cloud.google.com/projectcreate');
        expect(screen.queryByTestId('connector-guide-link-5')).toBeNull();
    });

    it('draws nothing for a connector with no guide', async () => {
        await render(<ConnectorGuide connectorId="mcp-git" />, { wrapper });
        expect(screen.queryByTestId('connector-guide-mcp-git')).toBeNull();
    });
});
