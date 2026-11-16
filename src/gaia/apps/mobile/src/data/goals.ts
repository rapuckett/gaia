// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateGoalBody, Goal, GoalStats } from '@/api/client.types';
import { GOAL_HEALTH_POLL_MS } from '@/api/constants';

import { useGaiaClient } from './GaiaClientProvider';
import { failedWithoutData, requireClient } from './queries';

/** Under `memory`, so the screen's pull-to-refresh re-reads goals too. */
export const goalKeys = {
    all: ['memory', 'goals'] as const,
    list: ['memory', 'goals', 'list'] as const,
    stats: ['memory', 'goals', 'stats'] as const,
    health: ['memory', 'goals', 'health'] as const,
};

/** Every goal with its tasks, as the web's Goals tab reads them. */
export function useGoals() {
    const client = useGaiaClient();
    return useQuery<Goal[]>({
        queryKey: goalKeys.list,
        enabled: client !== null,
        queryFn: async ({ signal }) => (await requireClient(client).listGoals({ signal })).goals,
    });
}

export function useGoalStats() {
    const client = useGaiaClient();
    return useQuery<GoalStats>({
        queryKey: goalKeys.stats,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getGoalStats({ signal }),
    });
}

/** Whether the goal list is unreadable (`error`) and whether only a new list fixes it (`damaged`). Re-read every 30 s, as the web does. */
export function useGoalStoreHealth() {
    const client = useGaiaClient();
    return useQuery<{ error: string | null; damaged: boolean }>({
        queryKey: goalKeys.health,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getGoalStoreHealth({ signal }),
        refetchInterval: (query) => (failedWithoutData(query) ? false : GOAL_HEALTH_POLL_MS),
    });
}

/** Why approved goals can't run (the goal list is unreadable), or null. */
export function useGoalStoreError() {
    const { data, ...rest } = useGoalStoreHealth();
    return { ...rest, data: data === undefined ? undefined : data.error };
}

/** Moves a damaged goal list aside and starts a new one; re-reads the goals and the health after, as the web does. */
export function useResetGoalStore() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<{ kept: string }, Error, void>({
        mutationFn: () => requireClient(client).resetGoalStore(),
        onSettled: () => queryClient.invalidateQueries({ queryKey: goalKeys.all }),
    });
}

export type GoalAction = 'approve' | 'reject' | 'cancel' | 'delete';

/** One action on a goal: `mutate({ id, action })`; re-reads the goals and their counts after. */
export function useGoalAction() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { id: string; action: GoalAction }>({
        mutationFn: ({ id, action }) => {
            const c = requireClient(client);
            switch (action) {
                case 'approve':
                    return c.approveGoal(id);
                case 'reject':
                    return c.rejectGoal(id);
                case 'cancel':
                    return c.cancelGoal(id);
                case 'delete':
                    return c.deleteGoal(id);
            }
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: goalKeys.all }),
    });
}

export function useCreateGoal() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<Goal, Error, CreateGoalBody>({
        mutationFn: (body) => requireClient(client).createGoal(body),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: goalKeys.all }),
    });
}
