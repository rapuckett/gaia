// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

export type ChipId = 'folder' | 'private' | 'permission' | 'model' | 'meter';
/** What the row can take back for room: a chip's label, or the place after the model's name ("Gemma 4 E4B · Local"). */
export type RoomId = ChipId | 'place';

/** Chips give up their label in the desktop's order: the meter's bar (and the spend with it), then the folder's name, then Private and Permission, then the model's place, which the desktop's chip cuts first from its text. The model's name never goes: it is cut only when everything else already has. */
export const COLLAPSE_ORDER: readonly RoomId[] = ['meter', 'folder', 'private', 'permission', 'place'];

export const CHIP_GAP = 8;
/** A collapsed chip is its icon in a box this wide; its touch target reaches 44 through hit slop, so two of them `CHIP_GAP` apart don't overlap. */
export const ICON_ONLY_WIDTH = 36;
/** Below this width the model chip drops its name and shows its icon and chevron. */
export const MODEL_FLOOR_WIDTH = 72;
/** The context meter's bar and its gap; without it the meter is its percentage alone. */
export const METER_BAR_WIDTH = 48;

/** What must give way (chips to their icon, the meter to no bar, the model to its name alone) so the measured row fits `available`. `model` is the chip with its name, `place` the same chip with its place too. Absent (0 or unmeasured) items count for nothing. */
export function collapsedChips(full: Partial<Record<RoomId, number>>, available: number): RoomId[] {
    if (available <= 0) return [];
    const width = (id: RoomId): number | undefined => {
        const w = full[id];
        return w === undefined || w <= 0 ? undefined : w;
    };
    const present = (['folder', 'private', 'permission', 'model', 'meter'] as const).filter((id) => width(id) !== undefined);
    const collapsed: RoomId[] = [];
    const placed = () => width('place') !== undefined && !collapsed.includes('place');
    const total = () =>
        present.reduce((sum, id) => {
            if (id === 'model') return sum + ((placed() ? width('place') : width('model')) ?? 0);
            if (!collapsed.includes(id)) return sum + (width(id) ?? 0);
            return sum + (id === 'meter' ? Math.max(0, (width(id) ?? 0) - METER_BAR_WIDTH) : ICON_ONLY_WIDTH);
        }, 0) +
        CHIP_GAP * Math.max(0, present.length - 1);
    for (const id of COLLAPSE_ORDER) {
        if (total() <= available) break;
        if (id === 'place' ? placed() : present.includes(id)) collapsed.push(id);
    }
    return collapsed;
}
