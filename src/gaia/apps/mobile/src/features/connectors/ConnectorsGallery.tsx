// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import type { AgentInfo, AgentMcpServer, ConnectorListEntry, ConnectorRow, GaiaClient } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaApiError } from '@/api/errors';
import { GaiaClientProvider } from '@/data';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import { ConnectorsScreen } from './ConnectorsScreen';

/**
 * Developer gallery (`/dev/connectors?state=`): one MCP server's open detail, and the list's own states.
 * CON-01: `loading`, `error`, `none`. CON-03: `groups` (`#expand` opens the folded groups). CON-17: `groups#tap=connectors-group-agentServers` opens Custom agent servers.
 * CON-06: `menu` (`#tap=connector-actions-linear` opens the actions sheet). CON-08: `code`
 * (`#tap=device-sign-in-microsoft` shows the code), `codeFailed` (the same tap, then the failure).
 * CON-02: `many` (8 connectors, so the search field shows). CON-11: `disconnected` and `revoked` open Microsoft Personal;
 * `#tap=connector-disconnect-microsoft,connector-disconnect-confirm`: `disconnected` answers that the provider has no revoke API, `revoked`
 * that the provider did not confirm the revoke (reason on the notice). CON-16: `personalize` opens a connected Gmail tile with the Personalize GAIA offer.
 */
export const CONNECTOR_SCENES = ['serverOn', 'serverOff', 'grants', 'loading', 'error', 'none', 'groups', 'menu', 'code', 'codeFailed', 'many', 'disconnected', 'revoked', 'personalize'] as const;
export type ConnectorScene = (typeof CONNECTOR_SCENES)[number];

const server = (over: Partial<ConnectorRow> = {}) =>
    ({ id: 'linear', display_name: 'Linear', type: 'mcp_server', description: '', configured: true, configurable: true, enabled: true, account_id: null, activations: {}, ...over }) as unknown as ConnectorRow;

const agent = (id: string, name: string, over: Partial<AgentInfo> = {}): AgentInfo =>
    ({ id, name, namespaced_agent_id: id, description: '', source: 'builtin', conversation_starters: [], models: [], ...over }) as AgentInfo;

const account = (id: string, display_name: string, over: Partial<ConnectorRow> = {}) =>
    server({ id, display_name, type: 'oauth_pkce', configured: false, supports_device_code: true, oauth_setup_fields: [], ...over } as Partial<ConnectorRow>);
const signedIn = () => account('microsoft', 'Microsoft Personal', { configured: true, account_id: 'avery@example.com' });
const unavailable = (): ConnectorListEntry => ({ id: 'jira', display_name: 'Jira', error: 'unavailable' });

const AGENT_MCP: AgentMcpServer = {
    agent_id: 'research', agent_name: 'Research', config_path: '/home/you/.gaia/agents/research/mcp.json', server_name: 'filesystem', command: 'npx', args: ['-y', 'server-filesystem'], disabled: false,
};
const DEVICE_CODE = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5, message: '' };

/** What each list-state scene gives the fake PC, and the calls it answers itself. */
const LIST_SCENES: Partial<Record<ConnectorScene, { data: FakeClientData; expanded?: string; override?: Partial<GaiaClient> }>> = {
    loading: { data: {}, override: { listConnectors: () => new Promise<never>(() => undefined) } },
    error: { data: {}, override: { listConnectors: () => Promise.reject(new GaiaApiError(500, 'The connectors service is not running.')) } },
    none: { data: { connectors: [] } },
    groups: {
        data: {
            connectors: [
                unavailable(),
                server({ id: 'slack', display_name: 'Slack' }),
                account('microsoft', 'Microsoft Personal'),
                server({ id: 'notion', display_name: 'Notion', configured: false }),
            ],
            agentMcps: [AGENT_MCP],
        },
    },
    many: { data: { connectors: ['Slack', 'GitHub', 'Notion', 'Linear', 'Jira', 'Asana', 'Figma', 'Stripe'].map((name) => server({ id: name.toLowerCase(), display_name: name })) } },
    disconnected: { data: { connectors: [signedIn()], disconnectOutcome: { revoke_supported: false, revoked_remotely: false, revoke_error: null } }, expanded: 'microsoft' },
    revoked: { data: { connectors: [signedIn()], disconnectOutcome: { revoke_supported: true, revoked_remotely: false, revoke_error: 'invalid_grant' } }, expanded: 'microsoft' },
    personalize: { data: { connectors: [server({ id: 'gmail', display_name: 'Gmail', type: 'oauth_pkce', account_id: 'avery@example.com' })] }, expanded: 'gmail' },
    menu: { data: { connectors: [server()], activations: { linear: { gaia: true } } } },
    code: { data: { connectors: [account('microsoft', 'Microsoft Personal')], deviceSignIn: DEVICE_CODE }, expanded: 'microsoft' },
    codeFailed: { data: { connectors: [account('microsoft', 'Microsoft Personal')], deviceSignIn: DEVICE_CODE, signInEnd: { outcome: 'failed' } }, expanded: 'microsoft' },
};

const GAIA = agent('gaia', 'GAIA', { consumes_mcp_servers: true });
const RESEARCH = agent('research', 'Research', { consumes_mcp_servers: true });
const TRIAGE = agent('triage', 'Issue triage', { required_connections: [{ connector_id: 'linear', scopes: ['read', 'write'], reason: 'Files and updates issues.' }] });

export function ConnectorsGallery({ state }: { state: ConnectorScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const listScene = LIST_SCENES[state];
    const [client] = useState(() =>
        listScene
            ? { ...createFakeClient({ agents: [GAIA, RESEARCH], ...listScene.data }), ...listScene.override }
            : createFakeClient({
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
                        <ConnectorsScreen initialExpanded={listScene ? listScene.expanded : 'linear'} />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
