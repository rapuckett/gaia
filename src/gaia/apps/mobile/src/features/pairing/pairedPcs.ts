// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useConnectionStore, type ConnectionConfig } from '@/state/connection';
import { clearNewChatDraft } from '@/state/newChatDraft';

import { getPairingService } from './registry';
import { useActiveConnection } from './routes';
import type { PairedPc } from './service';

const PCS_KEY = ['pairing', 'pcs'] as const;

/** Read again whenever the PC in use changes: pairing another PC adds one, and the screen stays mounted in the drawer. */
export function usePairedPcs() {
    const pcId = useActiveConnection()?.pcId ?? null;
    return useQuery({ queryKey: [...PCS_KEY, pcId], queryFn: () => getPairingService().list(), placeholderData: keepPreviousData });
}

/** Whether the app is talking to this PC now. By id: two PCs can share a name and a host. */
export function isCurrentPc(pc: PairedPc, connection: ConnectionConfig | null | undefined): boolean {
    return !!connection?.pcId && connection.pcId === pc.id;
}

// Chats, skills and the rest belong to the PC that was in use.
function dropPcData(queryClient: QueryClient) {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'pairing' });
}

export function useUsePc() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (pc: PairedPc) => {
            await getPairingService().use(pc.id);
            // The pinned service connects with the PC's saved addresses; only a service that doesn't is given the listed one.
            if (useConnectionStore.getState().connection?.pcId !== pc.id) useConnectionStore.getState().setConnection(pc.connection);
        },
        onSuccess: () => {
            dropPcData(queryClient);
            return queryClient.invalidateQueries({ queryKey: PCS_KEY });
        },
    });
}

/** Forgetting the PC in use leaves no connection, so the app returns to the welcome screen. */
export function useForgetPc() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (pc: PairedPc) => {
            await getPairingService().forget(pc.id);
            await clearNewChatDraft(pc.id);
            if (isCurrentPc(pc, useConnectionStore.getState().connection)) {
                useConnectionStore.getState().clearConnection();
                dropPcData(queryClient);
            }
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: PCS_KEY }),
    });
}

/** After a pin mismatch: forget the PC in use, which sends the app back to the welcome screen. */
export function usePairAgain() {
    const forget = useForgetPc();
    return useMutation({
        mutationFn: async () => {
            const pcs = await getPairingService().list();
            const pc = pcs.find((p) => isCurrentPc(p, useConnectionStore.getState().connection));
            if (pc) await forget.mutateAsync(pc);
            else useConnectionStore.getState().clearConnection();
        },
    });
}
