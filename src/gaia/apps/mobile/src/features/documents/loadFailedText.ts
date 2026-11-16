// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describeFailureWith, type Translate } from '@/i18n/useT';

/** The library's load failure; the PC's own reason goes in as sent, so it isn't wrapped in the "GAIA answered with an error" sentence. */
export function loadFailedText(t: Translate, error: unknown): string {
    return t.compose((say) => say('docs.loadFailed', { error: describeFailureWith(error, say) }));
}
