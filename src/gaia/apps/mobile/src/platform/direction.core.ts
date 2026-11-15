// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Direction } from './direction.types';

export interface DirectionPlan {
    allowRTL: boolean;
    forceRTL: boolean;
}

// React Native has no force-LTR: an English app on an Arabic phone gets LTR only by refusing RTL.
export function directionPlan(app: Direction, device: Direction): DirectionPlan {
    if (app === device) return { allowRTL: true, forceRTL: false };
    return app === 'rtl' ? { allowRTL: true, forceRTL: true } : { allowRTL: false, forceRTL: false };
}
