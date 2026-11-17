// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AgentInfo, ConnectorRow } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useConnectionStore } from '@/state/connection';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import { ConnectorsScreen } from './ConnectorsScreen';

jest.mock('@/ui', () => {
    const actual = jest.requireActual('@/ui');
    const { createElement } = jest.requireActual('react');
    return { ...actual, UIProvider: ({ children }: { children: unknown }) => createElement(actual.ThemeProvider, null, createElement(actual.SheetScope, null, children)) };
});
jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const row = (over: Partial<ConnectorRow>) =>
    ({ id: 'linear', display_name: 'Linear', type: 'mcp_server', description: '', configured: true, configurable: true, enabled: true, account_id: null, activations: {}, ...over }) as unknown as ConnectorRow;
const GAIA = { id: 'gaia', name: 'GAIA', namespaced_agent_id: 'gaia', description: '', source: 'builtin', conversation_starters: [], models: [], consumes_mcp_servers: true } as unknown as AgentInfo;

async function mount(connector: ConnectorRow) {
    const activate = jest.fn();
    const client = { ...createFakeClient({ connectors: [connector], agents: [GAIA], grants: { [connector.id]: {} }, activations: { [connector.id]: {} } }), activateConnectorAgent: activate };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <UIProvider>
                        <ScreenBannerProvider banner={null}>
                            <ConnectorsScreen initialExpanded={connector.id} initialJustConnected={connector.id} />
                        </ScreenBannerProvider>
                    </UIProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        </SafeAreaProvider>,
    );
    return activate;
}

describeNative('Personalize offer on a paired phone', () => {
    beforeEach(() => useConnectionStore.setState({ connection: { baseUrl: 'https://pc.local:4443', pcId: 'pc-1', pinned: true } }));
    afterEach(() => useConnectionStore.setState({ connection: null }));

    it('an MCP connector shows the PC-only line and never activates', async () => {
        const activate = await mount(row({}));
        expect(await screen.findByTestId('personalize-pc-only-linear')).toBeTruthy();
        expect(screen.queryByTestId('personalize-linear')).toBeNull();
        expect(activate).not.toHaveBeenCalled();
    });

    it('an OAuth connector keeps the button', async () => {
        await mount(row({ id: 'gmail', display_name: 'Gmail', type: 'oauth_pkce', account_id: 'avery@example.com' }));
        expect(await screen.findByTestId('personalize-gmail')).toBeTruthy();
        expect(screen.queryByTestId('personalize-pc-only-gmail')).toBeNull();
    });
});
