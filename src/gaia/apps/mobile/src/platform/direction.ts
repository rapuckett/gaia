// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { I18nManager, Platform } from 'react-native';

import { appLanguageSetting } from '../../modules/gaia-app-language';

import { directionPlan } from './direction.core';
import type { ApplyDirection, LayoutDirection } from './direction.types';

// Native layout only flips after an app restart. Both flags persist, so every launch rewrites them.
export const applyDirection: ApplyDirection = (dir, _lang, picked) => {
    // iOS lays the app out in its own language from Settings, which holds the pick; forcing would lag a change made there by a launch.
    const platformLaysOut = Platform.OS === 'ios' && appLanguageSetting() !== null;
    const plan = directionPlan(picked && !platformLaysOut ? dir : null);
    I18nManager.allowRTL(plan.allowRTL);
    I18nManager.forceRTL(plan.forceRTL);
};

export const layoutDirection: LayoutDirection = () => (I18nManager.isRTL ? 'rtl' : 'ltr');
