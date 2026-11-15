// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
    ConsolidateMemoryResult,
    EmbeddingCoverage,
    MemorySettings,
    MemoryStats,
    RebuildEmbeddingsResult,
    ReconcileMemoryResult,
    RefreshSystemContextResult,
} from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { requireClient } from './queries';

/** Every memory query starts with `memoryKeys.all`, so one invalidation re-reads them all. */
export const memoryKeys = {
    all: ['memory'] as const,
    stats: ['memory', 'stats'] as const,
    settings: ['memory', 'settings'] as const,
    coverage: ['memory', 'coverage'] as const,
};

export function useMemoryStats() {
    const client = useGaiaClient();
    return useQuery<MemoryStats>({
        queryKey: memoryKeys.stats,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getMemoryStats({ signal }),
    });
}

/** Whether memory is on (`memory_enabled`), and the other two memory switches. */
export function useMemorySettings() {
    const client = useGaiaClient();
    return useQuery<MemorySettings>({
        queryKey: memoryKeys.settings,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getMemorySettings({ signal }),
    });
}

/** Turns a memory switch on or off: `mutate({ memory_enabled: false })`. */
export function useUpdateMemorySettings() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<MemorySettings, Error, Partial<MemorySettings>>({
        mutationFn: (settings) => requireClient(client).updateMemorySettings(settings),
        onSettled: () => queryClient.invalidateQueries({ queryKey: memoryKeys.all }),
    });
}

export function useEmbeddingCoverage() {
    const client = useGaiaClient();
    return useQuery<EmbeddingCoverage>({
        queryKey: memoryKeys.coverage,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getEmbeddingCoverage({ signal }),
    });
}

/** Re-reads every memory query; resolves when the ones on screen have answered. */
export function useRefreshMemory(): () => Promise<void> {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: memoryKeys.all });
}

export type MemoryMaintenanceAction = 'consolidate' | 'rebuildEmbeddings' | 'reconcile' | 'refreshSystemContext' | 'rebuildFts';

export type MemoryMaintenanceOutcome =
    | { action: 'consolidate'; result: ConsolidateMemoryResult }
    | { action: 'rebuildEmbeddings'; result: RebuildEmbeddingsResult }
    | { action: 'reconcile'; result: ReconcileMemoryResult }
    | { action: 'refreshSystemContext'; result: RefreshSystemContextResult }
    | { action: 'rebuildFts'; result: { status: string } };

/** Runs one maintenance POST: `mutate(action)`. It re-reads the memory queries afterwards, as the web does. */
export function useMemoryMaintenance() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<MemoryMaintenanceOutcome, Error, MemoryMaintenanceAction>({
        mutationFn: async (action) => {
            const c = requireClient(client);
            switch (action) {
                case 'consolidate':
                    return { action, result: await c.consolidateMemory() };
                case 'rebuildEmbeddings':
                    return { action, result: await c.rebuildEmbeddings() };
                case 'reconcile':
                    return { action, result: await c.reconcileMemory() };
                case 'refreshSystemContext':
                    return { action, result: await c.refreshSystemContext() };
                case 'rebuildFts':
                    return { action, result: await c.rebuildMemoryFts() };
            }
        },
        onSuccess: (outcome) =>
            queryClient.invalidateQueries({ queryKey: outcome.action === 'rebuildEmbeddings' ? memoryKeys.coverage : memoryKeys.all }),
    });
}
