// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ltrIn } from '@webui/components/setup/format';
import { isMessageKey, isolate } from '@webui/i18n/registry';
import { tEn, translator, type Translate } from '@webui/i18n/translator';

import type { AgentMcpServer, ConnectorListEntry, DisconnectOutcome, ConnectorRow, UnavailableConnectorRow } from '@/api/client.types';

/** The search box appears once there are more connectors than this, as on the web. */
export const SEARCH_ABOVE = 6;

// Words people search by that a connector's name and description never say.
const MAIL_ACCOUNT_KEYWORDS = ['email', 'e-mail', 'inbox', 'calendar'];
const SEARCH_KEYWORDS: Record<string, string[]> = {
    google: MAIL_ACCOUNT_KEYWORDS,
    microsoft: MAIL_ACCOUNT_KEYWORDS,
    microsoft_work: MAIL_ACCOUNT_KEYWORDS,
};

export const GOOGLE_CONNECTOR_ID = 'google';

export type GroupId = 'unavailable' | 'connected' | 'accounts' | 'servers';

export interface ConnectorGroups {
    unavailable: UnavailableConnectorRow[];
    connected: ConnectorRow[];
    accounts: ConnectorRow[];
    servers: ConnectorRow[];
    /** Whether any account is set up; with none, the Accounts group starts open. */
    nothingConnected: boolean;
}

export function isUnavailable(c: ConnectorListEntry): c is UnavailableConnectorRow {
    return 'error' in c;
}

/** The catalog's text in the chosen language; a custom server's, or a reworded catalog's, shows as sent. */
function catalogText(t: Translate, key: string, server: string, bare = false): string {
    if (!isMessageKey(key) || tEn(key) !== server) return server;
    return bare ? t.bare(key) : t(key);
}

export function connectorDescription(t: Translate, c: ConnectorRow, bare = false): string {
    return catalogText(t, `connectors.${c.id}.description`, c.description, bare);
}

export type SetupField = ConnectorRow['oauth_setup_fields'][number];

export function fieldLabel(t: Translate, connectorId: string, field: SetupField, bare = false): string {
    return catalogText(t, `connectors.${connectorId}.${field.key}.label`, field.label, bare);
}

export function fieldHelp(t: Translate, connectorId: string, field: SetupField): string {
    return catalogText(t, `connectors.${connectorId}.${field.key}.help`, field.help_md);
}

/** The desktop's Agent UI guide section on MCP: adding tools to GAIA, and letting other tools use it. */
export const MCP_GUIDE_URL = 'https://amd-gaia.ai/docs/guides/agent-ui#extend-with-mcp';

/** `oauthSetup`: the OAuth client a connector needs before anyone can connect it. `oauthClient`: changing that client. `mcp`: a server's keys. */
export type SetupForm = 'oauthSetup' | 'oauthClient' | 'mcp';

/** Which setup sheet a connector opens; null for an account with no client to set and a server with no keys. */
export function setupForm(c: ConnectorRow): SetupForm | null {
    if (c.type === 'mcp_server') return (c.mcp_env_keys ?? []).length > 0 ? 'mcp' : null;
    if (!c.oauth_setup_fields?.length) return null;
    return c.configurable === false && !c.configured ? 'oauthSetup' : 'oauthClient';
}

/** The fields a setup sheet asks for; a server key the catalog doesn't describe goes by its own name. */
export function setupFields(c: ConnectorRow, form: SetupForm): SetupField[] {
    if (form !== 'mcp') return c.oauth_setup_fields ?? [];
    return (c.mcp_env_keys ?? []).map(
        (key) => c.config_fields?.find((f) => f.key === key) ?? { key, label: key, kind: 'secret', required: false, placeholder: '', help_md: '' },
    );
}

function filledValues(values: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(values)
            .map(([k, v]) => [k, v.trim()] as const)
            .filter(([, v]) => v !== ''),
    );
}

/** Whether Save can be pressed: a client needs its ID, and a server at least one key. First-time setup says what is missing instead. */
export function canSaveSetup(form: SetupForm, values: Record<string, string>): boolean {
    const filled = filledValues(values);
    if (form === 'oauthClient') return !!filled.client_id;
    if (form === 'mcp') return Object.keys(filled).length > 0;
    return true;
}

/** Why Save can't send these values, in the desktop's words, or null when they can go. */
export function setupProblem(t: Translate, c: ConnectorRow, form: SetupForm, values: Record<string, string>): string | null {
    const fields = setupFields(c, form);
    const filled = filledValues(values);
    if (form === 'oauthSetup') {
        const missing = fields.filter((f) => f.required !== false && !filled[f.key]);
        if (missing.length > 0) {
            return t.compose((say, code) => {
                const own = translator(code);
                const labels = missing.map((f) => fieldLabel(own, c.id, f, true));
                return say('settings.connectors.required', { fields: labels.join(say('settings.connectors.fieldsJoin')) });
            });
        }
    }
    if (form === 'oauthClient' && !filled.client_id) return t('settings.connectors.clientRequired');
    const wrong = fields.find((f) => f.prefix && f.key in filled && !filled[f.key]!.startsWith(f.prefix));
    if (wrong) {
        return t.compose((say, code) =>
            say('settings.connectors.wrongPrefix', {
                label: fieldLabel(translator(code), c.id, wrong, true),
                prefix: ltrIn(code, wrong.prefix ?? ''),
            }),
        );
    }
    return null;
}

/** What Save sends: the trimmed values typed. An OAuth client is saved without starting a sign-in, which only the PC can finish. */
export function setupPayload(form: SetupForm, values: Record<string, string>): Record<string, string | boolean> {
    const filled = filledValues(values);
    return form === 'mcp' ? filled : { ...filled, save_only: true };
}

function searchText(c: ConnectorListEntry, t: Translate): string[] {
    if (isUnavailable(c)) return [c.display_name];
    return [c.display_name, c.description, connectorDescription(t, c, true), ...(SEARCH_KEYWORDS[c.id] ?? [])];
}

export function groupConnectors(connectors: readonly ConnectorListEntry[], query: string, t: Translate): ConnectorGroups {
    const q = query.trim().toLowerCase();
    const shown = connectors.filter((c) => !q || searchText(c, t).some((s) => s.toLowerCase().includes(q)));
    const available = shown.filter((c): c is ConnectorRow => !isUnavailable(c));
    const connected = available.filter((c) => c.configured);
    const rest = available.filter((c) => !c.configured);
    return {
        unavailable: shown.filter(isUnavailable),
        connected,
        accounts: rest.filter((c) => c.type === 'oauth_pkce'),
        servers: rest.filter((c) => c.type !== 'oauth_pkce'),
        nothingConnected: !connectors.some((c) => !isUnavailable(c) && c.configured),
    };
}

/** The hint under "Unavailable": the unreadable settings file's path when that is the cause. */
export function unavailableHint(rows: readonly UnavailableConnectorRow[], t: Translate): string {
    const ledger = rows.find((c) => c.reason === 'activations_unreadable' && c.path);
    if (!ledger?.path) return t('settings.connectors.unavailableHint');
    return t('settings.connectors.activationsUnreadableHint', { path: isolate(ledger.path, 'ltr') });
}

export function agentMcpKey(s: AgentMcpServer): string {
    return `${s.agent_id}::${s.server_name}`;
}

export type TileStatus =
    | { kind: 'connected'; accountId: string | null }
    | { kind: 'paused' }
    | { kind: 'setupRequired' }
    | { kind: 'none' };

export function tileStatus(c: ConnectorRow): TileStatus {
    if (!c.configured) return c.configurable === false ? { kind: 'setupRequired' } : { kind: 'none' };
    if (c.type === 'mcp_server' && c.enabled === false) return { kind: 'paused' };
    return { kind: 'connected', accountId: c.account_id };
}

/** What a disconnect tells the person about the provider-side revoke, or null when nothing needs saying. */
export function disconnectNotice(outcome: DisconnectOutcome | null, connector: ConnectorRow, t: Translate): string | null {
    if (outcome === null) return connector.type === 'oauth_pkce' ? t('mobileApp.connectors.revokeUnreported') : null;
    if (!('revoke_supported' in outcome)) return null;
    if (outcome.revoke_supported) {
        return outcome.revoked_remotely
            ? null
            : t('settings.connectors.notRevoked', { reason: String(outcome.revoke_error ?? t('settings.advanced.unknown')) });
    }
    if (outcome.revoke_error) return t('settings.connectors.localOnly', { reason: String(outcome.revoke_error) });
    return t('settings.connectors.noRevokeApi');
}

/** The saved OAuth client's status line, as the desktop's OAuth client editor words it. */
export function oauthClientStatus(connector: ConnectorRow, t: Translate): string | null {
    const client = connector.oauth_client;
    if (!client) return null;
    const id = isolate(client.client_id ?? '', 'ltr');
    if (client.source === 'keyring') return t('settings.connectors.savedClient', { id });
    if (client.source === 'env') return t('settings.connectors.envClient', { id });
    return t('settings.connectors.noClient');
}
