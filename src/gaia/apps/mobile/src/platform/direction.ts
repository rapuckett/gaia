// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

import { directionPlan } from './direction.core';
import type { ApplyDirection, LayoutDirection } from './direction.types';

// Native layout only flips after an app restart. Both flags persist, so every launch rewrites them.
export const applyDirection: ApplyDirection = (dir) => {
    const device = getLocales()[0]?.textDirection === 'rtl' ? 'rtl' : 'ltr';
    const plan = directionPlan(dir, device);
    I18nManager.allowRTL(plan.allowRTL);
    I18nManager.forceRTL(plan.forceRTL);
};

export const layoutDirection: LayoutDirection = () => (I18nManager.isRTL ? 'rtl' : 'ltr');
