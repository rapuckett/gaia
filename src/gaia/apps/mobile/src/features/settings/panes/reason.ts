// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Translate } from '@webui/i18n/translator';

import { GaiaError } from '@/api/errors';

/** An error as text to fill into another message's `{reason}`, so Arabic brackets the sentence once. */
export function reasonOf(error: unknown, t: Translate): string {
    if (error instanceof GaiaError) return t.bare(error.messageKey, error.params);
    return error instanceof Error ? error.message : String(error);
}
