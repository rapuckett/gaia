// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CloudPriceList, ContextChoice, ProvidersResponse } from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { modelKeys } from './models';
import { requireClient } from './queries';

export const providerKeys = {
    all: ['providers'] as const,
    context: (model: string) => ['contextChoice', model] as const,
    prices: (provider: string) => ['cloudPrices', provider] as const,
};

/** Every provider with its connection, network and Local-only state. */
export function useProviders() {
    const client = useGaiaClient();
    return useQuery<ProvidersResponse>({
        queryKey: providerKeys.all,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listProviders({ signal }),
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
