// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { RelayState } from './pushRegistration';

/** The OS's answer: not asked yet, allowed, or refused (then only the phone's Settings can change it). */
export type PushPermission = 'undetermined' | 'granted' | 'denied';

// Not secret: only whether the explainer has shown on its own, which it does once.
const OFFERED_KEY = 'gaia:push-offered';

interface PushState {
    /** Null until read from the OS. */
    permission: PushPermission | null;
    /** The last registration's answer from the relay; null before one. */
    relay: RelayState | null;
    /** A paired PC's own words for refusing this phone's registration (a 422 naming bad fields); null when none did. */
    refusal: string | null;
    /** Whether the explainer has shown on its own; null until read. */
    offered: boolean | null;
    explainerOpen: boolean;
    setPermission(permission: PushPermission): void;
    setRelay(relay: RelayState): void;
    setRefusal(refusal: string | null): void;
    loadOffered(): Promise<void>;
    /** Shows the explainer; `automatic` marks the one automatic showing as used. */
    openExplainer(automatic: boolean): void;
    closeExplainer(): void;
}

export const usePushStore = create<PushState>((set) => ({
    permission: null,
    relay: null,
    refusal: null,
    offered: null,
    explainerOpen: false,
    setPermission: (permission) => set({ permission }),
    setRelay: (relay) => set({ relay }),
    setRefusal: (refusal) => set({ refusal }),
    loadOffered: async () => set({ offered: (await AsyncStorage.getItem(OFFERED_KEY)) === '1' }),
    openExplainer: (automatic) => {
        set(automatic ? { explainerOpen: true, offered: true } : { explainerOpen: true });
        if (automatic) {
            AsyncStorage.setItem(OFFERED_KEY, '1').catch((error: unknown) => console.error('Could not save that the notifications explainer has shown', error));
        }
    },
    closeExplainer: () => set({ explainerOpen: false }),
}));

export type PushRowState = 'unavailable' | 'not_asked' | 'on' | 'blocked' | 'unreachable';

/** Settings › Notifications' row: off, on, blocked by the OS, or registered but the relay unreachable. */
export function pushRowState(available: boolean, permission: PushPermission | null, relay: RelayState | null): PushRowState {
    if (!available) return 'unavailable';
    if (permission === 'denied') return 'blocked';
    if (permission === 'granted') return relay === 'unreachable' ? 'unreachable' : 'on';
    return 'not_asked';
}
