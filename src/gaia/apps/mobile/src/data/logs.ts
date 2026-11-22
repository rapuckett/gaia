// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useRef } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { LogLineInfo, LogReadResponse, LogSourcesResponse } from '@/api/client.types';
import { LOG_FOLLOW_MS, LOG_GC_MS, LOG_KEEP_LINES } from '@/api/constants';

import { useGaiaClient } from './GaiaClientProvider';
import { failedWithoutData, requireClient } from './queries';

/** The log groups the viewer offers, in the desktop's order. */
export const LOG_SOURCES = ['model_server', 'gaia', 'service', 'agent', 'desktop', 'other'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

/** Marks a query whose data is log text, so nothing may write it to storage; the app persists no queries today. */
export const LOG_QUERY_META = { sensitive: true } as const;

export const logKeys = {
    sources: ['logs', 'sources'] as const,
    read: (source: string, file: string | null) => ['logs', 'read', source, file] as const,
};

/** What the viewer shows: the lines kept so far, and the PC's last answer about the log (its reason, file and so on). */
export interface LogState {
    lines: LogLineInfo[];
    cursor: string | null;
    read: LogReadResponse;
}

export const isProblem = (line: LogLineInfo) => line.severity === 'warning' || line.severity === 'error';

/** The next state after a read: a fresh read or a `reset` replaces the lines, a follow-up appends and keeps the newest `LOG_KEEP_LINES`. */
export function mergeLogRead(prev: LogState | undefined, res: LogReadResponse, fresh: boolean): LogState {
    const incoming = res.lines ?? [];
    const replace = fresh || !prev || !!res.reset;
    const lines = (replace ? incoming : [...prev.lines, ...incoming]).slice(-LOG_KEEP_LINES);
    // A follow-up read doesn't re-check the server, so keep what the fresh one found.
    const read: LogReadResponse = replace
        ? res
        : { ...res, server_answering: res.server_answering ?? prev.read.server_answering, dropped: prev.read.dropped };
    return { lines, cursor: res.cursor ?? (replace ? null : prev.cursor), read };
}

export function useLogSources(enabled = true) {
    const client = useGaiaClient();
    return useQuery<LogSourcesResponse>({
        queryKey: logKeys.sources,
        enabled: enabled && client !== null,
        gcTime: LOG_GC_MS,
        meta: LOG_QUERY_META,
        queryFn: ({ signal }) => requireClient(client).getLogSources({ signal }),
    });
}

/**
 * One log, read from the PC and followed with its cursor while `follow` and `active` hold.
 * `refresh()` reads it again from the top. The text stays only in memory, for `LOG_GC_MS` after the screen closes.
 */
export function useLogRead(source: LogSource, file: string | null, { follow, active }: { follow: boolean; active: boolean }) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const key = logKeys.read(source, file);
    const restart = useRef(false);
    const query = useQuery<LogState>({
        queryKey: key,
        enabled: active && client !== null,
        gcTime: LOG_GC_MS,
        staleTime: 0,
        retry: false,
        meta: LOG_QUERY_META,
        queryFn: async ({ signal }) => {
            const prev = queryClient.getQueryData<LogState>(key);
            const fresh = restart.current || !prev?.cursor;
            restart.current = false;
            const res = await requireClient(client).readLog(source, { file, after: fresh ? null : prev?.cursor }, { signal });
            return mergeLogRead(prev, res, fresh);
        },
        // Each poll would put a failed query with no data back to pending.
        refetchInterval: (q) => (follow && active && !failedWithoutData(q) ? LOG_FOLLOW_MS : false),
    });
    const { refetch } = query;
    const refresh = useCallback(() => {
        restart.current = true;
        return refetch();
    }, [refetch]);
    return { ...query, refresh };
}
