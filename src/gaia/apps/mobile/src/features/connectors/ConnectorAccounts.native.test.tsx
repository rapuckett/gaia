// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ConnectorAccount, ConnectorRow } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ConnectorsScreen } from './ConnectorsScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const account = (email: string, over: Partial<ConnectorAccount> = {}): ConnectorAccount => ({ account_id: `id-${email}`, email, status: 'ok', is_default: false, ...over });

const google = (accounts: ConnectorAccount[]) =>
    ({
        id: 'google',
        display_name: 'Google',
        type: 'oauth_pkce',
        description: 'Mail and calendar.',
        configured: accounts.some((a) => a.status === 'ok'),
        configurable: true,
        enabled: true,
        account_id: accounts.find((a) => a.is_default)?.email ?? null,
        accounts,
        activations: {},
    }) as unknown as ConnectorRow;

function setup(connectors: ConnectorRow[]) {
    const data: FakeClientData = { connectors };
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

const A = account('avery@example.com', { is_default: true });
const B = account('blake@example.com');

describeNative('Connector accounts', () => {
    it('one account: the tile shows its address, a Disconnect and Add another', async () => {
        const { queryClient, wrap } = setup([google([A])]);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('avery@example.com'));
        expect(await screen.findByTestId('connector-disconnect-google')).toBeTruthy();
        expect(screen.getByText('Add another Google account')).toBeTruthy();
        expect(screen.queryByTestId('connector-accounts-google')).toBeNull();
        queryClient.clear();
    });

    it('several accounts: lists each with its state, and Make default sends one PATCH', async () => {
        const { client, queryClient, wrap } = setup([google([A, B])]);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText(/2.* accounts/)).toBeTruthy();
        fireEvent.press(await screen.findByLabelText('Google'));
        expect(await screen.findByTestId('connector-accounts-google')).toBeTruthy();
        expect(screen.getByText('Default')).toBeTruthy();
        expect(screen.getByText("GAIA sends from the default account when you don't name one.")).toBeTruthy();
        fireEvent.press(screen.getByLabelText(/Make .*blake@example.com.* the default/));
        await waitFor(() => expect(client.accountCalls).toEqual([{ kind: 'default', connectorId: 'google', accountId: B.account_id }]));
        queryClient.clear();
    });

    it('asks before removing one account, names it, and leaves the others', async () => {
        const { client, queryClient, wrap } = setup([google([A, B])]);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Google'));
        fireEvent.press(await screen.findByLabelText(/Disconnect .*blake@example.com/));
        expect(await screen.findByText(/^Disconnect .*blake@example.com.*\?/)).toBeTruthy();
        expect(screen.getByText('GAIA stops using this account. Your other Google accounts keep working.')).toBeTruthy();
        expect(client.accountCalls).toEqual([]);
        fireEvent.press(screen.getByTestId('connector-disconnect-account-confirm'));
        await waitFor(() => expect(client.accountCalls).toEqual([{ kind: 'disconnect', connectorId: 'google', accountId: B.account_id }]));
        expect(((await client.listConnectors()).connectors[0] as ConnectorRow).accounts).toHaveLength(1);
        queryClient.clear();
    });

    it('an expired account says so and offers Reconnect', async () => {
        const { queryClient, wrap } = setup([google([A, account('blake@example.com', { status: 'reauth_required' })])]);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText('Sign-in expired')).toBeTruthy();
        fireEvent.press(await screen.findByLabelText('Google'));
        expect(await screen.findByLabelText(/Reconnect .*blake@example.com/)).toBeTruthy();
        queryClient.clear();
    });

    it('asks to remove them all when the PC refuses a plain disconnect for having several', async () => {
        const { client, data, queryClient, wrap } = setup([google([A])]);
        const real = client.disconnectConnector;
        let refused = false;
        client.disconnectConnector = async (id, options) => {
            if (!options?.all && !refused) {
                refused = true;
                throw new GaiaApiError(409, 'several', undefined, undefined, { error: 'account_choice_required', choices: ['avery@example.com', 'blake@example.com'] });
            }
            return real(id, options);
        };
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('avery@example.com'));
        fireEvent.press(await screen.findByTestId('connector-disconnect-google'));
        fireEvent.press(await screen.findByTestId('connector-disconnect-confirm'));
        expect(await screen.findByText(/Disconnect all .*2.* Google accounts\?/)).toBeTruthy();
        fireEvent.press(screen.getByTestId('connector-disconnect-all-confirm'));
        await waitFor(() => expect(((data.connectors?.[0]) as ConnectorRow).configured).toBe(false));
        queryClient.clear();
    });
});
