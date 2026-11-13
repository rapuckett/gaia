// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { StartScreen } from '@webui/types';

// How often the start screen is asked for again while the assistant is unavailable.
export const START_RETRY_MS = 15_000;

export interface StartScreenState {
    start: StartScreen | null;
    error: string | null;
}

export interface StartScreenLoader {
    getState: () => StartScreenState;
    subscribe: (listener: () => void) => () => void;
    // A background retry keeps the current reason up until there is a new answer.
    load: (retrying?: boolean) => Promise<void>;
    dispose: () => void;
}

export function createStartScreenLoader(
    fetchStart: () => Promise<StartScreen>,
    describeError: (err: unknown) => string,
): StartScreenLoader {
    let state: StartScreenState = { start: null, error: null };
    let live = true;
    const listeners = new Set<() => void>();
    const set = (patch: Partial<StartScreenState>) => {
        state = { ...state, ...patch };
        listeners.forEach((l) => l());
    };

    return {
        getState: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        load: async (retrying = false) => {
            if (!retrying) set({ error: null });
            try {
                const start = await fetchStart();
                if (live) set({ start, error: start.skills_error ?? null });
            } catch (err) {
                if (live) set({ error: describeError(err) });
            }
        },
        dispose: () => {
            live = false;
        },
    };
}
