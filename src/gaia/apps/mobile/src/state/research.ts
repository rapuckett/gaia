// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import { isResearchMessage } from '@webui/utils/research';

/** The key for the new-chat screen, which has no session yet (the web UI's `NEW_CHAT_RESEARCH`). */
export const NEW_CHAT_RESEARCH = '';

interface ResearchState {
    /** Research mode per chat: while on, each message is sent as a `/research` turn. */
    research: Record<string, boolean>;
    setResearch(sessionId: string | null, on: boolean): void;
    /** The new chat's choice moves to its chat, only when its first message went out as a research turn. */
    adoptDraft(sessionId: string, firstMessage: string): void;
}

export const useResearchStore = create<ResearchState>((set) => ({
    research: {},
    setResearch: (sessionId, on) =>
        set((state) => {
            const research = { ...state.research };
            const key = sessionId ?? NEW_CHAT_RESEARCH;
            if (on) research[key] = true;
            else delete research[key];
            return { research };
        }),
    adoptDraft: (sessionId, firstMessage) =>
        set((state) => {
            if (!state.research[NEW_CHAT_RESEARCH] || !isResearchMessage(firstMessage)) return {};
            const research = { ...state.research, [sessionId]: true };
            delete research[NEW_CHAT_RESEARCH];
            return { research };
        }),
}));

export function researchOn(sessionId: string | null): boolean {
    return !!useResearchStore.getState().research[sessionId ?? NEW_CHAT_RESEARCH];
}
