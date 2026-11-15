// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { directionPlan } from './direction.core';

describe('directionPlan', () => {
    it.each([
        ['rtl', 'rtl', { allowRTL: true, forceRTL: false }],
        ['ltr', 'ltr', { allowRTL: true, forceRTL: false }],
        ['rtl', 'ltr', { allowRTL: true, forceRTL: true }],
        ['ltr', 'rtl', { allowRTL: false, forceRTL: false }],
    ] as const)('app %s on a %s phone', (app, device, plan) => {
        expect(directionPlan(app, device)).toEqual(plan);
    });
});
