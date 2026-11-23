// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentPrograms, FlagshipAgent } from '@/api/client.types';
import { agentProgramKeys, requireClient, useAgentDownload, useAgentPrograms, useGaiaClient, useSetFlagshipAgent } from '@/data';

import { useAgentPick } from './agentPick';

type Run = () => void;

/**
 * Setup's agent pick on Continue: the run is held while a gaiacpp not on the PC downloads, then the pick is saved and
 * the run starts. Carry on starts it on the agent in use; Cancel lets go of the run (a download goes on by itself).
 */
export function useAgentFirst() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const { pick, setPick } = useAgentPick();
    const save = useSetFlagshipAgent();
    const [held, setHeld] = useState<Run | null>(null);
    const [error, setError] = useState<unknown>(null);
    const pickRef = useRef(pick);
    const heldRef = useRef(held);
    useEffect(() => {
        pickRef.current = pick;
        heldRef.current = held;
    });

    const { mutateAsync } = save;
    const runAfter = useCallback(async (run: Run, id: FlagshipAgent | null) => {
        setError(null);
        if (id) {
            try {
                await mutateAsync(id);
            } catch (err) {
                setError(err);
                return;
            }
        }
        setPick(null);
        setHeld(null);
        run();
    }, [mutateAsync, setPick]);

    const download = useAgentDownload(() => {
        const p = pickRef.current;
        if (p) setPick({ ...p, download: false });
        // Only a run waiting on it goes on; a download left after Cancel just lands.
        const run = heldRef.current;
        if (p && run) void runAfter(run, p.id);
    });
    const { follow, start } = download;

    // A download already running (the app restarted mid-download) is followed rather than started again.
    const listing = useAgentPrograms().data;
    const followed = useRef(false);
    useEffect(() => {
        if (!listing || followed.current) return;
        followed.current = true;
        follow(listing.download);
    }, [listing, follow]);

    const begin = useCallback(async (run: Run) => {
        const p = pickRef.current;
        if (!p) {
            run();
            return;
        }
        setHeld(() => run);
        setError(null);
        if (!p.download) {
            await runAfter(run, p.id);
            return;
        }
        let now: AgentPrograms;
        try {
            now = await queryClient.fetchQuery({ queryKey: agentProgramKeys.list, queryFn: ({ signal }) => requireClient(client).getAgentPrograms({ signal }), staleTime: 0 });
        } catch (err) {
            setError(err);
            return;
        }
        // It may have finished in the background since a Cancel.
        if (now.programs.find((x) => x.id === p.id)?.installed) {
            await runAfter(run, p.id);
            return;
        }
        if (now.download.state === 'downloading') follow(now.download);
        else void start();
    }, [client, queryClient, runAfter, follow, start]);

    const carryOn = useCallback(() => {
        const run = heldRef.current;
        if (run) void runAfter(run, null);
    }, [runAfter]);

    const cancel = useCallback(() => {
        setHeld(null);
        setError(null);
    }, []);

    const retry = useCallback(() => {
        const run = heldRef.current;
        if (run) void begin(run);
    }, [begin]);

    return {
        pick,
        setPick,
        /** A run is waiting on the agent. */
        held: held !== null,
        job: download.job,
        interrupted: download.interrupted,
        failure: download.failure,
        /** The listing read or the save that failed. */
        error,
        saving: save.isPending,
        begin,
        carryOn,
        cancel,
        retry,
        retryDownload: start,
    };
}
