// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ApiError } from '@webui/services/apiErrors';
import { requestErrorText } from '@webui/utils/requestErrors.core';
import { classifyChatError, failureRecordId, type ChatErrorKind } from '@webui/utils/streamErrors.core';

import {
    GaiaApiError,
    GaiaAuthError,
    GaiaConfigError,
    GaiaNetworkError,
    GaiaStreamError,
    GaiaTurnError,
    type GaiaError,
} from '@/api/errors';
import { describeError, type Translate } from '@/i18n/useT';

/** The web client's shape of the same failure, which the shared classifiers read. */
function webError(error: GaiaError): Error {
    if (error instanceof GaiaTurnError) return new Error(error.detail);
    if (error instanceof GaiaApiError) return new ApiError(error.message, error.status, error.detail, null);
    if (error instanceof GaiaNetworkError) return new TypeError('Failed to fetch');
    return new Error(error.message);
}

/** A failed turn in plain words with a next step: the web UI's `chatError.*` text, and what kind of failure it is. */
export function chatErrorInfo(error: GaiaError, t: Translate): { kind: ChatErrorKind; text: string } {
    // These carry their own text: pairing, setup, and a lost view of a turn that may still finish on the PC.
    if (error instanceof GaiaStreamError || error instanceof GaiaConfigError || error instanceof GaiaAuthError) {
        return { kind: 'stream', text: describeError(error, t) };
    }
    return classifyChatError(webError(error), t);
}

export function chatErrorText(error: GaiaError, t: Translate): string {
    return chatErrorInfo(error, t).text;
}

/** The title of the GitHub report the web UI prefills for an unexpected error. */
export function reportTitle(error: GaiaError): string {
    return (webError(error).message || '').slice(0, 80);
}

/** Whether the error names the problem report GAIA saved on the PC for it. */
export function namesFailureRecord(error: GaiaError): boolean {
    return failureRecordId(webError(error).message || '') !== null;
}

/** Why a request (such as a stop) failed, as one line. */
export function requestFailureText(error: GaiaError, t: Translate): string {
    return error instanceof GaiaConfigError || error instanceof GaiaAuthError ? describeError(error, t) : requestErrorText(webError(error), t);
}

/** A stream failure leaves the answer possibly still running on the PC, so asking again would ask twice. */
export function mayStillFinish(error: GaiaError): boolean {
    return error instanceof GaiaStreamError;
}
