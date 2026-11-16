// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { GaiaClient } from '@/api/client.types';
import { isPickWarmUp, type PickLoad } from '@webui/utils/modelList.core';

/** How often a picked model's load is checked (the web's `PICK_LOAD_POLL_MS`). */
const PICK_LOAD_POLL_MS = 1_000;

interface PickLoadState {
    /** The local model picked from the list while it loads, or whose load failed; null otherwise. */
    pickLoad: PickLoad | null;
    /** Follows the PC's load of `model` until it is ready or has failed. */
    watch(client: GaiaClient, model: string): void;
    /** Asks for the failed load again. */
    retry(client: GaiaClient): Promise<void>;
    /** Stops following (a cloud pick, or the banner dismissed). */
    clear(): void;
}

// Bumped by each pick, so an older pick's watch stops.
let generation = 0;

export const usePickLoadStore = create<PickLoadState>((set, get) => ({
    pickLoad: null,
    watch: (client, model) => {
        const mine = ++generation;
        set({ pickLoad: { model, seconds: 0, error: null } });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            const w = await client.getWarmUp();
            if (mine !== generation) return;
            const seconds = Math.floor(w.elapsed_seconds ?? 0);
            if (w.state === 'warming') {
                set({ pickLoad: { model, seconds: isPickWarmUp(w, model) ? seconds : 0, error: null } });
                timer = setTimeout(() => void poll().catch(lost), PICK_LOAD_POLL_MS);
            } else if (w.state === 'failed' && isPickWarmUp(w, model)) {
                set({ pickLoad: { model, seconds, error: w.error ? { reason: w.error } : { key: 'banner.pickLoad.noReason', reason: '' } } });
            } else {
                set({ pickLoad: null });
            }
        };
        const lost = (err: unknown) => {
            if (mine !== generation) return;
            clearTimeout(timer);
            console.warn(`[pickLoad] lost track of loading ${model}`, err);
            set({ pickLoad: { model, seconds: 0, error: { key: 'banner.pickLoad.lostTrack', reason: err instanceof Error ? err.message : String(err) } } });
        };
        void poll().catch(lost);
    },
    retry: async (client) => {
        const model = get().pickLoad?.model;
        if (!model) return;
        try {
            await client.requestWarmUp(true);
        } catch (err) {
            set({ pickLoad: { model, seconds: 0, error: { key: 'banner.pickLoad.startFailed', reason: err instanceof Error ? err.message : String(err) } } });
            return;
        }
        get().watch(client, model);
    },
    clear: () => {
        generation += 1;
        set({ pickLoad: null });
    },
}));
