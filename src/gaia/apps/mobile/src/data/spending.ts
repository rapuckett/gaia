// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SpendingReport } from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { requireClient } from './queries';

export const spendingKeys = {
    all: ['spending'] as const,
};

/** This month's cloud spending at list price, the monthly limit and where it stands. */
export function useSpending() {
    const client = useGaiaClient();
    return useQuery<SpendingReport>({
        queryKey: spendingKeys.all,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getSpending({ signal }),
    });
}

/** `mutate(limitUsd)`; null removes the limit. */
export function useSetSpendingLimit() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<SpendingReport, Error, number | null>({
        mutationFn: (limitUsd) => requireClient(client).setSpendingLimit(limitUsd),
        onSuccess: (report) => queryClient.setQueryData(spendingKeys.all, report),
    });
}

/** Lets cloud chats go on past the limit until the month ends. */
export function useAllowSpendingMonth() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<SpendingReport, Error, void>({
        mutationFn: () => requireClient(client).allowSpendingThisMonth(),
        onSuccess: (report) => queryClient.setQueryData(spendingKeys.all, report),
    });
}
