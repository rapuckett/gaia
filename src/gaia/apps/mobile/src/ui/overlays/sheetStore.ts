// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

export interface SheetEntry {
    id: string;
    open: boolean;
    onClose: () => void;
    title?: string;
    children?: ReactNode;
    footer?: ReactNode;
    dismissible: boolean;
    /** testID of the scrollable body, for device tests. */
    scrollTestID?: string;
    /** While true, the body scrolls to its end whenever its content grows, so a notice added at the bottom shows above the footer. */
    scrollToEnd?: boolean;
    /** The SheetScope that hosts it; unset for the app's own host. */
    scope?: string;
    /** The sheet whose content opened it; such a sheet shows over that one instead of waiting. */
    parent?: string;
}

export interface SheetState {
    /** The sheet on screen, including while it animates out. */
    active?: string;
    /** Sheets opened from inside the active one (or from each other), drawn over it, last on top. */
    stacked: string[];
    /** Sheets that asked to open and are waiting for the active one to go. */
    queue: string[];
    entries: Record<string, SheetEntry>;
}

const EMPTY: SheetState = { stacked: [], queue: [], entries: {} };

let state: SheetState = EMPTY;
const listeners = new Set<() => void>();

function set(next: SheetState) {
    state = next;
    listeners.forEach((l) => l());
}

/** `id` and every stacked sheet opened, directly or not, from it. */
function withChildren(s: SheetState, id: string): Set<string> {
    const ids = new Set([id]);
    for (const child of s.stacked) {
        const parent = s.entries[child]?.parent;
        if (parent && ids.has(parent)) ids.add(child);
    }
    return ids;
}

function without(entries: SheetState['entries'], ids: Set<string>): SheetState['entries'] {
    return Object.fromEntries(Object.entries(entries).filter(([id]) => !ids.has(id)));
}

function promote(s: SheetState): SheetState {
    if (s.active || s.queue.length === 0) return s;
    const [active, ...queue] = s.queue;
    return { ...s, active, queue };
}

export const sheetStore = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    getState: () => state,

    /** A `Sheet` with `open` set: shows it now, over its parent sheet, or after the sheet on screen has fully gone. */
    present(entry: SheetEntry) {
        const known = state.entries[entry.id];
        const entries = { ...state.entries, [entry.id]: entry };
        if (known) return set({ ...state, entries });
        const { parent } = entry;
        if (parent && (parent === state.active || state.stacked.includes(parent))) {
            return set({ ...state, entries, stacked: [...state.stacked, entry.id] });
        }
        set(promote({ ...state, entries, queue: [...state.queue, entry.id] }));
    },

    /** A `Sheet` closed or unmounted. One on screen keeps its place until `finished`. */
    release(id: string) {
        const entry = state.entries[id];
        if (!entry) return;
        if (state.active === id || state.stacked.includes(id)) {
            if (entry.open) set({ ...state, entries: { ...state.entries, [id]: { ...entry, open: false } } });
            return;
        }
        const { [id]: _gone, ...entries } = state.entries;
        set({ ...state, entries, queue: state.queue.filter((q) => q !== id) });
    },

    /** A sheet on screen has finished animating out, taking the sheets opened from it along; after the active one, the next may open. */
    finished(id: string) {
        if (state.stacked.includes(id)) {
            const gone = withChildren(state, id);
            return set({ ...state, entries: without(state.entries, gone), stacked: state.stacked.filter((s) => !gone.has(s)) });
        }
        if (state.active !== id) return;
        const gone = withChildren(state, id);
        set(promote({ ...state, entries: without(state.entries, gone), active: undefined, stacked: [] }));
    },

    reset() {
        set(EMPTY);
    },
};
