// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { I18nManager } from 'react-native';

import type { ApplyDirection } from './direction.types';

// Native layout direction only flips after an app restart; the first launch in a new direction is mirrored on the next one.
export const applyDirection: ApplyDirection = (dir) => {
    const rtl = dir === 'rtl';
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
};
