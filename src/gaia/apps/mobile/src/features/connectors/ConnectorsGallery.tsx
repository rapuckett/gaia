// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import type { AgentInfo, ConnectorRow } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import { ConnectorsScreen } from './ConnectorsScreen';

/** Developer gallery (`/dev/connectors?state=`): one MCP server's open detail, in the states the list scene doesn't show. */
export const CONNECTOR_SCENES = ['serverOn', 'serverOff', 'grants'] as const;
export type ConnectorScene = (typeof CONNECTOR_SCENES)[number];

const server = (over: Partial<ConnectorRow> = {}) =>
    ({ id: 'linear', display_name: 'Linear', type: 'mcp_server', description: '', configured: true, configurable: true, enabled: true, account_id: null, activations: {}, ...over }) as unknown as ConnectorRow;

const agent = (id: string, name: string, over: Partial<AgentInfo> = {}): AgentInfo =>
    ({ id, name, namespaced_agent_id: id, description: '', source: 'builtin', conversation_starters: [], models: [], ...over }) as AgentInfo;

const GAIA = agent('gaia', 'GAIA', { consumes_mcp_servers: true });
const RESEARCH = agent('research', 'Research', { consumes_mcp_servers: true });
const TRIAGE = agent('triage', 'Issue triage', { required_connections: [{ connector_id: 'linear', scopes: ['read', 'write'], reason: 'Files and updates issues.' }] });

export function ConnectorsGallery({ state }: { state: ConnectorScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() =>
        createFakeClient({
            connectors: [server({ enabled: state !== 'serverOff' })],
            agents: state === 'grants' ? [GAIA, TRIAGE] : [GAIA, RESEARCH],
            grants: { linear: state === 'grants' ? { triage: ['read'] } : {} },
            activations: { linear: { gaia: true } },
        }),
    );
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <ConnectorsScreen initialExpanded="linear" />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
