// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { DevicePromptEvent } from '@/api/client.types';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';

/** What the phone asked of the PC that needs a person there: the key store's unlock, or an administrator prompt. */
export type DevicePromptKind = 'keyStore' | 'admin';

/**
 * `cancelled` is the phone giving up on waiting, or the PC cancelling the prompt; `failed` is the step failing after
 * approval. `busy` (the PC already waits on another request) and `tooSoon` (asked again within 10 s) come from the
 * request's own refusal, never from an event.
 */
export type DevicePromptState = 'idle' | 'waiting' | 'approved' | 'denied' | 'timeout' | 'cancelled' | 'failed' | 'busy' | 'tooSoon';

/** What goes with a state: the failure's reason as the PC sent it, or the seconds a too-soon request must wait. */
export interface DevicePromptNote {
    detail?: string;
    seconds?: number;
}

interface DevicePromptsState {
    /** The latest state by kind and action. It lives here, not in a screen, so leaving a screen never cancels anything. */
    states: Readonly<Record<string, DevicePromptState>>;
    notes?: Readonly<Record<string, DevicePromptNote>>;
}

export const useDevicePromptStore = create<DevicePromptsState>(() => ({ states: {}, notes: {} }));

/** The 409 detail while the PC already waits on this action: `ALREADY_WAITING` in gaia/ui/devices/prompts.py. Other 409s are ordinary errors. */
export const ALREADY_WAITING_DETAIL = 'GAIA is already waiting on the PC for this. Answer the prompt on the PC, then try again.';

const keyOf = (kind: DevicePromptEvent['kind'], action: string) => `${kind}\u0000${action}`;

function set(kind: DevicePromptEvent['kind'], action: string, state: DevicePromptState, note?: DevicePromptNote): void {
    const key = keyOf(kind, action);
    useDevicePromptStore.setState((s) => {
        const notes = { ...s.notes };
        if (note) notes[key] = note;
        else delete notes[key];
        return { states: { ...s.states, [key]: state }, notes };
    });
}

/** Seconds from a 429's `Retry-After`, else the number in "Wait N s", else null. */
function waitSeconds(err: GaiaApiError): number | null {
    if (err.retryAfterSeconds !== null) return err.retryAfterSeconds;
    const m = /\bWait (\d+) s\b/.exec(err.detail);
    return m ? Number(m[1]) : null;
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
        (e.state === 'waiting' || e.state === 'approved' || e.state === 'cancelled' || e.state === 'denied' || e.state === 'timeout' || e.state === 'failed')
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
    /** True while the notice stands in for the action's button: waiting or any outcome not yet dismissed. A refused request (`busy`, `tooSoon`) leaves the button. */
    hideAction: boolean;
    /** The failure's reason, or the seconds to wait. */
    note: DevicePromptNote;
    /** Call as the action is pressed: forgets the last outcome. */
    begin: () => void;
    /** Call when the action's request succeeds: a prompt still shown as waiting (its event was missed) is over. */
    settle: () => void;
    /**
     * Gives the notice the action's HTTP failure: a 409 `busy`, a 429 `tooSoon`, and while the PC's prompt is up or
     * has just failed, the failure itself (its detail line; a 504 is the timeout). True when the notice now shows it,
     * so the caller shows no error of its own; false for any other failure.
     */
    report: (err: unknown) => boolean;
    /** Stops waiting on the phone; the PC's prompt may still be up. */
    stopWaiting: () => void;
    /** Clears a stopped-waiting note. */
    dismiss: () => void;
    /** Shows waiting again right away, before the PC's own event for the re-sent action arrives. */
    restart: () => void;
}

/** Puts an action's prompt in a state, as the PC's event or a refused request would; for dev scenes. */
export function seedDevicePrompt(kind: DevicePromptKind, action: string, state: DevicePromptState, note?: DevicePromptNote): void {
    set(kind, action, state, note);
}

/** Forgets the last outcome as the action is pressed; a prompt still waiting on the PC stays. */
export function beginDevicePrompt(kind: DevicePromptKind, action: string): void {
    if (useDevicePromptStore.getState().states[keyOf(kind, action)] !== 'waiting') set(kind, action, 'idle');
}

/** The action's request succeeded: a prompt still shown as waiting (its event was missed) is over. */
export function settleDevicePrompt(kind: DevicePromptKind, action: string): void {
    if (useDevicePromptStore.getState().states[keyOf(kind, action)] === 'waiting') set(kind, action, 'idle');
}

/** See `DevicePrompt.report`. */
export function reportDevicePromptError(kind: DevicePromptKind, action: string, err: unknown): boolean {
    if (err instanceof GaiaApiError && err.status === 409 && err.detail === ALREADY_WAITING_DETAIL) {
        set(kind, action, 'busy');
        return true;
    }
    if (err instanceof GaiaApiError && err.status === 429) {
        const seconds = waitSeconds(err);
        set(kind, action, 'tooSoon', seconds === null ? undefined : { seconds });
        return true;
    }
    const now = useDevicePromptStore.getState().states[keyOf(kind, action)];
    if (now === 'timeout' || now === 'denied' || now === 'cancelled') return true;
    if (now !== 'waiting' && now !== 'failed') return false;
    // The connection to the PC dropped while its prompt is up: the PC's events still say how it ends.
    if (err instanceof GaiaNetworkError) return true;
    if (err instanceof GaiaApiError && err.status === 504) {
        set(kind, action, 'timeout');
        return true;
    }
    set(kind, action, 'failed', err instanceof GaiaApiError && err.detail ? { detail: err.detail } : undefined);
    return true;
}

const NO_NOTE: DevicePromptNote = {};

/** Where the prompt this action raised on the PC stands, from the PC's `device_prompt` events. */
export function useDevicePrompt({ kind, action }: { kind: DevicePromptKind; action: string }): DevicePrompt {
    const state = useDevicePromptStore((s) => s.states[keyOf(kind, action)]) ?? 'idle';
    const note = useDevicePromptStore((s) => s.notes?.[keyOf(kind, action)]) ?? NO_NOTE;
    return {
        state,
        waiting: state === 'waiting',
        hideAction: state !== 'idle' && state !== 'approved' && state !== 'busy' && state !== 'tooSoon',
        note,
        begin: () => beginDevicePrompt(kind, action),
        settle: () => settleDevicePrompt(kind, action),
        report: (err) => reportDevicePromptError(kind, action, err),
        stopWaiting: () => set(kind, action, 'cancelled'),
        dismiss: () => set(kind, action, 'idle'),
        restart: () => set(kind, action, 'waiting'),
    };
}
