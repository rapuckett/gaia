// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { ConnectorRow, DisconnectOutcome } from '@/api/client.types';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ConnectorsGallery, type ConnectorScene } from './ConnectorsGallery';
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

function setup(connectors: ConnectorRow[], disconnectOutcome?: DisconnectOutcome, deviceSignIn?: FakeClientData['deviceSignIn']) {
    const data: FakeClientData = { connectors, disconnectOutcome, deviceSignIn };
    const client = createFakeClient(data);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return { client, data, queryClient, wrap };
}

const microsoft = {
    id: 'microsoft',
    display_name: 'Microsoft',
    type: 'oauth_pkce',
    description: 'Mail and calendar.',
    configured: false,
    configurable: true,
    supports_device_code: true,
    oauth_setup_fields: [],
    account_id: null,
    activations: {},
} as unknown as ConnectorRow;

describeNative('ConnectorsScreen OAuth account', () => {
    it('signs in with a code from the phone until the PC reports the account, and sends Connect to the PC', async () => {
        const code = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 1, message: '' };
        const { data, queryClient, wrap } = setup([microsoft], undefined, code);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Microsoft'));
        fireEvent.press(await screen.findByText('Connect'));
        expect(await screen.findByText(/Connect this on your PC/)).toBeTruthy();

        fireEvent.press(await screen.findByText('Sign in with a code'));
        expect(await screen.findByText(/ABCD-EFGH/)).toBeTruthy();
        expect(screen.getByLabelText('Open sign-in page')).toBeTruthy();
        expect(screen.getByText('Waiting for sign-in…')).toBeTruthy();

        data.connectors = [{ ...microsoft, configured: true, account_id: 'me@example.com' } as ConnectorRow];
        expect(await screen.findByText(/me@example.com/, {}, { timeout: 3000 })).toBeTruthy();
        expect(screen.queryByText(/ABCD-EFGH/)).toBeNull();
        queryClient.clear();
    });

    it('says when the provider did not confirm the revoke after a disconnect', async () => {
        const connected = { ...microsoft, configured: true, account_id: 'me@example.com' } as ConnectorRow;
        const { queryClient, wrap } = setup([connected], { revoke_supported: true, revoked_remotely: false, revoke_error: 'timeout' });
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Microsoft'));
        fireEvent.press(await screen.findByLabelText('Disconnect'));
        await screen.findByText(/^Disconnect Microsoft/);
        fireEvent.press((await screen.findAllByLabelText('Disconnect')).at(-1)!);
        expect(await screen.findByText(/did not confirm the revoke \(timeout\)/)).toBeTruthy();
        queryClient.clear();
    });
});

describeNative('ConnectorsScreen MCP server', () => {
    it('pauses a server from the phone, and refuses to turn it back on with the PC-only text', async () => {
        const { client, queryClient, wrap } = setup([slack]);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Slack'));
        fireEvent.press(await screen.findByLabelText('Disable this MCP server'));
        await waitFor(async () => expect(((await client.listConnectors()).connectors[0] as ConnectorRow).enabled).toBe(false));

        fireEvent.press(await screen.findByText('Enable this MCP server'));
        expect(await screen.findByText(/^Do this on your PC\./)).toBeTruthy();
        expect(((await client.listConnectors()).connectors[0] as ConnectorRow).enabled).toBe(false);
        queryClient.clear();
    });

    it('asks before Disconnect deletes the saved credentials', async () => {
        const { client, queryClient, wrap } = setup([slack]);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Slack'));
        fireEvent.press(await screen.findByLabelText('Disconnect'));
        expect(await screen.findByText(/^Disconnect Slack\?/)).toBeTruthy();
        expect(((await client.listConnectors()).connectors[0] as ConnectorRow).configured).toBe(true);

        fireEvent.press((await screen.findAllByLabelText('Disconnect')).at(-1)!);
        await waitFor(async () => expect(((await client.listConnectors()).connectors[0] as ConnectorRow).configured).toBe(false));
        queryClient.clear();
    });
});

describeNative('ConnectorsGallery list states', () => {
    const scene = async (state: ConnectorScene) => {
        const { queryClient, wrap } = setup([]);
        await render(<ConnectorsGallery state={state} />, { wrapper: ({ children }: { children: ReactNode }) => wrap({ children }) });
        return queryClient;
    };

    it.each([
        ['loading', 'Connect accounts and MCP servers so GAIA can use them on your behalf. Choose what GAIA may do with each one.'],
        ['none', 'No connectors are available.'],
        ['error', /connectors service is not running/],
        ['groups', 'Unavailable'],
        ['code', 'Sign in with a code'],
    ] as const)('%s shows its key text', async (state, text) => {
        await scene(state);
        expect(await screen.findByText(text)).toBeTruthy();
    });

    it('menu opens the actions sheet from the tile trigger', async () => {
        await scene('menu');
        fireEvent.press(await screen.findByTestId('connector-actions-linear'));
        expect(await screen.findByLabelText('Disable')).toBeTruthy();
    });

    it('groups lists the folded groups', async () => {
        await scene('groups');
        for (const title of ['Connected', 'Accounts', 'MCP servers', 'Custom agent servers']) expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
    });

    it('codeFailed ends the sign-in with the failure text', async () => {
        await scene('codeFailed');
        fireEvent.press(await screen.findByTestId('device-sign-in-microsoft'));
        expect(await screen.findByText('Device sign-in failed.')).toBeTruthy();
    });

    it('code Cancel drops the code and offers the button again', async () => {
        await scene('code');
        fireEvent.press(await screen.findByTestId('device-sign-in-microsoft'));
        fireEvent.press(await screen.findByTestId('device-code-cancel'));
        expect(await screen.findByTestId('device-sign-in-microsoft')).toBeTruthy();
        expect(screen.queryByTestId('device-code-block')).toBeNull();
    });
});

describeNative('ConnectorsScreen server text', () => {
    const SENTENCE = 'GAIA answered with an error (500).';
    const gaia = { id: 'gaia', name: 'GAIA', namespaced_agent_id: 'gaia', description: '', source: 'builtin', conversation_starters: [], models: [], consumes_mcp_servers: true };
    const expectSplit = async (reason: string) => {
        expect((await screen.findByText(SENTENCE)).props.children).not.toContain(reason);
        const detail = await screen.findByText(reason);
        expect(StyleSheet.flatten(detail.props.style)).toMatchObject({ writingDirection: 'ltr' });
    };
    const open = async (prepare: (client: ReturnType<typeof setup>['client']) => void, withAgent = true) => {
        const { client, data, queryClient, wrap } = setup([slack]);
        if (withAgent) data.agents = [gaia as never];
        prepare(client);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Slack'));
        return queryClient;
    };

    it('a failed pause keeps the PC reason off the sentence', async () => {
        await open((client) => {
            client.disableConnector = () => Promise.reject(new GaiaApiError(500, 'mcp process crashed'));
        }, false);
        fireEvent.press(await screen.findByLabelText('Disable this MCP server'));
        await expectSplit('mcp process crashed');
    });

    it('a failed access load keeps the PC reason off the sentence', async () => {
        await open((client) => {
            client.listConnectorGrants = () => Promise.reject(new GaiaApiError(500, 'grant store locked'));
        });
        await expectSplit('grant store locked');
    });

    it('a failed access change keeps the PC reason off the sentence', async () => {
        await open((client) => {
            client.deactivateConnectorAgent = () => Promise.reject(new GaiaApiError(500, 'activation write failed'));
            client.listConnectorActivations = () => Promise.resolve({ activations: { gaia: true } });
        });
        fireEvent.press(await screen.findByRole('switch'));
        await expectSplit('activation write failed');
    });

    it('a failed sign-in start keeps the PC reason off the sentence', async () => {
        const { client, wrap } = setup([microsoft], undefined, { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 1, message: '' });
        client.startConnectorDeviceSignIn = () => Promise.reject(new GaiaApiError(500, 'provider unreachable'));
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Microsoft'));
        fireEvent.press(await screen.findByText('Sign in with a code'));
        await expectSplit('provider unreachable');
    });
});
