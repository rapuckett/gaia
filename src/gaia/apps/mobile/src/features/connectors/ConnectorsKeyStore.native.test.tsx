// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ConnectorKeyStore, ConnectorRow } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ConnectorsScreen } from './ConnectorsScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const LOCKED = "The OS key store is locked, so GAIA can't read your saved key.";
const WAITING = 'Your PC is asking to unlock its key store. Approve it there to continue.';

const google = {
    id: 'google',
    display_name: 'Google',
    type: 'oauth_pkce',
    description: 'Gmail and Calendar.',
    configured: null,
    configurable: true,
    oauth_setup_fields: [],
    account_id: null,
    scopes: [],
    activations: {},
} as unknown as ConnectorRow;

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

function setup(state: ConnectorKeyStore, others: ConnectorRow[] = [slack], held: ConnectorRow = google) {
    const data: FakeClientData = { connectors: [{ ...held, key_store: state }, ...others], connectorsKeyStore: state };
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

describeNative('ConnectorsScreen key store', () => {
    it('shows one locked notice with Try again, never the restart advice', async () => {
        const { queryClient, wrap } = setup('locked');
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText(LOCKED)).toBeTruthy();
        expect(screen.getAllByTestId('connectors-key-store-locked')).toHaveLength(1);
        expect(screen.getByText('Try again')).toBeTruthy();
        expect(screen.queryByText(/Restart GAIA/)).toBeNull();
        expect(screen.getByText('Slack')).toBeTruthy();
        queryClient.clear();
    });

    it('shows a tile the key store held back with no status and no actions', async () => {
        // An account whose unconnected tile would offer Connect.
        const microsoft = { ...google, id: 'microsoft', display_name: 'Microsoft', description: 'Mail and calendar.' } as ConnectorRow;
        const { queryClient, wrap } = setup('locked', [], microsoft);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Microsoft'));
        expect(await screen.findByText('Mail and calendar.')).toBeTruthy();
        expect(screen.queryByText('Connect')).toBeNull();
        expect(screen.queryByText('Disconnect')).toBeNull();
        expect(screen.queryByText('OAuth')).toBeNull();
        expect(screen.queryByText('Connected')).toBeNull();
        queryClient.clear();
    });

    it('Try again asks the PC to unlock its key store, then reads the list again', async () => {
        const { client, data, queryClient, wrap } = setup('locked');
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText(LOCKED)).toBeTruthy();

        data.connectors = [{ ...google, configured: true, account_id: 'me@example.com' } as ConnectorRow, slack];
        delete data.connectorsKeyStore;
        await fireEvent.press(screen.getByText('Try again'));
        await waitFor(() => expect(client.keyStoreRetries).toBe(1));
        expect(await screen.findByText(/me@example.com/)).toBeTruthy();
        expect(screen.queryByText(LOCKED)).toBeNull();
        queryClient.clear();
    });

    it('while the PC asks, shows the waiting notice and no Try again', async () => {
        const { queryClient, wrap } = setup('waiting');
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText(WAITING)).toBeTruthy();
        expect(screen.getAllByTestId('connectors-key-store-waiting')).toHaveLength(1);
        expect(screen.queryByText('Try again')).toBeNull();
        expect(screen.queryByText(/Restart GAIA/)).toBeNull();
        queryClient.clear();
    });
});
