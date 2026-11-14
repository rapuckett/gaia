// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaError } from '@/api/errors';
import { requestFailureText } from '@/features/chat/chatErrors';
import type { Translate } from '@/i18n/useT';

/** Why a header action failed, as the `{error}` text of the web's `chat.*Failed` messages. */
export function failureReason(error: unknown, t: Translate): string {
    if (error instanceof GaiaError) return requestFailureText(error, t);
    return error instanceof Error ? error.message : String(error);
}
