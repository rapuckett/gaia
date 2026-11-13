// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ApplyDirection } from './direction.types';

export const applyDirection: ApplyDirection = (dir) => {
    document.documentElement.dir = dir;
};
