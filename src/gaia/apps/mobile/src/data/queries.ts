// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQuery } from '@tanstack/react-query';

import type { MessageList, SessionList } from '@/api/client.types';
import { GaiaConfigError } from '@/api/errors';

import { useGaiaClient } from './GaiaClientProvider';

export const queryKeys = {
    sessions: ['sessions'] as const,
    messages: (sessionId: string) => ['messages', sessionId] as const,
};

export function useSessions() {
    const client = useGaiaClient();
    return useQuery<SessionList>({
        queryKey: queryKeys.sessions,
        enabled: client !== null,
        queryFn: ({ signal }) => {
            if (!client) throw new GaiaConfigError('mobileApp.error.noConnection');
            return client.listSessions({ signal });
        },
    });
}

export function useMessages(sessionId: string) {
    const client = useGaiaClient();
    return useQuery<MessageList>({
        queryKey: queryKeys.messages(sessionId),
        enabled: client !== null,
        queryFn: ({ signal }) => {
            if (!client) throw new GaiaConfigError('mobileApp.error.noConnection');
            return client.getMessages(sessionId, { signal });
        },
    });
}
