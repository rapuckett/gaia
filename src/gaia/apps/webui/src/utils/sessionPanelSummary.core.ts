// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** What each session-panel header says at its right edge; the desktop and the phone share these rules. */

import type { CommandState } from './sessionFocus.core';
import type { PlanItemStatus } from './agentActivity.core';

/** Steps done of the plan's total. */
export function planProgress(plan: { steps: readonly unknown[]; statuses: readonly PlanItemStatus[] }): { done: number; total: number } {
    return { done: plan.statuses.filter((s) => s === 'done').length, total: plan.steps.length };
}

export type CountSummary = { kind: 'failed' | 'count'; n: number };

/** Commands: how many failed, else how many ran. */
export function commandsSummary(commands: readonly { state: CommandState }[]): CountSummary {
    const failed = commands.filter((c) => c.state === 'failed').length;
    return failed > 0 ? { kind: 'failed', n: failed } : { kind: 'count', n: commands.length };
}

/** Outputs: the count, or nothing while there are none. */
export function outputsCount(items: readonly unknown[] | null | undefined): number | null {
    return items && items.length > 0 ? items.length : null;
}

/** Environment: "Offline" once the chat has no internet; nothing until the environment is read. */
export function environmentOffline(env: { internet: boolean } | null | undefined): boolean {
    return !!env && !env.internet;
}
