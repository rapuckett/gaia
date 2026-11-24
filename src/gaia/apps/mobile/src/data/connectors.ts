// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
    AgentList,
    AgentMcpList,
    ConnectorActivations,
    ConnectorDeviceAuthResponse,
    ConnectorGrants,
    ConnectorList,
    ConnectorRow,
    ConnectorSignInTarget,
    DisconnectOutcome,
    GaiaClient,
} from '@/api/client.types';
import { CONNECTOR_KEY_STORE_POLL_MS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { beginDevicePrompt, reportDevicePromptError, settleDevicePrompt } from '@/features/devices/devicePrompts';

import { useGaiaClient } from './GaiaClientProvider';
import { queryKeys, requireClient } from './queries';

/**
 * Every connector this PC knows, including those whose live state GAIA couldn't read. With `pollWhileWaiting`
 * (the Connectors screen while it is focused), re-read while the PC's key store prompt is open; the poll also
 * stops while the app is in the background (focusManager follows AppState).
 */
export function useConnectors(pollWhileWaiting = false) {
    const client = useGaiaClient();
    return useQuery<ConnectorList>({
        queryKey: queryKeys.connectors,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listConnectors({ signal }),
        refetchInterval: (query) => (pollWhileWaiting && query.state.data?.key_store === 'waiting' ? CONNECTOR_KEY_STORE_POLL_MS : false),
    });
}

/** MCP servers that custom agents declare themselves (read-only). */
export function useAgentMcps() {
    const client = useGaiaClient();
    return useQuery<AgentMcpList>({
        queryKey: queryKeys.agentMcps,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listAgentMcps({ signal }),
    });
}

/** The agents on this PC; each connector's grants name them by `namespaced_agent_id`. */
export function useAgents() {
    const client = useGaiaClient();
    return useQuery<AgentList>({
        queryKey: queryKeys.agents,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listAgents({ signal }),
    });
}

/** Which scopes each agent holds on one connector; `enabled` waits for its tile to open. */
export function useConnectorGrants(connectorId: string, enabled: boolean) {
    const client = useGaiaClient();
    return useQuery<ConnectorGrants>({
        queryKey: queryKeys.connectorGrants(connectorId),
        enabled: enabled && client !== null,
        queryFn: ({ signal }) => requireClient(client).listConnectorGrants(connectorId, { signal }),
    });
}

/** Which agents may use one MCP server's tools. */
export function useConnectorActivations(connectorId: string, enabled: boolean) {
    const client = useGaiaClient();
    return useQuery<ConnectorActivations>({
        queryKey: queryKeys.connectorActivations(connectorId),
        enabled: enabled && client !== null,
        queryFn: ({ signal }) => requireClient(client).listConnectorActivations(connectorId, { signal }),
    });
}

export type ConnectorAccessChange =
    | { kind: 'grant'; agentId: string; scopes: string[] }
    | { kind: 'activate'; agentId: string; scopes?: string[] }
    | { kind: 'deactivate'; agentId: string };

function applyChange(client: GaiaClient, connectorId: string, change: ConnectorAccessChange): Promise<void> {
    switch (change.kind) {
        case 'grant':
            return change.scopes.length === 0
                ? client.revokeConnectorAgentGrant(connectorId, change.agentId)
                : client.grantConnectorAgent(connectorId, change.agentId, change.scopes);
        case 'activate':
            return client.activateConnectorAgent(connectorId, change.agentId, change.scopes);
        case 'deactivate':
            return client.deactivateConnectorAgent(connectorId, change.agentId);
    }
}

/** Changes what an agent may do with one connector, then reloads that connector's grants and activations. */
export function useChangeConnectorAccess(connectorId: string) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<void, Error, ConnectorAccessChange>({
        mutationFn: (change) => applyChange(requireClient(client), connectorId, change),
        onSettled: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.connectorGrants(connectorId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.connectorActivations(connectorId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.connectors }),
            ]),
    });
}

/**
 * Pauses an MCP server, or removes its credentials (resolving with the revoke outcome), then reloads the connector list.
 * `disconnectAll` removes every account of a connector that has several, which a plain `disconnect` is refused for (409).
 */
export function useConnectorServerAction(connectorId: string, onDisconnected?: (outcome: DisconnectOutcome | null) => void) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<DisconnectOutcome | null | undefined, Error, 'disable' | 'disconnect' | 'disconnectAll'>({
        mutationFn: (action) => {
            const c = requireClient(client);
            if (action === 'disable') return c.disableConnector(connectorId).then(() => undefined);
            return c.disconnectConnector(connectorId, action === 'disconnectAll' ? { all: true } : undefined);
        },
        // Runs even after the tile moved to another group and remounted.
        onSuccess: (outcome, action) => {
            if (action !== 'disable') onDisconnected?.(outcome ?? null);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.connectors }),
    });
}

export type ConnectorAccountChange = { kind: 'default' | 'disconnect'; accountId: string };

/** Makes one account the default, or signs out of just that one, then reloads the connector list. */
export function useChangeConnectorAccount(connectorId: string) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<void, Error, ConnectorAccountChange>({
        mutationFn: async ({ kind, accountId }) => {
            const c = requireClient(client);
            if (kind === 'default') await c.setDefaultConnectorAccount(connectorId, accountId);
            else await c.disconnectConnectorAccount(connectorId, accountId);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.connectors }),
    });
}

/**
 * Sends a connector's setup to the PC (an OAuth client, or an MCP server's keys), then re-reads the list.
 * Not a react-query mutation: its variables are secrets, and the mutation cache would keep them.
 */
export function useConfigureConnector() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useCallback(
        async (connectorId: string, config: Record<string, string | boolean>) => {
            const result = await requireClient(client).configureConnector(connectorId, config);
            await queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
            return result;
        },
        [client, queryClient],
    );
}

/** The `device_prompt` action a connector's Check raises on the PC. */
export const CHECK_PROMPT_ACTION = 'connectorTest';

export type ConnectorCheck =
    | { state: 'checking' }
    | { state: 'ok' }
    | { state: 'failed'; detail: string; slow: boolean }
    | { state: 'error'; error: Error }
    /** The PC's key-store prompt for this check is what the screen shows: `ApproveOnPcNotice` follows how it ends. */
    | { state: 'prompt' }
    /** The PC's key store is locked (a 423) with no prompt of this check's up; `detail` is the PC's own words. */
    | { state: 'locked'; detail?: string };

/**
 * Each MCP server's latest Check, held above the tiles so a tile that moves to another group keeps it.
 * A newer check, or a clear, wins over one still running.
 */
export function useConnectorChecks(initial: Record<string, ConnectorCheck> = {}) {
    const client = useGaiaClient();
    const [checks, setChecks] = useState<Record<string, ConnectorCheck | undefined>>(initial);
    const runs = useRef<Record<string, number>>({});

    const clear = useCallback((id: string) => {
        runs.current[id] = (runs.current[id] ?? 0) + 1;
        setChecks((prev) => ({ ...prev, [id]: undefined }));
    }, []);

    const run = useCallback(
        async (id: string) => {
            const mine = (runs.current[id] ?? 0) + 1;
            runs.current[id] = mine;
            setChecks((prev) => ({ ...prev, [id]: { state: 'checking' } }));
            beginDevicePrompt('keyStore', CHECK_PROMPT_ACTION);
            let next: ConnectorCheck;
            try {
                // Held open while the PC's key-store prompt waits (the PC answers 504 after 5 minutes), so no header timeout.
                const result = await requireClient(client).testConnector(id);
                settleDevicePrompt('keyStore', CHECK_PROMPT_ACTION);
                next = result.ok ? { state: 'ok' } : { state: 'failed', detail: result.detail, slow: result.reason === 'timeout' };
            } catch (error) {
                next = reportDevicePromptError('keyStore', CHECK_PROMPT_ACTION, error)
                    ? { state: 'prompt' }
                    : error instanceof GaiaApiError && error.status === 423
                      ? { state: 'locked', detail: error.detail || undefined }
                      : { state: 'error', error: error instanceof Error ? error : new Error(String(error)) };
            }
            if (runs.current[id] === mine) setChecks((prev) => ({ ...prev, [id]: next }));
        },
        [client],
    );

    return { checks, run, clear };
}

export type DeviceSignIn =
    | { state: 'idle' }
    | { state: 'starting' }
    | { state: 'waiting'; code: ConnectorDeviceAuthResponse; expiresAt: number; wasConnected: boolean }
    | { state: 'done' }
    | { state: 'expired' }
    | { state: 'ended'; why: 'cancelled' | 'failed'; error?: string }
    | { state: 'failed'; error: Error };

/** What a sign-in with a code asks for when its caller names nothing: everything the connector offers. */
export function deviceSignInScopes(connector: ConnectorRow): string[] {
    return connector.available_scopes?.length ? connector.available_scopes : (connector.default_scopes ?? []);
}

/**
 * A sign-in with a code, started on the PC: the PC polls the provider and keeps the account. The
 * phone follows the PC's sign-in events, and re-reads the connector list at the interval the PC
 * gave, until it shows connected. `scopes` defaults to everything the connector offers.
 */
export function useDeviceSignIn(connector: ConnectorRow, scopes: string[] = deviceSignInScopes(connector)) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const [signIn, setSignIn] = useState<DeviceSignIn>({ state: 'idle' });
    const scopeKey = scopes.join(' ');
    const configured = connector.configured;

    const startFor = useCallback((target?: ConnectorSignInTarget) => {
        setSignIn({ state: 'starting' });
        let c: GaiaClient;
        try {
            c = requireClient(client);
        } catch (error) {
            setSignIn({ state: 'failed', error: error as Error });
            return;
        }
        c.startConnectorDeviceSignIn(connector.id, scopeKey ? scopeKey.split(' ') : [], ...(target ? [{ target }] : [])).then(
            (code) => setSignIn({ state: 'waiting', code, expiresAt: Date.now() + code.expires_in * 1000, wasConnected: configured === true }),
            (error: Error) => setSignIn({ state: 'failed', error }),
        );
    }, [client, connector.id, scopeKey, configured]);

    // Never forwards a press event as a target.
    const start = useCallback(() => startFor(), [startFor]);

    // Signing in again leaves the row connected throughout, so only the PC's event says it finished.
    const connected = signIn.state === 'waiting' && !signIn.wasConnected && configured;
    const waiting = signIn.state === 'waiting' && !connected;
    useEffect(() => {
        if (signIn.state !== 'waiting' || connected) return;
        const timer = setInterval(() => {
            if (Date.now() >= signIn.expiresAt) setSignIn({ state: 'expired' });
            else void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
        }, Math.max(1, signIn.code.interval) * 1000);
        return () => clearInterval(timer);
    }, [signIn, connected, queryClient]);

    useEffect(() => {
        if (!waiting || !client) return;
        const watch = new AbortController();
        client.watchConnectorSignIn(connector.id, { signal: watch.signal }).then((end) => {
            if (!end || watch.signal.aborted) return;
            void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
            setSignIn(end.outcome === 'completed' ? { state: 'done' } : { state: 'ended', why: end.outcome, error: end.error });
        }, () => undefined);
        return () => watch.abort();
    }, [waiting, client, connector.id, queryClient]);

    // As the desktop's Cancel: drops the code on the phone; the PC's poll just runs out.
    const cancel = useCallback(() => setSignIn({ state: 'idle' }), []);

    return { signIn: connected ? ({ state: 'done' } as const) : signIn, start, startFor, cancel };
}
