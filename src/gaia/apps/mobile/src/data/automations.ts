// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Automation, AutomationAction, AutomationList } from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { requireClient } from './queries';

export const automationKeys = {
    list: ['automations'] as const,
};

/** What GAIA runs on its own, read when Settings > Automations opens, as the desktop reads it. */
export function useAutomations() {
    const client = useGaiaClient();
    return useQuery<AutomationList>({
        queryKey: automationKeys.list,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listAutomations({ signal }),
    });
}

/** Pauses or resumes one: `mutate({ ref, action })`. The list is re-read either way, as the desktop does. */
export function useAutomationAction() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<Automation, Error, { ref: string; action: AutomationAction }>({
        mutationFn: ({ ref, action }) => requireClient(client).automationAction(ref, action),
        onSettled: () => queryClient.invalidateQueries({ queryKey: automationKeys.list }),
    });
}

/** Removes one: `mutate(ref)`. The list is re-read either way. */
export function useDeleteAutomation() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<Automation, Error, string>({
        mutationFn: (ref) => requireClient(client).deleteAutomation(ref),
        onSettled: () => queryClient.invalidateQueries({ queryKey: automationKeys.list }),
    });
}
