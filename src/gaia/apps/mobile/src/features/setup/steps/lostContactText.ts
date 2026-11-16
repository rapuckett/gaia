// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import { describeFailureWith, type Translate } from '@/i18n/useT';

/** The "Lost contact" alert. The PC's own English reason comes back as `detail`, on its own line, so it appears once and never inside the gloss. */
export function lostContactText(t: Translate, error: unknown): { text: string; detail?: string } {
    if (error instanceof GaiaApiError && error.detail) return { text: t('mobileApp.setup.lostContactNoReason'), detail: error.detail };
    return { text: t.compose((say) => say('setup.lostContact', { error: describeFailureWith(error, say) })) };
}
