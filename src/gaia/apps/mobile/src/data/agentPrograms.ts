// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentDownload, AgentPrograms, FlagshipAgent, Settings } from '@/api/client.types';
import { AGENT_DOWNLOAD_POLL_MS, ENDPOINTS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { useDeviceRefused } from '@/api/routeAccess';

import { useGaiaClient } from './GaiaClientProvider';
import { requireClient } from './queries';

export const agentProgramKeys = {
    list: ['agentPrograms'] as const,
};

const NO_BYTES = { bytes_done: 0, bytes_total: null, error: null };

/** True on a paired phone the PC doesn't serve the listing to: nothing is asked, and the choice is made on the PC. */
export function useAgentProgramsRefused(): boolean {
    return useDeviceRefused('GET', ENDPOINTS.agentPrograms);
}

/** Both agent programs (gaiapy, gaiacpp): the one saved, whether each is on the PC, and any download running. */
export function useAgentPrograms() {
    const client = useGaiaClient();
    const refused = useAgentProgramsRefused();
    return useQuery<AgentPrograms>({
        queryKey: agentProgramKeys.list,
        enabled: client !== null && !refused,
        retry: false,
        queryFn: ({ signal }) => requireClient(client).getAgentPrograms({ signal }),
    });
}

/**
 * The gaiacpp download: `start` begins (or joins) it, `follow` takes over one already running. While it runs it is
 * read once a second; the PC answering `idle` mid-download means it restarted (`interrupted`). `onDone` is called once
 * when it finishes, saying whether `start` here began it. `failure` is the error of a start or read that failed.
 */
export function useAgentDownload(onDone: (startedHere: boolean) => void) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const [job, setJob] = useState<AgentDownload | null>(null);
    const [interrupted, setInterrupted] = useState(false);
    const [failure, setFailure] = useState<unknown>(null);
    const doneRef = useRef(onDone);
    useEffect(() => {
        doneRef.current = onDone;
    });
    const finished = useRef(false);
    const startedHere = useRef(false);

    const start = useCallback(async () => {
        finished.current = false;
        startedHere.current = true;
        setInterrupted(false);
        setFailure(null);
        setJob({ state: 'downloading', ...NO_BYTES });
        try {
            setJob(await requireClient(client).startAgentDownload());
        } catch (err) {
            setFailure(err);
            setJob({ state: 'failed', ...NO_BYTES });
        }
    }, [client]);

    const follow = useCallback((running: AgentDownload) => {
        if (running.state !== 'downloading') return;
        finished.current = false;
        startedHere.current = false;
        setInterrupted(false);
        setFailure(null);
        setJob(running);
    }, []);

    const state = job?.state;
    useEffect(() => {
        if (state !== 'downloading' || !client) return undefined;
        let live = true;
        const timer = setTimeout(() => {
            client.getAgentDownload().then(
                (next) => {
                    if (!live) return;
                    if (next.state === 'idle') {
                        setInterrupted(true);
                        setJob((j) => ({ ...(j ?? next), state: 'failed', error: null }));
                    } else setJob(next);
                },
                (err: unknown) => {
                    if (!live) return;
                    setFailure(err);
                    setJob((j) => ({ ...(j ?? NO_BYTES), state: 'failed', error: null }));
                },
            );
        }, AGENT_DOWNLOAD_POLL_MS);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [job, state, client]);

    useEffect(() => {
        if (state !== 'done' || finished.current) return;
        finished.current = true;
        void queryClient.invalidateQueries({ queryKey: agentProgramKeys.list });
        doneRef.current(startedHere.current);
    }, [state, queryClient]);

    return { job, start, follow, interrupted, failure };
}

/** A refusal (403), a busy agent (409) or a program not on the PC (422): the PC saved nothing. */
export function savedNothing(err: unknown): boolean {
    return err instanceof GaiaApiError && (err.status === 403 || err.status === 409 || err.status === 422);
}

/**
 * Saves the agent program: `mutate('gaiacpp')`. The listing shows the new one at once; when the PC saved nothing it
 * goes back to the one before, and after any other failure the listing is read again for what the PC holds.
 */
export function useSetFlagshipAgent() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const setCurrent = (current: string) =>
        queryClient.setQueryData<AgentPrograms>(agentProgramKeys.list, (l) => (l ? { ...l, current } : l));
    return useMutation<Settings, Error, FlagshipAgent, { previous: string | undefined }>({
        mutationFn: (id) => requireClient(client).updateSettings({ flagship_agent: id }),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: agentProgramKeys.list });
            const previous = queryClient.getQueryData<AgentPrograms>(agentProgramKeys.list)?.current;
            setCurrent(id);
            return { previous };
        },
        onSuccess: (saved) => setCurrent(saved.flagship_agent),
        onError: (err, _id, context) => {
            if (context?.previous !== undefined) setCurrent(context.previous);
            if (!savedNothing(err)) void queryClient.invalidateQueries({ queryKey: agentProgramKeys.list });
        },
    });
}
