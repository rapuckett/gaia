// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { StartScreen } from '@webui/types';

import type { GaiaClient, MessageList, Session, SessionList, SystemStatus } from '@/api/client.types';
import { STATUS_POLL_MS } from '@/api/constants';
import { GaiaConfigError } from '@/api/errors';

import { useGaiaClient } from './GaiaClientProvider';

export const queryKeys = {
    sessions: ['sessions'] as const,
    session: (sessionId: string) => ['session', sessionId] as const,
    messages: (sessionId: string) => ['messages', sessionId] as const,
    systemStatus: ['systemStatus'] as const,
    startScreen: ['startScreen'] as const,
};

export function requireClient(client: GaiaClient | null): GaiaClient {
    if (!client) throw new GaiaConfigError('mobileApp.error.noConnection');
    return client;
}

/**
 * Reads the chat list, but never swaps a populated list for an empty reply: the PC can answer
 * empty while it restarts. The rule of webui's chat-list poll in App.tsx.
 */
export async function fetchSessions(
    client: GaiaClient | null,
    queryClient: QueryClient,
    signal?: AbortSignal,
): Promise<SessionList> {
    const list = await requireClient(client).listSessions({ signal });
    const shown = queryClient.getQueryData<SessionList>(queryKeys.sessions);
    if (list.sessions.length === 0 && shown && shown.sessions.length > 0) return shown;
    return list;
}

export function useSessions() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useQuery<SessionList>({
        queryKey: queryKeys.sessions,
        enabled: client !== null,
        queryFn: ({ signal }) => fetchSessions(client, queryClient, signal),
    });
}

export function useSession(sessionId: string) {
    const client = useGaiaClient();
    return useQuery<Session>({
        queryKey: queryKeys.session(sessionId),
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getSession(sessionId, { signal }),
    });
}

export function useMessages(sessionId: string) {
    const client = useGaiaClient();
    return useQuery<MessageList>({
        queryKey: queryKeys.messages(sessionId),
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getMessages(sessionId, { signal }),
    });
}

/**
 * GAIA is still running its start-up tasks; hold sending until they finish.
 * The rule of webui's `isStarting` (services/statusPoll.ts), which this app can't import.
 */
export function isStarting(status: SystemStatus | null | undefined): boolean {
    if (status?.init_state !== 'initializing') return false;
    if (!status.init_tasks) return true;
    return status.init_tasks.some((t) => t.status === 'pending' || t.status === 'running');
}

/** The model is loading a new chat's prompt; sending still works and waits for it on the PC. */
export function isWarmingUp(status: SystemStatus | null | undefined): boolean {
    return status?.warm_up?.state === 'warming';
}

/**
 * What the PC runs and whether it's ready: `default_model_name` is this PC's
 * model, `model_loaded` the one in memory. Re-read while it is starting or
 * warming up, so a screen waiting on it moves on by itself.
 */
export function useSystemStatus() {
    const client = useGaiaClient();
    return useQuery<SystemStatus>({
        queryKey: queryKeys.systemStatus,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getSystemStatus({ signal }),
        refetchInterval: (query) =>
            isStarting(query.state.data) || isWarmingUp(query.state.data) ? STATUS_POLL_MS : false,
    });
}

/** The new-chat screen's cards and working folder; refetch it to ask again while the assistant is down. */
export function useStartScreen() {
    const client = useGaiaClient();
    return useQuery<StartScreen>({
        queryKey: queryKeys.startScreen,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getStartScreen({ signal }),
    });
}
