// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { AgentInfo, ConnectorRow } from '@/api/client.types';

import { activatableAgents, cardSignInScopes, nextScopes, scopesForActivation, soleMcpAgent } from './connectorAccess';

const server = { id: 'mcp-slack', type: 'mcp_server' } as ConnectorRow;
const gaia = { id: 'gaia', name: 'GAIA', namespaced_agent_id: 'builtin:gaia', consumes_mcp_servers: true } as AgentInfo;
const email = {
    id: 'email',
    name: 'Email',
    namespaced_agent_id: 'installed:email',
    required_connections: [{ connector_id: 'mcp-slack', scopes: ['read'], reason: '' }],
} as AgentInfo;

describe('connector access', () => {
    it('gives GAIA one switch when it is the only agent that can use the server', () => {
        expect(soleMcpAgent([gaia], server)?.namespaced_agent_id).toBe('builtin:gaia');
        expect(soleMcpAgent([gaia, email], server)).toBeNull();
        expect(activatableAgents([gaia, email], server)).toHaveLength(2);
    });

    it('creates a grant on activation only when the agent holds none, with its own scopes first', () => {
        expect(scopesForActivation(gaia, 'mcp-slack', [])).toEqual(['use']);
        expect(scopesForActivation(email, 'mcp-slack', [])).toEqual(['read']);
        expect(scopesForActivation(email, 'mcp-slack', ['read'])).toBeUndefined();
    });

    it('turning the last scope off leaves none, which revokes the grant', () => {
        expect(nextScopes(['a', 'b'], 'a', false)).toEqual(['b']);
        expect(nextScopes(['a'], 'a', false)).toEqual([]);
        expect(nextScopes(['a'], 'b', true)).toEqual(['a', 'b']);
    });

    it('asks a card sign-in for what the call needs, what the account holds, and the identity scopes', () => {
        const microsoft = {
            id: 'microsoft',
            scopes: ['openid', 'Calendars.Read'],
            default_scopes: ['openid', 'offline_access'],
            available_scopes: ['openid', 'offline_access', 'Mail.Read', 'Mail.Send', 'Calendars.Read'],
        } as ConnectorRow;
        expect(cardSignInScopes(['Mail.Read'], microsoft).sort()).toEqual(['Calendars.Read', 'Mail.Read', 'offline_access', 'openid']);
        expect(cardSignInScopes(undefined, microsoft)).toEqual(microsoft.available_scopes);
    });
});
