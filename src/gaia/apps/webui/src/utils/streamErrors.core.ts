// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ApiError, parseErrorDetail, StreamTimeoutError, type StreamDroppedError } from '../services/apiErrors';
import { isolate } from '../i18n/registry';
import type { Translate } from '../i18n/translator';

/** How many times a turn's lost stream is re-attached before the view gives up. */
export const MAX_STREAM_RECONNECTS = 3;

/** Wait before each re-attach: the first is immediate, later ones span a backend restart (~13 s in all). */
export const RECONNECT_DELAYS_MS = [0, 3_000, 10_000];

/** The connection died while the run may still be going server-side, so re-attaching can recover it. */
export function isStreamInterrupted(err: Error): boolean {
    return err.name === 'StreamStalledError' || err.name === 'StreamDroppedError';
}

/** The last re-attach never reached GAIA, so no run there can still be answering. */
export function isGaiaUnreachable(err: Error): boolean {
    return err.name === 'StreamDroppedError' && (err as StreamDroppedError).unreachable === true;
}

/** The view lost the turn, but its run may still finish server-side; resending would ask twice. */
export function mayStillFinish(err: Error): boolean {
    if (isGaiaUnreachable(err)) return false;
    return isStreamInterrupted(err) || err instanceof StreamTimeoutError;
}

/** The backend's own words for a refused message, to show on a line of their own beside `describeStreamError`'s sentence. */
export function streamErrorDetail(err: Error): string | undefined {
    if (!(err instanceof ApiError) || err.httpStatus === 429 || err.httpStatus === 409) return undefined;
    return (err.detail ? parseErrorDetail(err.detail) : '') || undefined;
}

/** A sentence with the backend's words after it, isolated, for a place that holds one string. */
export function withDetail(text: string, detail: string | undefined): string {
    return detail ? `${text} ${isolate(detail, 'ltr')}` : text;
}

/**
 * Plain words and a next step for a chat-stream failure the client can name,
 * or null to leave the message to the caller's generic handling.
 */
export function describeStreamError(err: Error, t: Translate): string | null {
    if (isGaiaUnreachable(err)) return t('chatError.gaiaStopped');
    if (isStreamInterrupted(err)) return t('chatError.liveViewLost', { n: MAX_STREAM_RECONNECTS + 1 });
    if (err instanceof StreamTimeoutError) {
        return t(err.endpoint === 'send' ? 'chatError.sendTimeout' : 'chatError.attachTimeout', { seconds: Math.round(err.timeoutMs / 1000) });
    }
    if (err instanceof ApiError) {
        if (err.httpStatus === 429) return t('chatError.busy');
        if (err.httpStatus === 409) return (err.detail ? parseErrorDetail(err.detail) : '') || t('chatError.alreadyAnswering');
        return t('chatError.notTaken', { http: isolate(`HTTP ${err.httpStatus}`, 'ltr') });
    }
    return null;
}

export type ChatErrorKind = 'stream' | 'context' | 'model_server' | 'connection' | 'timeout' | 'unknown';

/** `detail` is the backend's own text, kept off the sentence so a screen can show it on its own line. */
export interface ChatErrorInfo {
    kind: ChatErrorKind;
    text: string;
    detail?: string;
}

const CONTEXT_RE = /context (window|size|length|limit)|exceeds the available context|maximum context|too many tokens/i;
const MODEL_SERVER_RE = /lemonade|\bLLM\b|could not get response/i;
const CONNECTION_RE = /failed to fetch|networkerror|\bfetch\b/i;
const TIMEOUT_RE = /timed out|timeout/i;

/** The id a failed answer names its saved problem report by (`RECORD_ID_RE` in failure_record.py). */
const FAILURE_RECORD_RE = /\bGF-\d{8}-\d{6}-[0-9a-f]{4}\b/;

export function failureRecordId(text: string): string | null {
    return FAILURE_RECORD_RE.exec(text)?.[0] ?? null;
}

/**
 * What a failed chat turn tells the user: the cause in plain words and what to
 * do next. Never the raw error text, which goes to the console log instead,
 * except the name of the problem report the server saved for it.
 */
export function classifyChatError(err: Error, t: Translate): ChatErrorInfo {
    const cause = chatErrorCause(err, t);
    const record = failureRecordId(err.message || '');
    const detail = streamErrorDetail(err);
    const info: ChatErrorInfo = detail ? { ...cause, detail } : cause;
    return record ? { ...info, text: `${cause.text}\n\n${t('chatError.savedReport', { id: record })}` } : info;
}

function chatErrorCause(err: Error, t: Translate): ChatErrorInfo {
    const described = describeStreamError(err, t);
    if (described) return { kind: 'stream', text: described };
    const msg = err.message || '';
    if (CONTEXT_RE.test(msg)) return { kind: 'context', text: t('chatError.context') };
    if (MODEL_SERVER_RE.test(msg)) return { kind: 'model_server', text: t('chatError.modelServer') };
    if (err instanceof TypeError || CONNECTION_RE.test(msg)) return { kind: 'connection', text: t('chatError.connection') };
    if (TIMEOUT_RE.test(msg)) return { kind: 'timeout', text: t('chatError.timeout') };
    return { kind: 'unknown', text: t('chatError.unknown') };
}
