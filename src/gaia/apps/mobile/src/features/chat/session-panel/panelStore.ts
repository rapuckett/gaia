// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

export type PanelSectionId = 'answer' | 'outputs' | 'changes' | 'skills' | 'context' | 'tools' | 'plan' | 'schedule' | 'commands' | 'documents' | 'session';

// The web UI's defaults (stores/sessionPanelStore.ts); remembered for the app session only.
const DEFAULT_OPEN: Record<PanelSectionId, boolean> = {
    answer: true,
    outputs: true,
    changes: true,
    skills: true,
    context: false,
    tools: false,
    plan: true,
    schedule: true,
    commands: true,
    documents: true,
    session: false,
};

interface PanelState {
    sections: Record<PanelSectionId, boolean>;
    setSection(id: PanelSectionId, open: boolean): void;
    /** Opens a section and asks the panel to scroll its header to the top; `seq` makes a repeat tap a new request. */
    reveal(id: PanelSectionId): void;
    scrollRequest: { id: PanelSectionId; seq: number } | null;
    /** Which numbers Context & performance shows under the hood. */
    contextScope: 'turn' | 'chat';
    setContextScope(scope: 'turn' | 'chat'): void;
    /** Dev gallery only: where the Changes section starts, so its confirm, conflict and review states can be shot. */
    changesSeed: { phase: 'confirm' | 'conflict'; detail?: string } | null;
    setChangesSeed(seed: PanelState['changesSeed']): void;
    /** The Environment confirmation showing: removing a folder, or turning on full access. */
    /** The folder picker is open inside Environment. */
    envPicking: boolean;
    setEnvPicking(picking: boolean): void;
    envConfirm: { kind: 'remove'; path: string } | { kind: 'full' } | null;
    setEnvConfirm(confirm: PanelState['envConfirm']): void;
}

export const useSessionPanelStore = create<PanelState>((set) => ({
    sections: DEFAULT_OPEN,
    setSection: (id, open) => set((state) => ({ sections: { ...state.sections, [id]: open } })),
    scrollRequest: null,
    reveal: (id) => set((state) => ({ sections: { ...state.sections, [id]: true }, scrollRequest: { id, seq: (state.scrollRequest?.seq ?? 0) + 1 } })),
    contextScope: 'turn',
    setContextScope: (contextScope) => set({ contextScope }),
    changesSeed: null,
    setChangesSeed: (changesSeed) => set({ changesSeed }),
    envPicking: false,
    setEnvPicking: (envPicking) => set({ envPicking }),
    envConfirm: null,
    setEnvConfirm: (envConfirm) => set({ envConfirm }),
}));
