// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ActiveModel, PermissionMode, ProviderModelsResponse, SessionPermissions } from '@/api/client.types';
import { DOWNLOAD_POLL_MS } from '@/api/constants';

import { useGaiaClient } from './GaiaClientProvider';
import { modelKeys } from './models';
import { queryKeys, requireClient } from './queries';

export const modelMenuKeys = {
    active: ['activeModel'] as const,
    models: (provider: string) => ['providerModels', provider] as const,
    permissions: (sessionId: string) => ['permissions', sessionId] as const,
};

/** The model new messages use and whether it runs on this PC. */
export function useActiveModel() {
    const client = useGaiaClient();
    return useQuery<ActiveModel>({
        queryKey: modelMenuKeys.active,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getActiveModel({ signal }),
    });
}

/**
 * One provider's models; polled while `watching` so a download shows its progress.
 * A failure with no list yet stops the poll, so the error stays shown; reopening tries again.
 */
export function useProviderModels(provider: string | undefined, watching: boolean) {
    const client = useGaiaClient();
    return useQuery<ProviderModelsResponse>({
        queryKey: modelMenuKeys.models(provider ?? ''),
        enabled: client !== null && !!provider && watching,
        queryFn: ({ signal }) => requireClient(client).listProviderModels(provider!, { signal }),
        // Each poll would put a failed query with no data back to pending, showing "Loading" for good.
        refetchInterval: (query) =>
            watching && !(query.state.status === 'error' && query.state.data === undefined) ? DOWNLOAD_POLL_MS : false,
    });
}

/** Switches the model: `mutate(modelId)`. */
export function useSelectModel() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<ActiveModel, Error, string>({
        mutationFn: (model) => requireClient(client).selectModel(model),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: modelMenuKeys.active });
            void queryClient.invalidateQueries({ queryKey: modelKeys.local });
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        },
    });
}

/** Starts a model's download on the PC: `mutate(modelId)`. Its progress shows in the model list. */
export function useDownloadModel() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, string>({
        mutationFn: (modelId) => requireClient(client).downloadSetupModel(modelId, false),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['providerModels'] }),
    });
}

/** The chat's permission mode and a way to change it. */
export function usePermissionMode(sessionId: string | null) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const query = useQuery<SessionPermissions>({
        queryKey: modelMenuKeys.permissions(sessionId ?? ''),
        enabled: client !== null && !!sessionId,
        queryFn: ({ signal }) => requireClient(client).getPermissions(sessionId!, { signal }),
    });
    const set = useMutation<SessionPermissions, Error, PermissionMode>({
        mutationFn: (mode) => requireClient(client).setPermissionMode(sessionId!, mode),
        onSuccess: (saved) => queryClient.setQueryData(modelMenuKeys.permissions(sessionId!), saved),
    });
    return { mode: query.data?.mode, set };
}
