// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { PairedPc, PairedStatus } from '@/features/pairing/pairing.types';

import { useConnectionStore } from './connection';

// Only what isn't secret; the token and pin live in the Keychain.
const PAIRED_PCS_KEY = 'gaia:paired-pcs';

interface Saved {
    pcs: PairedPc[];
    currentId: string | null;
}

interface PairedPcsState extends Saved {
    /** False until the saved list has been read; whether to show pairing waits for it. */
    loaded: boolean;
    load(): Promise<void>;
    /** Adds or replaces the PC, and makes it the one the app talks to. */
    add(pc: PairedPc): Promise<void>;
    select(pcId: string): Promise<void>;
    setStatus(pcId: string, status: PairedStatus): Promise<void>;
    remove(pcId: string): Promise<void>;
}

export function currentPairedPc(state: Saved): PairedPc | null {
    return state.pcs.find((pc) => pc.pcId === state.currentId) ?? null;
}

function connectTo(pc: PairedPc | null): void {
    const connection = useConnectionStore.getState();
    if (pc) connection.setConnection({ baseUrl: pc.origin });
    else connection.clearConnection();
}

export const usePairedPcsStore = create<PairedPcsState>((set, get) => {
    async function commit(next: Saved): Promise<void> {
        const before = currentPairedPc(get());
        set(next);
        const after = currentPairedPc(next);
        if (before?.pcId !== after?.pcId || before?.origin !== after?.origin) connectTo(after);
        await AsyncStorage.setItem(PAIRED_PCS_KEY, JSON.stringify(next));
    }

    return {
        loaded: false,
        pcs: [],
        currentId: null,
        async load() {
            if (get().loaded) return;
            const raw = await AsyncStorage.getItem(PAIRED_PCS_KEY);
            const saved: Saved = raw ? (JSON.parse(raw) as Saved) : { pcs: [], currentId: null };
            set({ ...saved, loaded: true });
            const current = currentPairedPc(saved);
            if (current) connectTo(current);
        },
        async add(pc) {
            const pcs = [...get().pcs.filter((p) => p.pcId !== pc.pcId), pc];
            await commit({ pcs, currentId: pc.pcId });
        },
        async select(pcId) {
            if (!get().pcs.some((p) => p.pcId === pcId)) throw new Error(`No paired PC has the id ${pcId}.`);
            await commit({ pcs: get().pcs, currentId: pcId });
        },
        async setStatus(pcId, status) {
            const pcs = get().pcs.map((p) => (p.pcId === pcId ? { ...p, status } : p));
            await commit({ pcs, currentId: get().currentId });
        },
        async remove(pcId) {
            const pcs = get().pcs.filter((p) => p.pcId !== pcId);
            const currentId = get().currentId === pcId ? (pcs[0]?.pcId ?? null) : get().currentId;
            await commit({ pcs, currentId });
        },
    };
});
