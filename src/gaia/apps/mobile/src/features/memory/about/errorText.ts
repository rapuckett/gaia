// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError, GaiaError } from '@/api/errors';
import type { Translate } from '@/i18n/useT';

/** A failure as a phrase to put inside another message, so it never nests a bracketed one. */
export function errorText(error: unknown, t: Translate): string {
    if (error instanceof GaiaApiError) return error.detail;
    if (error instanceof GaiaError) return t.bare(error.messageKey, error.params);
    return error instanceof Error ? error.message : String(error);
}
