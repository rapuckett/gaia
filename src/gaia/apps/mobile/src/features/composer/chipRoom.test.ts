// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { collapsedChips } from './chipRoom';

const FULL = { folder: 90, private: 100, permission: 70, model: 200 };

describe('collapsedChips', () => {
    it('keeps every label when the chips fit one line', () => {
        expect(collapsedChips(FULL, 500)).toEqual([]);
        expect(collapsedChips({ ...FULL, meter: 80 }, 370)).toEqual([]);
    });

    it('never counts the model chip: it wraps to its own line instead of squeezing the others', () => {
        expect(collapsedChips({ ...FULL, model: 5000 }, 280)).toEqual([]);
    });

    it('drops the meter bar first, then Folder, then Private, then Permission', () => {
        const all = { ...FULL, meter: 80 };
        expect(collapsedChips(all, 320)).toEqual(['meter']);
        expect(collapsedChips(all, 300)).toEqual(['meter', 'folder']);
        expect(collapsedChips(all, 250)).toEqual(['meter', 'folder', 'private']);
        expect(collapsedChips(all, 100)).toEqual(['meter', 'folder', 'private', 'permission']);
    });

    it('skips chips that are absent and treats an unmeasured row as fitting', () => {
        expect(collapsedChips({ private: 100, model: 300 }, 50)).toEqual(['private']);
        expect(collapsedChips(FULL, 0)).toEqual([]);
    });
});
