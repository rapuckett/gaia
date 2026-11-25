// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnectionStore, type ConnectionConfig } from '@/state/connection';
import { clearNewChatDraft } from '@/state/newChatDraft';

import { DeadlineError, withDeadline } from './deadline';
import { getPairingService } from './registry';
import { useActiveConnection } from './routes';
import type { PairedPc, PcRecheck } from './service';

const PCS_KEY = ['pairing', 'pcs'] as const;

/** Read again whenever the PC in use changes: pairing another PC adds one, and the screen stays mounted in the drawer. */
export function usePairedPcs() {
    const pcId = useActiveConnection()?.pcId ?? null;
    return useQuery({ queryKey: [...PCS_KEY, pcId], queryFn: () => getPairingService().list(), placeholderData: keepPreviousData });
}

/** Whether the app is talking to this PC now. By id: two PCs can share a name and a host. */
export function isCurrentPc(pc: Pick<PairedPc, 'id'>, connection: ConnectionConfig | null | undefined): boolean {
    return !!connection?.pcId && connection.pcId === pc.id;
}

// Chats, skills and the rest belong to the PC that was in use.
function dropPcData(queryClient: QueryClient) {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'pairing' });
}

/** Makes this paired PC the one the app talks to. */
export async function switchToPc(pc: PairedPc): Promise<void> {
    await getPairingService().use(pc.id);
    // The pinned service connects with the PC's saved addresses; only a service that doesn't is given the listed one.
    if (useConnectionStore.getState().connection?.pcId !== pc.id) useConnectionStore.getState().setConnection(pc.connection);
}

/** Forgets the PC here, and its unsent new-chat draft with it. */
export async function forgetPc(pcId: string): Promise<void> {
    await getPairingService().forget(pcId);
    await clearNewChatDraft(pcId);
}

export function useUsePc() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: switchToPc,
        onSuccess: () => {
            dropPcData(queryClient);
            return queryClient.invalidateQueries({ queryKey: PCS_KEY });
        },
    });
}

/** Forgetting the PC in use leaves no connection, so the app returns to the welcome screen; no other PC is picked for the person. */
export function useForgetPc() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (pc: Pick<PairedPc, 'id'>) => {
            const wasCurrent = isCurrentPc(pc, useConnectionStore.getState().connection);
            await forgetPc(pc.id);
            if (wasCurrent) {
                useConnectionStore.getState().clearConnection();
                dropPcData(queryClient);
            }
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: PCS_KEY }),
    });
}

/** How long "Pair again" waits for the PC; past it, nothing is decided and nothing changes. */
export const PAIR_AGAIN_MS = 10_000;

export type PairAgainState =
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'unreachable'; pcName: string }
    | { state: 'otherDevice'; pcName: string };

/**
 * After a pin mismatch: asks the PC in use, over the pin saved at pairing, whether it still knows this phone. Known:
 * `onKnown` checks again. Unknown: off to the pairing screen, which says so and only then forgets the PC. A different
 * certificate at every address: `otherDevice`, kept while Try again asks again, and the PC is forgotten only through
 * `forget`. Anything else, or no answer in `deadlineMs`, changes nothing and says the PC can't be reached.
 */
export function usePairAgain(onKnown: () => void, deadlineMs: number = PAIR_AGAIN_MS) {
    const queryClient = useQueryClient();
    const forgetting = useForgetPc();
    const [state, setState] = useState<PairAgainState>({ state: 'idle' });
    const [otherDevice, setOtherDevice] = useState<Pick<PairedPc, 'id' | 'name'> | null>(null);
    const running = useRef(false);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const run = useCallback(() => {
        if (running.current) return;
        running.current = true;
        setState({ state: 'checking' });
        void (async () => {
            const before = useConnectionStore.getState().connection;
            let pc: PairedPc | undefined;
            let answer: PcRecheck = { state: 'unreachable' };
            try {
                pc = (await getPairingService().list()).find((p) => isCurrentPc(p, before));
                if (!pc) throw new Error(`The certificate-changed screen is up, but this phone has no paired PC with the id ${before?.pcId ?? '(none)'} in use.`);
                const asked = pc;
                answer = await withDeadline(deadlineMs, `Asking ${asked.name} whether it still knows this phone`, (signal) => getPairingService().recheck(asked.id, signal));
            } catch (err) {
                if (err instanceof DeadlineError) console.warn('"Pair again" kept everything: the PC gave no answer in time', err);
                else console.error('"Pair again" kept everything: whether the PC still knows this phone could not be told', err);
            }
            running.current = false;
            if (!alive.current) return;
            const stillThisPc = !!pc && isCurrentPc(pc, useConnectionStore.getState().connection);
            setOtherDevice(answer.state === 'otherDevice' && pc ? { id: pc.id, name: pc.name } : null);
            if (answer.state === 'known') {
                setState({ state: 'idle' });
                // A PC that answered at another address is already being checked there, since the connection changed.
                if (useConnectionStore.getState().connection === before) onKnown();
            } else if (answer.state === 'unknown' && pc && stillThisPc) {
                useConnectionStore.getState().pcForgotPhone({ id: pc.id, name: pc.name });
                dropPcData(queryClient);
            } else if (answer.state === 'unknown') {
                // The app moved to another PC while this one answered; that one isn't sent to pairing.
                setState({ state: 'idle' });
            } else if (answer.state === 'otherDevice' && pc) {
                setState({ state: 'otherDevice', pcName: pc.name });
            } else {
                setState({ state: 'unreachable', pcName: pc?.name ?? '' });
            }
        })();
    }, [onKnown, queryClient, deadlineMs]);

    /** Forgets the PC a different device answered for, local first, once the person confirmed it. */
    const forget = useCallback(() => {
        if (otherDevice && !running.current) forgetting.mutate(otherDevice);
    }, [otherDevice, forgetting]);

    return { ...state, otherDevice, run, forget, forgetting: forgetting.isPending, forgetError: forgetting.error };
}
