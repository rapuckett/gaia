// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Pure rules for setup's optional extras, shared by the desktop and the phone app. */

import type { SetupModelProgress, SetupRunStatus } from '../../types';

export const modelOnDisk = (m: SetupModelProgress): boolean =>
    m.state === 'ready' || m.state === 'skipped' || m.state === 'verifying' || m.state === 'unchecked';

/** Every model setup needs is here and the run stopped on extras the person added: their ids, else none. */
export function extrasLeft(run: SetupRunStatus | null, moving: boolean, isExtra: (id: string) => boolean): string[] {
    if (!run || run.server_only) return [];
    const models = run.models ?? [];
    const stopped = run.state === 'failed' || run.state === 'cancelled';
    const downloadDone = stopped && models.length > 0 && models.every(modelOnDisk) && !moving;
    if (!stopped || moving || downloadDone) return [];
    return models.every((m) => modelOnDisk(m) || isExtra(m.id)) ? models.filter((m) => !modelOnDisk(m)).map((m) => m.id) : [];
}

/** Extras still pulling once setup is ready; chat needn't wait for them. */
export function extrasStillFetching(run: SetupRunStatus | null): string[] {
    if (!run || run.server_only || run.state !== 'ready') return [];
    return (run.models ?? []).filter((m) => m.state === 'downloading' || m.state === 'queued').map((m) => m.id);
}
