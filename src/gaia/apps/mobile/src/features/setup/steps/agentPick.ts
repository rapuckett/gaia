// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';

import { AGENT_PICK_KEY, type AgentPick } from '@webui/components/setup/agentPrograms';

import { useConnectionStore } from '@/state/connection';

// webui's key for the pick, one per paired PC so a pick made for one never applies to another.
const keyFor = (pcId: string) => `${AGENT_PICK_KEY}:${pcId}`;

function parsePick(raw: string | null): AgentPick | null {
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    const p = v as Partial<AgentPick> | null;
    if (p && (p.id === 'gaiapy' || p.id === 'gaiacpp') && typeof p.download === 'boolean' && typeof p.current === 'string') {
        return { id: p.id, download: p.download, current: p.current };
    }
    console.warn('Ignored a saved agent pick that is not one this app reads', raw);
    return null;
}

interface AgentPickState {
    /** The PC the pick below was read for; null until it has been read. */
    pcId: string | null;
    pick: AgentPick | null;
    load(pcId: string): Promise<void>;
    remember(pick: AgentPick | null): void;
}

export const useAgentPickStore = create<AgentPickState>((set, get) => ({
    pcId: null,
    pick: null,
    async load(pcId) {
        try {
            const pick = parsePick(await AsyncStorage.getItem(keyFor(pcId)));
            set({ pcId, pick });
        } catch (err) {
            console.warn('Could not read the agent picked in setup; setup goes on with the agent in use', err);
            set({ pcId, pick: null });
        }
    },
    remember(pick) {
        set({ pick });
        const pcId = get().pcId ?? useConnectionStore.getState().connection?.pcId;
        if (!pcId) return;
        const saving = pick ? AsyncStorage.setItem(keyFor(pcId), JSON.stringify(pick)) : AsyncStorage.removeItem(keyFor(pcId));
        saving.catch((err: unknown) => console.warn('Could not keep the agent picked in setup for the next launch', err));
    },
}));

/** Setup's agent pick for the paired PC, kept across an app restart, and the way to change it (null drops it). */
export function useAgentPick(): { pick: AgentPick | null; setPick: (pick: AgentPick | null) => void } {
    const pcId = useConnectionStore((s) => s.connection?.pcId ?? null);
    const loadedFor = useAgentPickStore((s) => s.pcId);
    const pick = useAgentPickStore((s) => s.pick);
    const setPick = useAgentPickStore((s) => s.remember);
    useEffect(() => {
        if (pcId && pcId !== loadedFor) void useAgentPickStore.getState().load(pcId);
    }, [pcId, loadedFor]);
    return { pick: pcId && pcId !== loadedFor ? null : pick, setPick };
}
