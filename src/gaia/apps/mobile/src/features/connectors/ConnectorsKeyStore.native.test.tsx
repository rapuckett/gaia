// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
jest.mock('@/api/constants', () => ({ ...jest.requireActual('@/api/constants'), CONNECTOR_KEY_STORE_POLL_MS: 50 }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const LOCKED = "Your PC's key store is locked, so GAIA can't read some of your connected accounts. They can't be used until it's unlocked.";
const HELD_BACK = 'Not available until the key store is unlocked';
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

// An account whose unconnected tile offers Connect.
const MICROSOFT = {
    id: 'microsoft',
    display_name: 'Microsoft',
    type: 'oauth_pkce',
    description: 'Mail and calendar.',
    configured: false,
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

    it('shows a held-back tile as plain text, and makes it expandable again once the store unlocks', async () => {
        const { data, queryClient, wrap } = setup('locked', [], MICROSOFT);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText(HELD_BACK)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Microsoft' })).toBeNull();
        expect(screen.queryByTestId('tile-chevron')).toBeNull();
        expect(screen.queryByText('OAuth')).toBeNull();
        expect(screen.queryByText('Connected')).toBeNull();

        data.connectors = [MICROSOFT];
        delete data.connectorsKeyStore;
        await act(() => queryClient.invalidateQueries());
        expect(await screen.findByTestId('tile-chevron')).toBeTruthy();
        expect(screen.queryByText(HELD_BACK)).toBeNull();
        await fireEvent.press(screen.getByRole('button', { name: 'Microsoft' }));
        expect(await screen.findByText('Connect')).toBeTruthy();
        queryClient.clear();
    });

    it('opens Accounts once for a held-back account, and a fold sticks through refetches', async () => {
        const { data, queryClient, wrap } = setup('locked', [slack], MICROSOFT);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText(HELD_BACK)).toBeTruthy();
        await fireEvent.press(screen.getByTestId('connectors-group-accounts'));
        await waitFor(() => expect(screen.queryByText(HELD_BACK)).toBeNull());

        data.connectors = [{ ...MICROSOFT, key_store: 'waiting' } as ConnectorRow, slack];
        data.connectorsKeyStore = 'waiting';
        await act(() => queryClient.invalidateQueries());
        expect(await screen.findByText(WAITING)).toBeTruthy();
        expect(screen.queryByText(HELD_BACK)).toBeNull();
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

    it('re-reads the list while the PC asks only while the screen is focused', async () => {
        const { client, queryClient, wrap } = setup('waiting');
        const list = jest.spyOn(client, 'listConnectors');
        const view = await render(<ConnectorsScreen focused />, { wrapper: wrap });
        await waitFor(() => expect(list.mock.calls.length).toBeGreaterThanOrEqual(3));

        await view.rerender(<ConnectorsScreen focused={false} />);
        const atBlur = list.mock.calls.length;
        await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
        expect(list.mock.calls.length).toBe(atBlur);
        queryClient.clear();
    });

    it('while the PC asks, shows the waiting notice and no Try again', async () => {
        const { queryClient, wrap } = setup('waiting');
        await render(<ConnectorsScreen />, { wrapper: wrap });
        expect(await screen.findByText(WAITING)).toBeTruthy();
        expect(screen.getAllByTestId('connectors-key-store-waiting')).toHaveLength(1);
        expect(screen.getByText(HELD_BACK)).toBeTruthy();
        expect(screen.queryByText('Try again')).toBeNull();
        expect(screen.queryByText(/Restart GAIA/)).toBeNull();
        queryClient.clear();
    });
});
