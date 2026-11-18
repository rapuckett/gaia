// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BackHandler, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { ConnectorRow, DisconnectOutcome } from '@/api/client.types';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

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
        fireEvent.press(await screen.findByTestId('connector-disconnect-slack'));
        expect(await screen.findByText(/^Disconnect Slack\?/)).toBeTruthy();
        expect(screen.getByTestId('connector-disconnect-confirm')).toBeTruthy();
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

describeNative('ConnectorsScreen after-connect Personalize offer', () => {
    it('offers Personalize once the PC reports the connect, and drops the offer when the pass starts', async () => {
        const code = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 1, message: '' };
        const { data, queryClient, wrap } = setup([microsoft], undefined, code);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Microsoft'));
        fireEvent.press(await screen.findByText('Sign in with a code'));
        await screen.findByText(/ABCD-EFGH/);
        expect(screen.queryByText('Personalize GAIA')).toBeNull();

        data.connectors = [{ ...microsoft, configured: true, account_id: 'me@example.com' } as ConnectorRow];
        expect(await screen.findByText(/^Want GAIA to read your last two weeks of Outlook mail/, {}, { timeout: 3000 })).toBeTruthy();
        fireEvent.press(screen.getByText('Personalize GAIA'));
        expect(await screen.findByText(/^Optional: let GAIA read/)).toBeTruthy();
        queryClient.clear();
    });

    it('says it could not start, with the PC reason on its own line, and keeps the offer', async () => {
        const { client, data, queryClient, wrap } = setup([slack]);
        data.agents = [{ id: 'gaia', name: 'GAIA', namespaced_agent_id: 'gaia', description: '', source: 'builtin', conversation_starters: [], models: [] }] as never;
        client.activateConnectorAgent = () => Promise.reject(new GaiaApiError(500, 'keyring locked'));
        await render(<ConnectorsScreen initialExpanded="slack" initialJustConnected="slack" />, { wrapper: wrap });
        fireEvent.press(await screen.findByText('Personalize GAIA'));
        expect(await screen.findByText("Couldn't start personalization.")).toBeTruthy();
        expect(screen.getByText('keyring locked')).toBeTruthy();
        expect(screen.getByText(/^Want GAIA to read/)).toBeTruthy();
        queryClient.clear();
    });
});

describeNative('ConnectorsScreen setup from the phone', () => {
    afterEach(() => act(() => sheetStore.reset()));

    /** Records what each configure call sent, then lets the fake PC apply it. */
    function recordConfigure(client: ReturnType<typeof setup>['client']) {
        const sent: [string, Record<string, string | boolean>][] = [];
        const apply = client.configureConnector;
        client.configureConnector = (id, config, options) => {
            sent.push([id, { ...config }]);
            return apply(id, config, options);
        };
        return sent;
    }

    const slackSetup = {
        ...slack,
        id: 'mcp-slack',
        configured: false,
        mcp_env_keys: ['SLACK_MCP_XOXB_TOKEN'],
        config_fields: [{ key: 'SLACK_MCP_XOXB_TOKEN', label: 'Slack bot token', kind: 'secret', required: true, placeholder: 'xoxb-…', help_md: '', prefix: 'xoxb-' }],
    } as unknown as ConnectorRow;

    async function openSlackSheet(wrap: ReturnType<typeof setup>['wrap']) {
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await fireEvent.press(await screen.findByTestId('connectors-group-servers'));
        await fireEvent.press(await screen.findByLabelText('Slack'));
        await fireEvent.press(await screen.findByTestId('connector-connect-mcp-slack'));
        await fireEvent.changeText(await screen.findByTestId('connector-setup-SLACK_MCP_XOXB_TOKEN'), 'xoxb-test-token');
    }

    it('Android back closes the sheet and drops the typed key without sending it', async () => {
        let backHandlers: (() => boolean)[] = [];
        jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
            backHandlers.push(handler as () => boolean);
            return { remove: () => (backHandlers = backHandlers.filter((h) => h !== handler)) };
        });
        const { client, queryClient, wrap } = setup([slackSetup]);
        const sent = recordConfigure(client);
        await openSlackSheet(wrap);
        let handled = false;
        await act(async () => {
            handled = [...backHandlers].reverse().some((handler) => handler());
        });
        expect(handled).toBe(true);
        await waitFor(() => expect(screen.queryByDisplayValue('xoxb-test-token')).toBeNull());
        expect(sent).toEqual([]);
        jest.restoreAllMocks();
        queryClient.clear();
    });

    it("sends a server's key to the PC, clears it from the sheet, and checks the server", async () => {
        const { client, queryClient, wrap } = setup([slackSetup]);
        const sent = recordConfigure(client);
        await openSlackSheet(wrap);
        await fireEvent.press(screen.getByTestId('connector-setup-save'));

        expect(await screen.findByText('Slack started without errors.')).toBeTruthy();
        expect(sent).toEqual([['mcp-slack', { SLACK_MCP_XOXB_TOKEN: 'xoxb-test-token' }]]);
        expect(screen.queryByDisplayValue('xoxb-test-token')).toBeNull();

        await fireEvent.press(await screen.findByTestId('connector-edit-mcp-slack'));
        const field = await screen.findByTestId('connector-setup-SLACK_MCP_XOXB_TOKEN');
        expect(field.props).toMatchObject({ value: '', placeholder: '••••••••', secureTextEntry: true, autoComplete: 'off', autoCorrect: false });
        queryClient.clear();
    });

    it('saves an OAuth client and afterwards shows only its ID, never the secret', async () => {
        const fields = [
            { key: 'client_id', label: 'OAuth Client ID', kind: 'text', required: true, placeholder: '', help_md: '' },
            { key: 'client_secret', label: 'OAuth Client Secret', kind: 'secret', required: true, placeholder: '', help_md: '' },
        ];
        const google = {
            ...microsoft,
            id: 'google',
            display_name: 'Google',
            configured: true,
            account_id: 'me@example.com',
            supports_device_code: false,
            oauth_setup_fields: fields,
            oauth_client: { source: null, client_id: null, has_secret: false },
        } as unknown as ConnectorRow;
        const { client, queryClient, wrap } = setup([google]);
        const sent = recordConfigure(client);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await fireEvent.press(await screen.findByLabelText('Google'));
        await fireEvent.press(await screen.findByTestId('connector-client-google'));
        expect(await screen.findByText(/saved encrypted in your PC’s keyring/)).toBeTruthy();
        const clientId = screen.getByTestId('connector-setup-client_id').props;
        expect(clientId).toMatchObject({ autoCorrect: false, autoCapitalize: 'none' });
        expect(clientId.secureTextEntry).toBeFalsy();
        await fireEvent.changeText(await screen.findByTestId('connector-setup-client_id'), 'test-client-id');
        await fireEvent.changeText(screen.getByTestId('connector-setup-client_secret'), 'test-client-secret');
        await fireEvent.press(screen.getByTestId('connector-setup-save'));

        expect(await screen.findByText('Saved')).toBeTruthy();
        expect(sent).toEqual([['google', { client_id: 'test-client-id', client_secret: 'test-client-secret', save_only: true }]]);
        expect((await screen.findAllByText(/Saved client: .*test-client-id/)).length).toBeGreaterThan(0);
        expect(screen.queryByText(/test-client-secret/)).toBeNull();
        expect(screen.queryByDisplayValue('test-client-secret')).toBeNull();
        expect(screen.getByTestId('connector-setup-client_secret').props.placeholder).toBe('••••••••');
        queryClient.clear();
    });
});
