// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import { describeFailureWith, type Translate } from '@/i18n/useT';

/** The library's load failure. The PC's own English reason stays out of the sentence and comes back as `detail`, so it can't read as part of the English gloss. */
export function loadFailedText(t: Translate, error: unknown): { text: string; detail?: string } {
    if (error instanceof GaiaApiError && error.detail) return { text: t('docs.loadFailedNoReason'), detail: error.detail };
    return { text: t.compose((say) => say('docs.loadFailed', { error: describeFailureWith(error, say) })) };
}
