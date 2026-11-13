// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Message, Session, StreamEvent } from '@webui/types';

import type { FetchLike, FetchRequestInit, FetchResponseLike } from '@/platform/fetch.types';

import {
    GaiaApiError,
    GaiaAuthError,
    GaiaConfigError,
    GaiaNetworkError,
    GaiaStreamError,
    parseErrorDetail,
} from './errors';
import type { GaiaClient, HealthResponse, MessageList, RequestOptions, SessionList } from './client.types';
import {
    ENDPOINTS,
    MESSAGE_PAGE_SIZE,
    SESSION_PAGE_SIZE,
    sessionMessagesPath,
    UI_HEADERS,
} from './constants';
import { parseSseStream } from './sse';

export interface HttpClientConfig {
    baseUrl: string;
    token?: string | null;
    fetch: FetchLike;
}

function normalizeBaseUrl(baseUrl: string): string {
    let url: URL;
    try {
        url = new URL(baseUrl);
    } catch (cause) {
        throw new GaiaConfigError('mobileApp.error.badAddress', { address: baseUrl }, { cause });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new GaiaConfigError('mobileApp.error.badScheme', { address: baseUrl });
    }
    return baseUrl.replace(/\/+$/, '');
}

export function createHttpClient(config: HttpClientConfig): GaiaClient {
    const base = normalizeBaseUrl(config.baseUrl);
    const { token, fetch } = config;

    function headers(hasBody: boolean): Record<string, string> {
        return {
            ...UI_HEADERS,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        };
    }

    async function request(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<FetchResponseLike> {
        const url = `${base}${path}`;
        const init: FetchRequestInit = {
            method,
            headers: headers(body !== undefined),
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            ...(signal ? { signal } : {}),
        };
        let res: FetchResponseLike;
        try {
            res = await fetch(url, init);
        } catch (err) {
            if (signal?.aborted) throw err;
            throw new GaiaNetworkError(url, err);
        }
        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            const detail = parseErrorDetail(errorText);
            throw res.status === 401 ? new GaiaAuthError(detail) : new GaiaApiError(res.status, detail);
        }
        return res;
    }

    async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
        const res = await request('GET', path, undefined, signal);
        const text = await res.text();
        try {
            return JSON.parse(text) as T;
        } catch {
            throw new GaiaApiError(res.status, text.slice(0, 200), 'mobileApp.error.notJson', { path });
        }
    }

    return {
        health(options?: RequestOptions) {
            return getJson<HealthResponse>(ENDPOINTS.health, options?.signal);
        },

        async listSessions(options?: RequestOptions): Promise<SessionList> {
            const byId = new Map<string, Session>();
            let total = 0;
            for (let offset = 0; ; offset += SESSION_PAGE_SIZE) {
                const page = await getJson<SessionList>(
                    `${ENDPOINTS.sessions}?limit=${SESSION_PAGE_SIZE}&offset=${offset}`,
                    options?.signal,
                );
                total = page.total;
                // A chat updated between two page reads can shift into both.
                for (const s of page.sessions) if (!byId.has(s.id)) byId.set(s.id, s);
                if (page.sessions.length < SESSION_PAGE_SIZE || offset + SESSION_PAGE_SIZE >= total) break;
            }
            return { sessions: [...byId.values()], total };
        },

        async getMessages(sessionId: string, options?: RequestOptions): Promise<MessageList> {
            const path = sessionMessagesPath(sessionId);
            const first = await getJson<MessageList>(`${path}?limit=${MESSAGE_PAGE_SIZE}&offset=0`, options?.signal);
            const messages: Message[] = [...first.messages];
            // Bounded to the first page's total: a running agent may keep appending.
            while (messages.length < first.total) {
                const limit = Math.min(MESSAGE_PAGE_SIZE, first.total - messages.length);
                const page = await getJson<MessageList>(`${path}?limit=${limit}&offset=${messages.length}`, options?.signal);
                if (page.messages.length === 0) {
                    throw new GaiaApiError(200, 'empty page', 'mobileApp.error.incompleteTranscript');
                }
                messages.push(...page.messages);
            }
            return { messages, total: first.total };
        },

        async *sendMessage(sessionId: string, message: string, options?: RequestOptions): AsyncGenerator<StreamEvent> {
            const res = await request(
                'POST',
                ENDPOINTS.chatSend,
                { session_id: sessionId, message, stream: true },
                options?.signal,
            );
            if (!res.body) {
                throw new GaiaStreamError('mobileApp.error.noBody');
            }
            let finished = false;
            try {
                for await (const event of parseSseStream(res.body)) {
                    if (event.type === 'done' || event.type === 'error') finished = true;
                    yield event;
                }
            } catch (err) {
                if (options?.signal?.aborted || err instanceof GaiaStreamError) throw err;
                throw new GaiaStreamError('mobileApp.error.streamBroke', {}, { cause: err });
            }
            if (!finished) {
                throw new GaiaStreamError('mobileApp.error.streamClosed');
            }
        },
    };
}
