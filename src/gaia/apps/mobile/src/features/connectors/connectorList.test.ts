// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { translator } from '@webui/i18n/translator';

import type { ConnectorListEntry, ConnectorRow, UnavailableConnectorRow } from '@/api/client.types';

import { groupConnectors, MCP_GUIDE_URL, setupPayload, setupProblem, tileStatus, unavailableHint } from './connectorList';

const t = translator('en');

function row(id: string, over: Partial<ConnectorRow> = {}): ConnectorRow {
    return {
        id,
        display_name: id,
        icon: null,
        category: 'x',
        tier: 'x',
        type: 'oauth_pkce',
        description: `${id} description`,
        product_url: null,
        docs_url: null,
        configured: false,
        configurable: true,
        config_error: null,
        enabled: true,
        account_id: null,
        scopes: [],
        activations: {},
        last_tested_at: null,
        mcp_env_keys: [],
        default_scopes: [],
        available_scopes: [],
        oauth_setup_fields: [],
        ...over,
    };
}

const broken = (id: string, over: Partial<UnavailableConnectorRow> = {}): UnavailableConnectorRow => ({
    id,
    display_name: id,
    error: 'unavailable',
    ...over,
});

describe('groupConnectors', () => {
    const all: ConnectorListEntry[] = [
        row('google', { configured: true, account_id: 'me@example.com' }),
        row('microsoft'),
        row('github', { type: 'mcp_server' }),
        broken('slack'),
    ];

    it('splits by state, kind and readability', () => {
        const g = groupConnectors(all, '', t);
        expect(g.connected.map((c) => c.id)).toEqual(['google']);
        expect(g.accounts.map((c) => c.id)).toEqual(['microsoft']);
        expect(g.servers.map((c) => c.id)).toEqual(['github']);
        expect(g.unavailable.map((c) => c.id)).toEqual(['slack']);
        expect(g.nothingConnected).toBe(false);
    });

    it('finds a mail account by a word its name never says', () => {
        expect(groupConnectors(all, 'inbox', t).accounts.map((c) => c.id)).toEqual(['microsoft']);
    });

    it('searches unavailable connectors by name only', () => {
        const g = groupConnectors(all, 'description', t);
        expect(g.unavailable).toEqual([]);
        expect(g.connected.length + g.accounts.length + g.servers.length).toBe(3);
    });
});

describe('tileStatus', () => {
    it('says what the tile header shows', () => {
        expect(tileStatus(row('a', { configured: true, account_id: 'x' }))).toEqual({ kind: 'connected', accountId: 'x' });
        expect(tileStatus(row('a', { configured: true, type: 'mcp_server', enabled: false }))).toEqual({ kind: 'paused' });
        expect(tileStatus(row('a', { configurable: false }))).toEqual({ kind: 'setupRequired' });
        expect(tileStatus(row('a'))).toEqual({ kind: 'none' });
    });
});

describe('unavailableHint', () => {
    it('names the settings file when that is what GAIA could not read', () => {
        const hint = unavailableHint([broken('a', { reason: 'activations_unreadable', path: '/home/x/activations.json' })], t);
        expect(hint).toContain('/home/x/activations.json');
        expect(unavailableHint([broken('a')], t)).toBe(t('settings.connectors.unavailableHint'));
    });
});

describe('setup validation', () => {
    const slack = row('mcp-slack', {
        type: 'mcp_server',
        mcp_env_keys: ['SLACK_MCP_XOXB_TOKEN'],
        config_fields: [{ key: 'SLACK_MCP_XOXB_TOKEN', label: 'Slack bot token', kind: 'secret', required: true, placeholder: '', help_md: '', prefix: 'xoxb-' }],
    });
    const google = row('google', {
        configurable: false,
        oauth_setup_fields: [
            { key: 'client_id', label: 'OAuth Client ID', kind: 'text', required: true, placeholder: '', help_md: '' },
            { key: 'client_secret', label: 'OAuth Client Secret', kind: 'secret', required: true, placeholder: '', help_md: '' },
        ],
    });

    it("refuses a key that doesn't start with the catalog's prefix, as the PC would", () => {
        expect(setupProblem(t, slack, 'mcp', { SLACK_MCP_XOXB_TOKEN: 'xoxp-user-token' })).toBe(
            'The Slack bot token should start with xoxb-. Copy it again from the setup steps.',
        );
        expect(setupProblem(t, slack, 'mcp', { SLACK_MCP_XOXB_TOKEN: '  xoxb-bot-token ' })).toBeNull();
    });

    it('names every missing field of a first-time setup, and sends the rest trimmed without starting a sign-in', () => {
        expect(setupProblem(t, google, 'oauthSetup', { client_id: ' ' })).toBe('Required: OAuth Client ID, OAuth Client Secret');
        expect(setupProblem(t, google, 'oauthClient', { client_secret: 'x' })).toBe('Client ID is required.');
        expect(setupPayload('oauthSetup', { client_id: ' id ', client_secret: 'secret', tenant_id: '' })).toEqual({ client_id: 'id', client_secret: 'secret', save_only: true });
    });
});

describe('MCP guide link', () => {
    it('points at a section the guide still has', () => {
        const { pathname, hash } = new URL(MCP_GUIDE_URL);
        const guide = readFileSync(resolve(__dirname, '../../../../../../../', `${pathname.slice(1)}.mdx`), 'utf-8');
        const slugs = [...guide.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]!.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        expect(slugs).toContain(hash.slice(1));
    });
});
