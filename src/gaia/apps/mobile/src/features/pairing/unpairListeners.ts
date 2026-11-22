// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Hears a PC being unpaired before its token is dropped; `pcKnowsPhone` is false when the PC already refused this phone. */
export type UnpairListener = (pcId: string, pcKnowsPhone: boolean) => Promise<void>;

const listeners = new Set<UnpairListener>();

export function onUnpair(listener: UnpairListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Unpairing goes ahead whatever a listener does; one that fails is logged with the PC it was for. */
export async function notifyUnpair(pcId: string, pcKnowsPhone: boolean): Promise<void> {
    for (const listener of listeners) {
        try {
            await listener(pcId, pcKnowsPhone);
        } catch (error) {
            console.error(`Cleaning up after unpairing the PC ${pcId} failed`, error);
        }
    }
}

/** Hears a reinstall wiping every paired PC's secrets, before they go: what was kept for them must go too. */
export type WipeListener = () => Promise<void>;

const wipeListeners = new Set<WipeListener>();

export function onWipeAll(listener: WipeListener): () => void {
    wipeListeners.add(listener);
    return () => wipeListeners.delete(listener);
}

/** The wipe goes ahead whatever a listener does; one that fails is logged. */
export async function notifyWipeAll(): Promise<void> {
    for (const listener of wipeListeners) {
        try {
            await listener();
        } catch (error) {
            console.error('Cleaning up after a reinstall failed', error);
        }
    }
}
