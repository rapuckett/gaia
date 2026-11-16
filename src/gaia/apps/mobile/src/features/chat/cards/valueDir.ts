// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { contentDir } from '@/ui';

/** A card value from the PC: left to right (aligned to the UI start) unless it is written in an RTL language, which keeps its own direction. */
export function valueDir(text: string): 'ltr' | 'auto' {
    return contentDir(text, 'ltr') === 'ltr' ? 'ltr' : 'auto';
}
