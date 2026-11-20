// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import type { AgentInfo, AgentMcpServer, ConnectorKeyStore, ConnectorListEntry, ConnectorRow, GaiaClient } from '@/api/client.types';
import type { ConnectorCheck } from '@/data';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaApiError } from '@/api/errors';
import { GaiaClientProvider } from '@/data';
import { useConnectionStore } from '@/state/connection';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import type { LoopbackOutcome, OAuthLoopbackNative } from '../../../modules/gaia-oauth-loopback';

import { BrowserSignInDepsContext, type BrowserSignIn, type BrowserSignInDeps } from './browserSignIn';
import { ConnectorsScreen } from './ConnectorsScreen';

/**
 * Developer gallery (`/dev/connectors?state=`): one MCP server's open detail, and the list's own states.
 * CON-01: `loading`, `error`, `none`. CON-03: `groups` (`#expand` opens the folded groups). CON-17: `groups#tap=connectors-group-agentServers` opens Custom agent servers.
 * CON-06: `menu` (`#tap=connector-actions-linear` opens the actions sheet). CON-08: `code`
 * (`#tap=device-sign-in-microsoft` shows the code), `codeFailed` (the same tap, then the failure).
 * CON-02: `many` (8 connectors, so the search field shows). CON-11: `disconnected` and `revoked` open Microsoft Personal;
 * `#tap=connector-disconnect-microsoft,connector-disconnect-confirm`: `disconnected` answers that the provider has no revoke API, `revoked`
 * that the provider did not confirm the revoke (reason on the notice). CON-09: `oauthSetup` opens Google's first-time setup sheet. CON-10: `oauthClient`
 * opens a connected account's OAuth client sheet. CON-12: `mcpConfigure` opens Slack's key sheet. CON-13: `checkRunning`, `checkOk`, `checkSlow` and
 * `checkFailed` show a Linear server's Check line (`#tap=connector-check-linear` runs it again). CON-07: on a paired phone, `googleReady` shows Google's
 * Connect, and with `#tap=connector-connect-google`: `googleBrowser` waits on the browser, `googleFinishing` waits on the PC, `googleDone` ends
 * connected, `googleDenied` (declined at Google), `googleTimeout`, `googleExpired` (PC answers 404), `googleStateMismatch` (400), `googleRefused`
 * (403 at the start), `googleFailed` (the PC's generic 500) and `googleSuperseded` (a sign-in started on the PC replaced it) each end on their notice; `googleCancelled` opens on the cancelled notice, no tap needed. CON-18: every scene ends with the Extend with MCP link. CON-16: `personalize` opens a just-connected Gmail tile with the after-connect Personalize GAIA offer, `personalizeTile` the plain per-tile offer, and `personalizeFailed` a just-connected server whose offer fails (`#tap=personalize-linear`: the sentence plus the PC's reason), `personalizeMcp` a just-connected server on a paired phone (the same Personalize button as on the PC).
 * CON-19: the PC's key store held back an account: `keyStoreLocked` (the locked notice with Try again), `keyStoreWaiting` (its prompt still open), and
 * `keyStoreHeldBack` (a held-back account alone, as plain text with its line).
 */
export const CONNECTOR_SCENES = ['serverOn', 'serverOff', 'grants', 'loading', 'error', 'none', 'groups', 'menu', 'code', 'codeFailed', 'many', 'disconnected', 'revoked', 'personalize', 'personalizeTile', 'personalizeFailed', 'personalizeMcp', 'oauthSetup', 'oauthClient', 'mcpConfigure', 'checkRunning', 'checkOk', 'checkSlow', 'checkFailed', 'googleReady', 'googleBrowser', 'googleFinishing', 'googleDone', 'googleDenied', 'googleTimeout', 'googleExpired', 'googleStateMismatch', 'googleRefused', 'googleFailed', 'googleSuperseded', 'googleCancelled', 'keyStoreLocked', 'keyStoreWaiting', 'keyStoreHeldBack'] as const;
export type ConnectorScene = (typeof CONNECTOR_SCENES)[number];

const server = (over: Partial<ConnectorRow> = {}) =>
    ({ id: 'linear', display_name: 'Linear', type: 'mcp_server', description: '', configured: true, configurable: true, enabled: true, account_id: null, activations: {}, ...over }) as unknown as ConnectorRow;

const agent = (id: string, name: string, over: Partial<AgentInfo> = {}): AgentInfo =>
    ({ id, name, namespaced_agent_id: id, description: '', source: 'builtin', conversation_starters: [], models: [], ...over }) as AgentInfo;

const account = (id: string, display_name: string, over: Partial<ConnectorRow> = {}) =>
    server({ id, display_name, type: 'oauth_pkce', configured: false, supports_device_code: true, oauth_setup_fields: [], ...over } as Partial<ConnectorRow>);
const signedIn = () => account('microsoft', 'Microsoft Personal', { configured: true, account_id: 'avery@example.com' });
const unavailable = (): ConnectorListEntry => ({ id: 'jira', display_name: 'Jira', error: 'unavailable' });
const heldBack = (state: ConnectorKeyStore) => account('microsoft', 'Microsoft Personal', { configured: null, key_store: state });

const AGENT_MCP: AgentMcpServer = {
    agent_id: 'research', agent_name: 'Research', config_path: '/home/you/.gaia/agents/research/mcp.json', server_name: 'filesystem', command: 'npx', args: ['-y', 'server-filesystem'], disabled: false,
};
const DEVICE_CODE = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5, message: '' };

const GMAIL = server({ id: 'gmail', display_name: 'Gmail', type: 'oauth_pkce', account_id: 'avery@example.com' });

// The catalog's own field specs; no scene carries a key or secret value.
const CLIENT_FIELDS = [
    { key: 'client_id', label: 'OAuth Client ID', kind: 'text', required: true, placeholder: '', help_md: 'From Google Cloud Console → APIs & Services → Credentials → your Desktop-app OAuth 2.0 Client. Looks like <digits>-<hash>.apps.googleusercontent.com.' },
    { key: 'client_secret', label: 'OAuth Client Secret', kind: 'secret', required: true, placeholder: '', help_md: 'From the same Desktop-app OAuth client. Required by Google even for PKCE flows. Stored encrypted in your OS keyring.' },
];
const GOOGLE_SETUP = server({
    id: 'google', display_name: 'Google', type: 'oauth_pkce', configured: false, configurable: false, oauth_setup_fields: CLIENT_FIELDS,
    oauth_client: { source: null, client_id: null, has_secret: false }, docs_url: 'https://amd-gaia.ai/docs/connectors/google',
} as Partial<ConnectorRow>);
const GOOGLE_CLIENT = server({
    id: 'google', display_name: 'Google', type: 'oauth_pkce', account_id: 'avery@example.com', oauth_setup_fields: CLIENT_FIELDS,
    oauth_client: { source: 'keyring', client_id: 'example-client.apps.googleusercontent.com', has_secret: true }, docs_url: 'https://amd-gaia.ai/docs/connectors/google',
} as Partial<ConnectorRow>);
const GOOGLE_READY = server({
    id: 'google', display_name: 'Google', type: 'oauth_pkce', configured: false, configurable: true, oauth_setup_fields: CLIENT_FIELDS,
    oauth_client: { source: 'keyring', client_id: 'example-client.apps.googleusercontent.com', has_secret: true }, docs_url: 'https://amd-gaia.ai/docs/connectors/google',
} as Partial<ConnectorRow>);
const SLACK_SETUP = server({
    id: 'mcp-slack', display_name: 'Slack', configured: false, mcp_env_keys: ['SLACK_MCP_XOXB_TOKEN'], setup_url: 'https://api.slack.com/apps', product_url: 'https://slack.com',
    config_fields: [{ key: 'SLACK_MCP_XOXB_TOKEN', label: 'Slack bot token', kind: 'secret', required: true, placeholder: 'xoxb-…', help_md: '', prefix: 'xoxb-' }],
} as Partial<ConnectorRow>);
const LINEAR_KEYED = server({ mcp_env_keys: ['LINEAR_API_KEY'], product_url: 'https://linear.app' } as Partial<ConnectorRow>);
const CHECKS: Partial<Record<ConnectorScene, ConnectorCheck>> = {
    checkRunning: { state: 'checking' },
    checkOk: { state: 'ok' },
    checkSlow: { state: 'failed', slow: true, detail: 'Timed out after 30 s waiting for the server to start.' },
    checkFailed: { state: 'failed', slow: false, detail: 'Error: 401 Unauthorized (the key was rejected)' },
};

/** `googleCancelled` opens on the end of a sign-in whose browser closed unfinished; Connect starts another that ends the same way. */
export const CANCELLED: BrowserSignIn = { state: 'failed', reason: 'closed' };

/** What the phone's loopback listener hands back in each Google scene; null waits on the browser. */
const GOOGLE_REDIRECTS: Partial<Record<ConnectorScene, LoopbackOutcome | null>> = {
    googleReady: null,
    googleBrowser: null,
    googleFinishing: { outcome: 'code', code: 'gallery-code', state: '' },
    googleDone: { outcome: 'code', code: 'gallery-code', state: '' },
    googleDenied: { outcome: 'error', error: 'access_denied' },
    googleTimeout: { outcome: 'timeout' },
    googleExpired: { outcome: 'code', code: 'gallery-code', state: '' },
    googleStateMismatch: { outcome: 'code', code: 'gallery-code', state: '' },
    googleRefused: null,
    googleFailed: { outcome: 'code', code: 'gallery-code', state: '' },
    googleSuperseded: null,
    googleCancelled: { outcome: 'cancelled' },
};

/** A listener that answers at once, as if the browser came straight back; the browser itself never closes. `initial` seeds where the sign-in starts. */
export function galleryDeps(redirect: LoopbackOutcome | null, initial?: BrowserSignIn): BrowserSignInDeps {
    const loopback: OAuthLoopbackNative = {
        start: async () => ({ port: 49152 }),
        waitForRedirect: (state) =>
            redirect ? Promise.resolve(redirect.outcome === 'code' ? { ...redirect, state } : redirect) : new Promise<never>(() => undefined),
        cancel: () => undefined,
    };
    // Paired through the deps, not the app's connection: setting that sends the web gallery to the home screen.
    return {
        loopback,
        returnUrl: () => 'ai.amd.gaia.mobile.dev://oauth-done',
        openAuthSession: () => new Promise<never>(() => undefined),
        dismissAuthSession: () => undefined,
        paired: true,
        ...(initial ? { initial } : {}),
    };
}

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
    personalize: { data: { connectors: [GMAIL] }, expanded: 'gmail' },
    personalizeTile: { data: { connectors: [GMAIL] }, expanded: 'gmail' },
    personalizeFailed: {
        data: { connectors: [server()], grants: { linear: {} }, activations: { linear: {} } },
        expanded: 'linear',
        override: { activateConnectorAgent: () => Promise.reject(new GaiaApiError(500, 'The keyring is locked.')) },
    },
    personalizeMcp: { data: { connectors: [server()], grants: { linear: {} }, activations: { linear: {} } }, expanded: 'linear' },
    menu: { data: { connectors: [server()], activations: { linear: { gaia: true } } } },
    code: { data: { connectors: [account('microsoft', 'Microsoft Personal')], deviceSignIn: DEVICE_CODE }, expanded: 'microsoft' },
    codeFailed: { data: { connectors: [account('microsoft', 'Microsoft Personal')], deviceSignIn: DEVICE_CODE, signInEnd: { outcome: 'failed' } }, expanded: 'microsoft' },
    oauthSetup: { data: { connectors: [GOOGLE_SETUP] }, expanded: 'google' },
    oauthClient: { data: { connectors: [GOOGLE_CLIENT] }, expanded: 'google' },
    mcpConfigure: { data: { connectors: [SLACK_SETUP] }, expanded: 'mcp-slack' },
    checkRunning: { data: { connectors: [LINEAR_KEYED] }, expanded: 'linear', override: { testConnector: () => new Promise<never>(() => undefined) } },
    checkOk: { data: { connectors: [LINEAR_KEYED] }, expanded: 'linear' },
    checkSlow: { data: { connectors: [LINEAR_KEYED], connectorTest: { ok: false, reason: 'timeout', detail: 'Timed out after 30 s waiting for the server to start.' } }, expanded: 'linear' },
    checkFailed: { data: { connectors: [LINEAR_KEYED], connectorTest: { ok: false, detail: 'Error: 401 Unauthorized (the key was rejected)' } }, expanded: 'linear' },
    googleReady: { data: { connectors: [GOOGLE_READY] }, expanded: 'google' },
    googleBrowser: { data: { connectors: [GOOGLE_READY] }, expanded: 'google' },
    googleFinishing: { data: { connectors: [GOOGLE_READY] }, expanded: 'google', override: { completeConnectorBrowserSignIn: () => new Promise<never>(() => undefined) } },
    googleDone: { data: { connectors: [GOOGLE_READY] }, expanded: 'google' },
    googleDenied: { data: { connectors: [GOOGLE_READY] }, expanded: 'google' },
    googleTimeout: { data: { connectors: [GOOGLE_READY] }, expanded: 'google' },
    googleExpired: {
        data: { connectors: [GOOGLE_READY], browserCompleteError: new GaiaApiError(404, "No sign-in is waiting with flow_id 'flow-1'. It finished, expired, or a newer sign-in replaced it.") },
        expanded: 'google',
    },
    googleStateMismatch: {
        data: { connectors: [GOOGLE_READY], browserCompleteError: new GaiaApiError(400, "The sign-in's state did not match, so the sign-in was ended. Connect again.") },
        expanded: 'google',
    },
    googleRefused: { data: { connectors: [GOOGLE_READY], browserSignInError: new GaiaApiError(403, 'Allow this device on the PC running GAIA first.') }, expanded: 'google' },
    googleFailed: {
        data: {
            connectors: [GOOGLE_READY],
            browserCompleteError: new GaiaApiError(500, "GAIA couldn't finish this on the PC. Open Settings › Connectors on the PC to see why."),
        },
        expanded: 'google',
    },
    googleSuperseded: { data: { connectors: [GOOGLE_READY], browserSuperseded: true }, expanded: 'google' },
    googleCancelled: { data: { connectors: [GOOGLE_READY] }, expanded: 'google' },
    keyStoreLocked: { data: { connectors: [heldBack('locked'), server({ id: 'slack', display_name: 'Slack' })], connectorsKeyStore: 'locked' } },
    keyStoreWaiting: { data: { connectors: [heldBack('waiting'), server({ id: 'slack', display_name: 'Slack' })], connectorsKeyStore: 'waiting' } },
    keyStoreHeldBack: { data: { connectors: [heldBack('locked')], connectorsKeyStore: 'locked' } },
};
const SHEET_SCENES: Partial<Record<ConnectorScene, string>> = { oauthSetup: 'google', oauthClient: 'google', mcpConfigure: 'mcp-slack' };

const GAIA = agent('gaia', 'GAIA', { consumes_mcp_servers: true });
const RESEARCH = agent('research', 'Research', { consumes_mcp_servers: true });
const TRIAGE = agent('triage', 'Issue triage', { required_connections: [{ connector_id: 'linear', scopes: ['read', 'write'], reason: 'Files and updates issues.' }] });

export function ConnectorsGallery({ state }: { state: ConnectorScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const listScene = LIST_SCENES[state];
    useState(() => {
        if (state === 'personalizeMcp') useConnectionStore.setState({ connection: { baseUrl: 'https://pc.local:4443', pcId: 'pc-1', pinned: true } });
    });
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
    const [deps] = useState(() => (state in GOOGLE_REDIRECTS ? galleryDeps(GOOGLE_REDIRECTS[state] ?? null, state === 'googleCancelled' ? CANCELLED : undefined) : null));
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <BrowserSignInDepsContext.Provider value={deps}>
                    <UIProvider>
                        <ScreenBannerProvider banner={null}>
                            <ConnectorsScreen
                                initialExpanded={listScene ? listScene.expanded : 'linear'}
                                initialJustConnected={state === 'personalize' ? 'gmail' : state === 'personalizeFailed' || state === 'personalizeMcp' ? 'linear' : undefined}
                                initialSheet={SHEET_SCENES[state]}
                                initialChecks={CHECKS[state] ? { linear: CHECKS[state] } : undefined}
                            />
                        </ScreenBannerProvider>
                    </UIProvider>
                </BrowserSignInDepsContext.Provider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
