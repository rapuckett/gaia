// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

export type ChipId = 'folder' | 'private' | 'permission' | 'model';

/** Chips give up their label in this order; the model chip never does. */
export const COLLAPSE_ORDER: readonly ChipId[] = ['folder', 'private', 'permission'];

export const CHIP_GAP = 8;
/** A collapsed chip is its icon in a touch target. */
export const ICON_ONLY_WIDTH = 44;
/** The model's name ellipsizes down to this before any other chip collapses. */
export const MODEL_MIN_WIDTH = 120;

/** Which chips must show their icon alone so the measured row fits `available`. Unmeasured chips count as absent. */
export function collapsedChips(full: Partial<Record<ChipId, number>>, available: number): ChipId[] {
    if (available <= 0) return [];
    const width = (id: ChipId): number | undefined => {
        const w = full[id];
        return w === undefined ? undefined : id === 'model' ? Math.min(w, MODEL_MIN_WIDTH) : w;
    };
    const present = (['folder', 'private', 'permission', 'model'] as const).filter((id) => width(id) !== undefined);
    const collapsed: ChipId[] = [];
    const total = () =>
        present.reduce((sum, id) => sum + (collapsed.includes(id) ? ICON_ONLY_WIDTH : (width(id) ?? 0)), 0) +
        CHIP_GAP * Math.max(0, present.length - 1);
    for (const id of COLLAPSE_ORDER) {
        if (total() <= available) break;
        if (present.includes(id)) collapsed.push(id);
    }
    return collapsed;
}
