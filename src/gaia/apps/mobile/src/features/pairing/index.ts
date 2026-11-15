// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { currentPairedPc, usePairedPcsStore } from '@/state/pairedPcs';

import { transportAvailable } from '../../../modules/gaia-transport';
import type { PairedPc } from './pairing.types';

export * from './pairing.types';
export { pairingApi } from './pairingApi';
export { PairingScanner, type PairingScannerProps } from './PairingScanner';

/**
 * Whether the app must be paired before it can talk to a PC: an iOS build with the pinned
 * transport and no development backend (EXPO_PUBLIC_GAIA_URL, the simulator's).
 */
export const PAIRING_REQUIRED = transportAvailable && !process.env.EXPO_PUBLIC_GAIA_URL;

/** Reads the saved paired PCs; call once at launch, before trusting `pairingApi.current()`. */
export function loadPairedPcs(): Promise<void> {
    return usePairedPcsStore.getState().load();
}

/** The PC the app talks to, re-rendering when it changes; `loaded` is false until the saved list is read. */
export function usePairedPc(): { loaded: boolean; pc: PairedPc | null } {
    const loaded = usePairedPcsStore((s) => s.loaded);
    const pc = usePairedPcsStore(currentPairedPc);
    return { loaded, pc };
}

/** Every paired PC, re-rendering when the list changes. */
export function usePairedPcs(): PairedPc[] {
    return usePairedPcsStore((s) => s.pcs);
}
