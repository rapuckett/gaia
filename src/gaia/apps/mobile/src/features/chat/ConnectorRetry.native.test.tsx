// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ConnectorAccount, ConnectorRow } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider, queryKeys } from '@/data';
import { ThemeProvider } from '@/ui';

import { ConnectorRetry } from './ConnectorRetry';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const account = (id: string, status: ConnectorAccount['status'], is_default = false): ConnectorAccount => ({ account_id: id, email: `${id}@example.com`, status, is_default });
const google = (accounts: ConnectorAccount[]) =>
    ({ id: 'google', display_name: 'Google', type: 'oauth_pkce', configured: accounts.some((a) => a.status === 'ok'), enabled: true, account_id: null, accounts, activations: {} }) as unknown as ConnectorRow;

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
    return { queryClient, wrapper };
}

describeNative('ConnectorRetry with several accounts', () => {
    const content = 'NOT_CONNECTED: Google is not currently connected.';

    it('waits for the account the card named, not another that already worked', async () => {
        const data: FakeClientData = { connectors: [google([account('a', 'ok', true), account('b', 'reauth_required')])] };
        const { queryClient, wrapper } = setup(data);
        await render(<ConnectorRetry content={content} providers={['google']} accounts={{ google: 'b' }} onRetry={() => undefined} />, { wrapper });
        await act(async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
        });
        expect(screen.queryByTestId('connector-retry')).toBeNull();

        data.connectors = [google([account('a', 'ok', true), account('b', 'ok')])];
        await act(async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
        });
        expect(await screen.findByTestId('connector-retry')).toBeTruthy();
        expect(screen.getByText(/Google/)).toBeTruthy();
    });
});
