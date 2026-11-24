// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

export type ChipId = 'research' | 'folder' | 'private' | 'permission' | 'model' | 'meter' | 'agent';
/** What the row can take back for room: a chip's label, or the place after the model's name ("Gemma 4 E4B · Local"). */
export type RoomId = ChipId | 'place' | 'meterWord';

/** Chips give up their label in the desktop's order: Research's label first (its icon and tooltip still say what it is), then the meter's bar (and the spend with it), then the folder's name, then the agent's, then Private and Permission, then the model's place, which the desktop's chip cuts first from its text, then the meter's "Context" word (all its text, when there is no reading yet). The model's name never goes: it is cut only when everything else already has. */
export const COLLAPSE_ORDER: readonly RoomId[] = ['research', 'meter', 'folder', 'agent', 'private', 'permission', 'place', 'meterWord'];

export const CHIP_GAP = 8;
/** A collapsed chip is its icon in a box this wide; its touch target reaches 44 through hit slop, so two of them `CHIP_GAP` apart don't overlap. */
export const ICON_ONLY_WIDTH = 36;
/** Below this width the model chip drops its name and shows its icon and chevron. */
export const MODEL_FLOOR_WIDTH = 72;
/** The context meter's bar and its gap; without it the meter is its percentage alone. */
export const METER_BAR_WIDTH = 48;

/** What must give way (chips to their icon, the meter to no bar, the model to its name alone) so the measured row fits `available`. `model` is the chip with its name, `place` the same chip with its place too, `meterWord` the meter's value alone (unmeasured: no text at all). Absent (0 or unmeasured) items count for nothing. */
export function collapsedChips(full: Partial<Record<RoomId, number>>, available: number): RoomId[] {
    if (available <= 0) return [];
    const width = (id: RoomId): number | undefined => {
        const w = full[id];
        return w === undefined || w <= 0 ? undefined : w;
    };
    const present = (['research', 'folder', 'agent', 'private', 'permission', 'model', 'meter'] as const).filter((id) => width(id) !== undefined);
    const collapsed: RoomId[] = [];
    const placed = () => width('place') !== undefined && !collapsed.includes('place');
    const total = () =>
        present.reduce((sum, id) => {
            if (id === 'model') return sum + ((placed() ? width('place') : width('model')) ?? 0);
            if (!collapsed.includes(id)) return sum + (width(id) ?? 0);
            if (id === 'meter') return sum + (collapsed.includes('meterWord') ? (width('meterWord') ?? 0) : Math.max(0, (width(id) ?? 0) - METER_BAR_WIDTH));
            return sum + ICON_ONLY_WIDTH;
        }, 0) +
        CHIP_GAP * Math.max(0, present.length - 1);
    for (const id of COLLAPSE_ORDER) {
        if (total() <= available) break;
        if (id === 'place' ? placed() : id === 'meterWord' ? present.includes('meter') : present.includes(id)) collapsed.push(id);
    }
    return collapsed;
}
