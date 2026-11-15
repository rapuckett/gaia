// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
    ActiveModel,
    CloudPriceList,
    ContextChoice,
    ProviderModelsResponse,
    ProvidersResponse,
} from '@/api/client.types';
import { forgetModelChecks } from '@/state/modelNeeded';

import { useGaiaClient } from './GaiaClientProvider';
import { modelKeys } from './models';
import { queryKeys, requireClient } from './queries';

export const providerKeys = {
    all: ['providers'] as const,
    active: ['activeModel'] as const,
    models: (provider: string) => ['providerModels', provider] as const,
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

/** The model new messages use. */
export function useActiveModel() {
    const client = useGaiaClient();
    return useQuery<ActiveModel>({
        queryKey: providerKeys.active,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getActiveModel({ signal }),
    });
}

export function useProviderModels(provider: string, enabled: boolean) {
    const client = useGaiaClient();
    return useQuery<ProviderModelsResponse>({
        queryKey: providerKeys.models(provider),
        enabled: client !== null && enabled,
        queryFn: ({ signal }) => requireClient(client).listProviderModels(provider, { signal }),
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

/** Switches the model new messages use; the PC starts loading a local pick in the background. */
export function useSelectModel() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<ActiveModel, Error, string>({
        mutationFn: (model) => requireClient(client).selectModel(model),
        onSuccess: (active) => {
            forgetModelChecks();
            queryClient.setQueryData(providerKeys.active, active);
            void queryClient.invalidateQueries({ queryKey: providerKeys.all });
            void queryClient.invalidateQueries({ queryKey: ['providerModels'] });
            void queryClient.invalidateQueries({ queryKey: modelKeys.local });
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        },
    });
}
