// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CloudPriceList, ContextChoice, ProviderId, ProviderSummary, ProviderSummaryList } from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { modelKeys } from './models';
import { requireClient } from './queries';

export const providerKeys = {
    // Shared with setup's useCloudProviders, so a Local-only change refreshes both.
    all: ['cloudProviders'] as const,
    context: (model: string) => ['contextChoice', model] as const,
    prices: (provider: string) => ['cloudPrices', provider] as const,
};

export interface ProviderRow extends Omit<ProviderSummary, 'id'> {
    id: ProviderId;
}

/** The PC's provider list as rows; an id this app has no row for is left out. */
export function providerRows(list: ProviderSummaryList): { providers: ProviderRow[]; lemonadeError: string | null } {
    const known: readonly string[] = ['local', 'fireworks', 'amd'];
    const providers = list.providers.filter((p): p is ProviderRow => known.includes(p.id));
    return { providers, lemonadeError: list.lemonade_error ?? null };
}

/** Every provider with whether it is set up and whether Local only holds it off. */
export function useProviders() {
    const client = useGaiaClient();
    return useQuery({
        queryKey: providerKeys.all,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listProviderSummaries({ signal }),
        select: providerRows,
    });
}

export function useContextChoice(model: string, enabled: boolean) {
    const client = useGaiaClient();
    return useQuery<ContextChoice>({
        queryKey: providerKeys.context(model),
        enabled: client !== null && enabled,
        queryFn: ({ signal }) => requireClient(client).getContextChoice(model, { signal }),
    });
}

/** `mutate({ model, ctxSize })`; a null size returns the model to Automatic. */
export function useSetContextChoice() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<ContextChoice, Error, { model: string; ctxSize: number | null }>({
        mutationFn: ({ model, ctxSize }) => requireClient(client).setContextChoice(model, ctxSize),
        onSuccess: (choice, { model }) => {
            queryClient.setQueryData(providerKeys.context(model), choice);
            void queryClient.invalidateQueries({ queryKey: modelKeys.local });
        },
    });
}

export function useCloudPrices(provider: string, enabled: boolean) {
    const client = useGaiaClient();
    return useQuery<CloudPriceList>({
        queryKey: providerKeys.prices(provider),
        enabled: client !== null && enabled,
        queryFn: ({ signal }) => requireClient(client).getCloudPrices(provider, { signal }),
    });
}
