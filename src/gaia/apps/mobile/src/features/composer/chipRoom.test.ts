// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { CHIP_GAP, collapsedChips, ICON_ONLY_WIDTH } from './chipRoom';

const FULL = { folder: 90, private: 100, permission: 70, model: 200 };

describe('collapsedChips', () => {
    it('keeps every label when the chips fit one line', () => {
        expect(collapsedChips(FULL, 500)).toEqual([]);
        expect(collapsedChips({ ...FULL, meter: 80 }, 600)).toEqual([]);
    });

    it('protects the model: the others collapse for its full width before its name is cut', () => {
        expect(collapsedChips({ ...FULL, meter: 80, model: 150 }, 440)).toEqual(['meter', 'folder']);
    });

    it('drops the meter bar first, then Folder, then Private, then Permission', () => {
        const all = { ...FULL, meter: 80 };
        expect(collapsedChips(all, 540)).toEqual(['meter']);
        expect(collapsedChips(all, 500)).toEqual(['meter', 'folder']);
        expect(collapsedChips(all, 450)).toEqual(['meter', 'folder', 'private']);
        expect(collapsedChips(all, 100)).toEqual(['meter', 'folder', 'private', 'permission', 'meterWord']);
    });

    // Widths as the new-chat row measures them at 390 px (web): 227 between Attach and Send.
    const NEW_CHAT = { permission: 70, private: 100, model: 132 };

    it('fits the model name whole at 390 px once Permission and Private are icons', () => {
        const collapsed = collapsedChips(NEW_CHAT, 227);
        expect(collapsed).toEqual(['private', 'permission']);
        const icons = collapsed.length * ICON_ONLY_WIDTH;
        expect(icons + NEW_CHAT.model + CHIP_GAP * 2).toBeLessThanOrEqual(227);
    });

    it("shows the model's place only when it fits, and drops it before the name is cut", () => {
        expect(collapsedChips({ ...NEW_CHAT, place: 177 }, 227)).toEqual(['private', 'permission', 'place']);
        expect(collapsedChips({ ...NEW_CHAT, place: 177 }, 270)).toEqual(['private', 'permission']);
        expect(collapsedChips({ ...NEW_CHAT, place: 177 }, 400)).toEqual([]);
    });

    it("drops the meter's text last, only when that lets the model's name fit", () => {
        const row = { ...NEW_CHAT, meter: 80 };
        expect(collapsedChips(row, 265)).toEqual(['meter', 'private', 'permission']);
        expect(collapsedChips(row, 250)).toEqual(['meter', 'private', 'permission', 'meterWord']);
        expect(collapsedChips({ ...row, meterWord: 30 }, 250)).toEqual(['meter', 'private', 'permission', 'meterWord']);
        expect(collapsedChips({ ...row, meterWord: 30 }, 259)).toEqual(['meter', 'private', 'permission', 'meterWord']);
        expect(collapsedChips({ ...row, meterWord: 30 }, 262)).toEqual(['meter', 'private', 'permission']);
    });

    it('skips chips that are absent and treats an unmeasured row as fitting', () => {
        expect(collapsedChips({ private: 100, model: 300 }, 50)).toEqual(['private']);
        expect(collapsedChips(FULL, 0)).toEqual([]);
    });
});
