// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { plainFailure, type Translate } from '@/i18n/useT';

/** The "Lost contact" alert. The PC's own English reason comes back as `detail`, on its own line, so it appears once and never inside the gloss. */
export function lostContactText(t: Translate, error: unknown): { text: string; detail?: string } {
    return plainFailure(t, 'setup.lostContact', {}, error);
}
