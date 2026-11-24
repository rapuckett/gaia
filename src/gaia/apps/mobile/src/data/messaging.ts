// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { DiscordConnectResult, DiscordStatus } from '@/api/client.types';
import { DISCORD_LIVE_STATES, DISCORD_POLL_MS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';

import { useGaiaClient } from './GaiaClientProvider';
import { secretFreeError } from './providers';
import { requireClient } from './queries';

export const messagingKeys = {
    discord: ['messaging', 'discord'] as const,
};

/** The PC's Discord bridge, re-read while it can change by itself. A 403 (the PC answers only itself) is final, never retried. */
export function useDiscordStatus(enabled = true) {
    const client = useGaiaClient();
    return useQuery<DiscordStatus>({
        queryKey: messagingKeys.discord,
        enabled: client !== null && enabled,
        queryFn: ({ signal }) => requireClient(client).getDiscordStatus({ signal }),
        retry: (failures, error) => !(error instanceof GaiaApiError && error.status === 403) && failures < 3,
        refetchInterval: (query) => (query.state.data && DISCORD_LIVE_STATES.has(query.state.data.state) ? DISCORD_POLL_MS : false),
    });
}

/** The Settings > Messaging buttons; each answers with the bridge's new status. */
export type DiscordAction = 'start' | 'takeOver' | 'stop' | 'restart' | 'forgetAlways' | 'pair' | 'disconnect';

/** `mutate(action)`: one of the bridge's buttons; the status it answers replaces the cached one. */
export function useDiscordAction() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<DiscordStatus, Error, DiscordAction>({
        mutationFn: (action) => {
            const api = requireClient(client);
            switch (action) {
                case 'start':
                    return api.startDiscord(false);
                case 'takeOver':
                    return api.startDiscord(true);
                case 'stop':
                    return api.stopDiscord();
                case 'restart':
                    return api.restartDiscord();
                case 'forgetAlways':
                    return api.forgetDiscordAlways();
                case 'pair':
                    return api.pairDiscord();
                case 'disconnect':
                    return api.disconnectDiscord();
            }
        },
        onSuccess: (status) => queryClient.setQueryData(messagingKeys.discord, status),
        onError: () => void queryClient.invalidateQueries({ queryKey: messagingKeys.discord }),
    });
}

/**
 * Sends a bot token typed on this phone to the PC. Not a mutation, so the token is never a mutation
 * variable or cache entry; nothing it returns or throws carries it.
 */
export function useConnectDiscord() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const [isPending, setPending] = useState(false);
    const connect = async (token: string): Promise<DiscordConnectResult> => {
        const api = requireClient(client);
        setPending(true);
        try {
            const result = await api.connectDiscord(token);
            queryClient.setQueryData(messagingKeys.discord, result.status);
            return result;
        } catch (err) {
            // A failed connect may have stopped the bridge to change the token.
            void queryClient.invalidateQueries({ queryKey: messagingKeys.discord });
            throw secretFreeError(err, token);
        } finally {
            setPending(false);
        }
    };
    return { connect, isPending };
}
