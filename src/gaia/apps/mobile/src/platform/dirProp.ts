// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Direction } from './direction.types';

// Native resolves start/end from I18nManager, so there is nothing to set.
export function dirProp(_d: Direction): Record<string, never> {
    return {};
}
