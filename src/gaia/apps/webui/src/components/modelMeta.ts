// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Shared wording for a local model's state, device, size and speed. */

import type { LocalModelState, ProviderModel } from '../types';

export function ctxLabel(tokens: number | null | undefined): string {
    return tokens ? `${Math.round(tokens / 1024)}K` : 'unknown';
}

/** The model's state, derived from `downloaded` when the backend sent none. */
export function modelState(m: ProviderModel): LocalModelState {
    return m.state ?? (m.downloaded ? 'downloaded' : 'not_downloaded');
}

/** True while a download of *m* is running. */
export function isDownloading(m: ProviderModel): boolean {
    const s = m.download_progress?.state;
    return s === 'starting' || s === 'downloading';
}
