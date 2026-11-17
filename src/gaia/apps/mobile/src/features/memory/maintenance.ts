// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { MessageKey } from '@webui/i18n/registry';

import type { MemoryMaintenanceAction, MemoryMaintenanceOutcome } from '@/data';
import type { Translate } from '@/i18n/useT';
import { failureNotice as failureSentence } from '@/features/chat/header/failureText';

import type { MemoryNotice } from './useMemoryNotice';

/** The web's menu order. */
export const MAINTENANCE_ACTIONS: readonly MemoryMaintenanceAction[] = [
    'consolidate',
    'rebuildEmbeddings',
    'reconcile',
    'refreshSystemContext',
    'rebuildFts',
];

export const MAINTENANCE_LABELS: Record<MemoryMaintenanceAction, { idle: MessageKey; busy: MessageKey; failed: MessageKey; failedShort: MessageKey }> = {
    consolidate: { idle: 'mem.maint.consolidate', busy: 'mem.maint.consolidating', failed: 'mem.toast.consolidateFailed', failedShort: 'mobileApp.mem.consolidateFailedShort' },
    rebuildEmbeddings: { idle: 'mem.maint.rebuildEmbeddings', busy: 'mem.maint.rebuilding', failed: 'mem.toast.rebuildFailed', failedShort: 'mobileApp.mem.rebuildFailedShort' },
    reconcile: { idle: 'mem.maint.reconcile', busy: 'mem.maint.reconciling', failed: 'mem.toast.reconcileFailed', failedShort: 'mobileApp.mem.reconcileFailedShort' },
    refreshSystemContext: { idle: 'mem.maint.refreshSystem', busy: 'mem.maint.refreshing', failed: 'mem.toast.systemFailed', failedShort: 'mobileApp.mem.systemFailedShort' },
    rebuildFts: { idle: 'mem.maint.rebuildFts', busy: 'mem.maint.rebuilding', failed: 'mem.toast.ftsFailed', failedShort: 'mobileApp.mem.ftsFailedShort' },
};

/** The result line the web's toast shows for a finished action. */
export function outcomeNotice(outcome: MemoryMaintenanceOutcome, t: Translate): MemoryNotice {
    switch (outcome.action) {
        case 'consolidate':
            return {
                tone: 'success',
                text: t('mem.toast.consolidated', { sessions: outcome.result.consolidated ?? 0, items: outcome.result.extracted_items ?? 0 }),
            };
        case 'rebuildEmbeddings': {
            const n = outcome.result.backfilled ?? 0;
            return {
                tone: 'success',
                text: outcome.result.total_without
                    ? t('mem.toast.backfilledMissing', { n, missing: outcome.result.total_without })
                    : t('mem.toast.backfilled', { n }),
            };
        }
        case 'reconcile':
            return {
                tone: 'success',
                text: t('mem.toast.reconciled', {
                    pairs: outcome.result.pairs_checked ?? 0,
                    reinforced: outcome.result.reinforced ?? 0,
                    contradicted: outcome.result.contradicted ?? 0,
                }),
            };
        case 'refreshSystemContext':
            return outcome.result.skipped
                ? { tone: 'danger', text: t('mem.toast.systemDisabled') }
                : { tone: 'success', text: t('mem.toast.systemRefreshed', { n: outcome.result.stored }) };
        case 'rebuildFts':
            return { tone: 'success', text: t('mem.toast.ftsRebuilt') };
    }
}

export function failureNotice(action: MemoryMaintenanceAction, error: Error, t: Translate): MemoryNotice {
    const { failed, failedShort } = MAINTENANCE_LABELS[action];
    return { tone: 'danger', ...failureSentence(error, t, { withReason: failed, noReason: failedShort }) };
}
