// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaError } from '@/api/errors';
import { requestFailureServerText, requestFailureText, requestFailureWith } from '@/features/chat/chatErrors';
import type { MessageKey, Params, Say } from '@webui/i18n/registry';
import type { Translate } from '@/i18n/useT';

/** Why a header action failed, as the `{error}` text of the web's `chat.*Failed` messages. */
export function failureReason(error: unknown, t: Translate): string {
    if (error instanceof GaiaError) return requestFailureText(error, t);
    return error instanceof Error ? error.message : String(error);
}

/** `failureReason` for a `{error}` inside `t.compose`. */
export function failureReasonWith(error: unknown, say: Say): string {
    if (error instanceof GaiaError) return requestFailureWith(error, say);
    return error instanceof Error ? error.message : String(error);
}

/** A failed action as a sentence plus a detail line: the PC's own words go on the detail line, never into the sentence; our own reasons stay inline. */
export function failureNotice(
    error: unknown,
    t: Translate,
    keys: { withReason: MessageKey; noReason: MessageKey },
    params: Params = {},
): { text: string; detail?: string } {
    const detail = requestFailureServerText(error);
    if (detail) return { text: t(keys.noReason, params), detail };
    return { text: t.compose((say) => say(keys.withReason, { ...params, error: failureReasonWith(error, say) })) };
}
