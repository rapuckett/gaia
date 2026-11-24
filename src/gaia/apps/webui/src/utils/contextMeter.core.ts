// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ContextUsage } from '../types';

/** The composer shows the meter only past this fill; the session panel always has the figure. */
export const METER_SHOWN_ABOVE_PCT = 50;

export function contextPct(usage: Pick<ContextUsage, 'used' | 'window'>): number {
    return Math.min(100, Math.round((usage.used / usage.window) * 100));
}

/** Past half full, or with turns at risk, or while its details are open. */
export function meterVisible(pct: number, atRisk: boolean, detailsOpen: boolean): boolean {
    return pct > METER_SHOWN_ABOVE_PCT || atRisk || detailsOpen;
}
