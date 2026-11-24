// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { permissionChipView } from './permissionChip.core';

describe('permissionChipView', () => {
    it('checks while unread, unknown when the read failed', () => {
        expect(permissionChipView(null, false)).toMatchObject({ state: 'checking', labelKey: 'perm.checking', warning: false, unread: true });
        expect(permissionChipView(null, true)).toMatchObject({ state: 'unknown', labelKey: 'perm.unknown', warning: true, unread: true });
    });
    it('marks full access as the warned, lasting state', () => {
        expect(permissionChipView('full_access', false)).toMatchObject({ state: 'full_access', labelKey: 'perm.full', warning: true, unread: false, modeKey: 'perm.fullLower' });
        expect(permissionChipView('ask', false)).toMatchObject({ state: 'ask', labelKey: 'env.ask', warning: false, modeKey: 'perm.askLower' });
    });
});
