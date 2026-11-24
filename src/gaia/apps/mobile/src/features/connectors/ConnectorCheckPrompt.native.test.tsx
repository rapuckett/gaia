// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ConnectorRow, ConnectorTestResponse } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ALREADY_WAITING_CODE, ALREADY_WAITING_DETAIL, applyDevicePromptEvent, useDevicePromptStore } from '@/features/devices/devicePrompts';
import { ThemeProvider } from '@/ui';

import { ConnectorsScreen } from './ConnectorsScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const slack = {
    id: 'slack',
    display_name: 'Slack',
    type: 'mcp_server',
    description: 'Read channels.',
    configured: true,
    configurable: true,
    enabled: true,
    account_id: null,
    activations: {},
} as unknown as ConnectorRow;

const event = (state: string) => ({ type: 'device_prompt', device_id: 'd1', kind: 'keyStore', action: 'connectorTest', state });

async function mount() {
    const client = createFakeClient({ connectors: [slack] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ConnectorsScreen />, { wrapper: wrap });
    fireEvent.press(await screen.findByLabelText('Slack'));
    await screen.findByTestId('connector-check-slack');
    return { client, queryClient };
}

describeNative('Connector Check on the PC\'s key-store prompt', () => {
    beforeEach(() => useDevicePromptStore.setState({ states: {}, notes: {} }));

    it('while the PC asks, the notice replaces Check and the request stays open until the PC answers', async () => {
        const { client, queryClient } = await mount();
        let finish: (r: ConnectorTestResponse) => void = () => undefined;
        jest.spyOn(client, 'testConnector').mockReturnValue(new Promise((resolve) => (finish = resolve)));

        await fireEvent.press(screen.getByTestId('connector-check-slack'));
        await act(async () => applyDevicePromptEvent(event('waiting')));
        expect(screen.getByText('Approve on your PC')).toBeTruthy();
        expect(screen.queryByTestId('connector-check-slack')).toBeNull();

        await act(async () => {
            applyDevicePromptEvent(event('approved'));
            finish({ ok: true, detail: '' });
        });
        expect(await screen.findByText('Slack started without errors.')).toBeTruthy();
        expect(screen.getByTestId('connector-check-slack')).toBeTruthy();
        queryClient.clear();
    });

    it('a 429 asks to wait a few seconds and a busy 409 says the PC waits on another request; Check stays for both', async () => {
        const { client, queryClient } = await mount();
        const test = jest.spyOn(client, 'testConnector').mockRejectedValueOnce(new GaiaApiError(429, 'This was just tried. Wait 5 s, then try again.', undefined, undefined, null, 5));

        await fireEvent.press(screen.getByTestId('connector-check-slack'));
        expect(await screen.findByText('You asked for this a moment ago. Wait a few seconds, then try again.')).toBeTruthy();
        expect(screen.getByTestId('connector-check-slack')).toBeTruthy();

        test.mockRejectedValueOnce(new GaiaApiError(409, ALREADY_WAITING_DETAIL, undefined, undefined, { code: ALREADY_WAITING_CODE, message: ALREADY_WAITING_DETAIL }));
        await fireEvent.press(screen.getByTestId('connector-check-slack'));
        expect(await screen.findByText('Your PC is already waiting for an answer to another request. Answer that one first.')).toBeTruthy();
        expect(screen.queryByText(/You asked for this a moment ago/)).toBeNull();
        expect(screen.getByTestId('connector-check-slack')).toBeTruthy();
        queryClient.clear();
    });

    it('after approval, a failed check shows the failed notice with the PC\'s reason and Try again', async () => {
        const { client, queryClient } = await mount();
        let fail: (e: Error) => void = () => undefined;
        const test = jest.spyOn(client, 'testConnector').mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));

        await fireEvent.press(screen.getByTestId('connector-check-slack'));
        await act(async () => applyDevicePromptEvent(event('waiting')));
        await act(async () => fail(new GaiaApiError(500, 'The key store returned an error.')));
        expect(await screen.findByText("It was approved on your PC, but it didn't finish.")).toBeTruthy();
        expect(screen.getByText('The key store returned an error.')).toBeTruthy();

        test.mockResolvedValueOnce({ ok: true, detail: '' });
        await fireEvent.press(screen.getByText('Try again'));
        expect(await screen.findByText('Slack started without errors.')).toBeTruthy();
        expect(test).toHaveBeenCalledTimes(2);
        queryClient.clear();
    });
});
