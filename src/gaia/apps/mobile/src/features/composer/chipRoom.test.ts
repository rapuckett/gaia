// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { collapsedChips } from './chipRoom';

const FULL = { folder: 90, private: 100, permission: 70, model: 200 };

describe('collapsedChips', () => {
    it('keeps every label when the row fits', () => {
        expect(collapsedChips(FULL, 500)).toEqual([]);
    });

    it('drops Folder first, then Private, then Permission', () => {
        expect(collapsedChips(FULL, 380)).toEqual(['folder']);
        expect(collapsedChips(FULL, 330)).toEqual(['folder', 'private']);
        expect(collapsedChips(FULL, 100)).toEqual(['folder', 'private', 'permission']);
    });

    it('never collapses the model chip and skips chips that are absent', () => {
        expect(collapsedChips({ private: 100, model: 300 }, 150)).toEqual(['private']);
        expect(collapsedChips(FULL, 0)).toEqual([]);
    });

    it('counts the context meter, then shrinks its bar only after every chip is icon-only', () => {
        expect(collapsedChips({ ...FULL, meter: 80 }, 480)).toEqual(['folder']);
        expect(collapsedChips({ ...FULL, meter: 80 }, 190)).toEqual(['folder', 'private', 'permission', 'meter']);
    });
});
