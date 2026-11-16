// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { ConnectorRow } from '@/api/client.types';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { EmailConnect } from '../EmailConnect';
import { ConnectAccountCard } from './ConnectAccountCard';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: string) => mockPush(href) } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const row = (over: Partial<ConnectorRow>) =>
    ({
        type: 'oauth_pkce',
        description: '',
        configured: false,
        configurable: true,
        supports_device_code: false,
        scopes: [],
        default_scopes: ['openid', 'offline_access'],
        available_scopes: ['openid', 'offline_access', 'Mail.Read', 'Mail.Send'],
        oauth_setup_fields: [],
        account_id: null,
        activations: {},
        ...over,
    }) as unknown as ConnectorRow;

const microsoft = row({ id: 'microsoft', display_name: 'Microsoft Personal', supports_device_code: true });
const google = row({ id: 'google', display_name: 'Google' });
const code = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 60, message: '' };

function setup(data: FakeClientData) {
    const client = createFakeClient(data);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return { client, wrapper };
}

describeNative('ConnectAccountCard', () => {
    it("signs in with a code for the access the call needs, grants no agent, and keeps Google on the PC", async () => {
        const { client, wrapper } = setup({ connectors: [microsoft, google], deviceSignIn: code });
        const start = jest.spyOn(client, 'startConnectorDeviceSignIn');
        const card = { kind: 'connect_account', providers: ['microsoft', 'google'], agent_id: 'builtin:gaia', scopes: { microsoft: ['Mail.Read'] } };
        await render(<ConnectAccountCard data={card} />, { wrapper });

        await fireEvent.press(await screen.findByText('Connect Microsoft'));
        expect(await screen.findByText(/ABCD-EFGH/)).toBeTruthy();
        expect(start).toHaveBeenCalledTimes(1);
        const [id, scopes, ...rest] = start.mock.calls[0];
        expect(id).toBe('microsoft');
        expect([...scopes].sort()).toEqual(['Mail.Read', 'offline_access', 'openid']);
        expect(rest.filter((r) => r !== undefined)).toEqual([]);

        await fireEvent.press(screen.getByText('Connect Google'));
        expect(await screen.findByText(/Connect your account on your PC/)).toBeTruthy();
    });

    it('shows the needs-setup state and the cancelled sign-in the PC reports', async () => {
        const { wrapper } = setup({
            connectors: [microsoft, row({ id: 'google', display_name: 'Google', configurable: false })],
            deviceSignIn: code,
            signInEnd: { outcome: 'cancelled' },
        });
        await render(<ConnectAccountCard data={{ kind: 'connect_account', providers: ['microsoft', 'google'] }} />, { wrapper });
        await fireEvent.press(await screen.findByText('Set up Google'));
        expect(mockPush).toHaveBeenCalledWith('/connectors');

        await fireEvent.press(screen.getByText('Connect Microsoft'));
        expect(await screen.findByText('Sign-in was cancelled. Press Connect to try again.')).toBeTruthy();
    });
});

describeNative('EmailConnect', () => {
    it('offers only the mailbox the error names, signing in with a code', async () => {
        const { wrapper } = setup({ connectors: [microsoft, google], deviceSignIn: code });
        await render(<EmailConnect content="NOT_CONNECTED: microsoft is not currently connected." />, { wrapper });
        expect(await screen.findByText('Connect your email account to use Email Triage.')).toBeTruthy();
        expect(screen.queryByText('Connect Google')).toBeNull();
        await fireEvent.press(await screen.findByText('Connect Microsoft'));
        expect(await screen.findByText(/ABCD-EFGH/)).toBeTruthy();
    });
});
