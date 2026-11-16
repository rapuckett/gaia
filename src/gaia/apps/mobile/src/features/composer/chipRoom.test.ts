// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { collapsedChips } from './chipRoom';

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
        expect(collapsedChips(all, 100)).toEqual(['meter', 'folder', 'private', 'permission']);
    });

    it('skips chips that are absent and treats an unmeasured row as fitting', () => {
        expect(collapsedChips({ private: 100, model: 300 }, 50)).toEqual(['private']);
        expect(collapsedChips(FULL, 0)).toEqual([]);
    });
});
