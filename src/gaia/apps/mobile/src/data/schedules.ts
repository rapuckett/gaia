// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { DeleteScheduleResult, Schedule, ScheduleList } from '@/api/client.types';
import { SCHEDULES_POLL_MS } from '@/api/constants';

import { useGaiaClient } from './GaiaClientProvider';
import { requireClient } from './queries';

export const scheduleKeys = {
    list: ['schedules'] as const,
};

/** The PC's scheduled tasks, re-read while the screen is open so run counts and times follow the PC. */
export function useSchedules() {
    const client = useGaiaClient();
    return useQuery<ScheduleList>({
        queryKey: scheduleKeys.list,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listSchedules({ signal }),
        refetchInterval: SCHEDULES_POLL_MS,
    });
}

function replaceSchedule(queryClient: QueryClient, updated: Schedule): void {
    queryClient.setQueryData<ScheduleList>(scheduleKeys.list, (list) =>
        list && { ...list, schedules: list.schedules.map((s) => (s.name === updated.name ? updated : s)) },
    );
}

/** Pauses or resumes a schedule: `mutate({ name, status })`. */
export function useUpdateScheduleStatus() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<Schedule, Error, { name: string; status: 'active' | 'paused' }>({
        mutationFn: ({ name, status }) => requireClient(client).updateScheduleStatus(name, status),
        onSuccess: (updated) => replaceSchedule(queryClient, updated),
    });
}

/** Runs a schedule once now: `mutate(name)`. Rejects with a 409 `GaiaApiError` while a run is in flight. */
export function useRunSchedule() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<Schedule, Error, string>({
        mutationFn: (name) => requireClient(client).runSchedule(name),
        onSuccess: (updated) => replaceSchedule(queryClient, updated),
    });
}

/** Deletes a schedule: `mutate(name)`. */
export function useDeleteSchedule() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<DeleteScheduleResult, Error, string>({
        mutationFn: (name) => requireClient(client).deleteSchedule(name),
        onSuccess: (_result, name) =>
            queryClient.setQueryData<ScheduleList>(scheduleKeys.list, (list) =>
                list && { ...list, schedules: list.schedules.filter((s) => s.name !== name), total: list.total - 1 },
            ),
    });
}
