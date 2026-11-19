// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { DevicePromptEvent } from '@/api/client.types';

/** What the phone asked of the PC that needs a person there: the key store's unlock, or an administrator prompt. */
export type DevicePromptKind = 'keyStore' | 'admin';

/** `cancelled` is the phone giving up on waiting, or the PC cancelling the prompt; the rest are the PC's own answers. */
export type DevicePromptState = 'idle' | 'waiting' | 'approved' | 'denied' | 'timeout' | 'cancelled';

interface DevicePromptsState {
    /** The latest state by kind and action. It lives here, not in a screen, so leaving a screen never cancels anything. */
    states: Readonly<Record<string, DevicePromptState>>;
}

export const useDevicePromptStore = create<DevicePromptsState>(() => ({ states: {} }));

const keyOf = (kind: DevicePromptEvent['kind'], action: string) => `${kind}\u0000${action}`;

function set(kind: DevicePromptEvent['kind'], action: string, state: DevicePromptState): void {
    useDevicePromptStore.setState((s) => ({ states: { ...s.states, [keyOf(kind, action)]: state } }));
}

/** What the phone does in the hand; a seam so tests can watch it, since jest can't load expo-haptics lazily. */
export const deviceHaptics = {
    denied(): void {
        // Loaded on use: the web build of expo-haptics reads window.matchMedia as it loads.
        import('expo-haptics')
            .then((Haptics) => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning))
            .catch((err: unknown) => console.warn('[device prompt] could not buzz for a refused prompt', err));
    },
};

function isDevicePrompt(event: unknown): event is DevicePromptEvent {
    const e = event as Partial<DevicePromptEvent> | null;
    return (
        !!e &&
        e.type === 'device_prompt' &&
        (e.kind === 'keyStore' || e.kind === 'admin') &&
        typeof e.action === 'string' &&
        (e.state === 'waiting' || e.state === 'approved' || e.state === 'cancelled' || e.state === 'denied' || e.state === 'timeout')
    );
}

/** Takes a sessions-stream event; anything but a well-formed `device_prompt` is left alone. */
export function applyDevicePromptEvent(event: unknown): void {
    if (!isDevicePrompt(event)) {
        if ((event as { type?: unknown } | null)?.type === 'device_prompt') console.warn('[device prompt] ignored a malformed event', event);
        return;
    }
    const before = useDevicePromptStore.getState().states[keyOf(event.kind, event.action)];
    set(event.kind, event.action, event.state);
    if (event.state === 'denied' && before !== 'denied') deviceHaptics.denied();
}

export interface DevicePrompt {
    state: DevicePromptState;
    /** True while the phone is waiting for the PC: the action's own button stays hidden. */
    waiting: boolean;
    /** True while the notice stands in for the action's button: waiting or any outcome not yet dismissed. */
    hideAction: boolean;
    /** Stops waiting on the phone; the PC's prompt may still be up. */
    stopWaiting: () => void;
    /** Clears a stopped-waiting note. */
    dismiss: () => void;
    /** Shows waiting again right away, before the PC's own event for the re-sent action arrives. */
    restart: () => void;
}

/** Where the prompt this action raised on the PC stands, from the PC's `device_prompt` events. */
export function useDevicePrompt({ kind, action }: { kind: DevicePromptKind; action: string }): DevicePrompt {
    const state = useDevicePromptStore((s) => s.states[keyOf(kind, action)]) ?? 'idle';
    return {
        state,
        waiting: state === 'waiting',
        hideAction: state !== 'idle' && state !== 'approved',
        stopWaiting: () => set(kind, action, 'cancelled'),
        dismiss: () => set(kind, action, 'idle'),
        restart: () => set(kind, action, 'waiting'),
    };
}
