// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Direction } from './direction.types';

// react-native-web reads its own locale context, which only a `dir` prop sets; without it start/end resolve LTR in Arabic.
export function dirProp(d: Direction): { dir: Direction } {
    return { dir: d };
}
