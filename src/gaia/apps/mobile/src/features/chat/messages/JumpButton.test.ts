// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { JUMP_EDGE_GAP, JUMP_MIN_AREA, jumpButtonTop } from './JumpButton';

describe('jumpButtonTop', () => {
    it('sits the hit area its gap above the bottom edge', () => {
        expect(jumpButtonTop(400)).toBe(400 - JUMP_EDGE_GAP - 48);
    });
    it('hides below the button plus 16 points, shows at exactly that', () => {
        expect(jumpButtonTop(JUMP_MIN_AREA - 1)).toBeNull();
        expect(jumpButtonTop(JUMP_MIN_AREA)).toBe(JUMP_EDGE_GAP);
        expect(JUMP_MIN_AREA).toBe(64);
    });
});
