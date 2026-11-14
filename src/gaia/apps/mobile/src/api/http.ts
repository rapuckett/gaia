// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Message, ResourceUsage, Session, StartScreen, StreamEvent, SystemStatus } from '@webui/types';
import { fromApiMessages } from '@webui/utils/chatStream';

import type { FetchLike, FetchRequestInit, FetchResponseLike } from '@/platform/fetch.types';

import {
    GaiaApiError,
    GaiaAuthError,
    GaiaConfigError,
    GaiaNetworkError,
    GaiaStreamDroppedError,
    GaiaStreamError,
    GaiaStreamTimeoutError,
    parseErrorDetail,
    type StreamEndpoint,
} from './errors';
import type {
    AgentCapabilities,
    AgentMcpList,
    CancelChatResult,
    ConfirmToolResult,
    ConnectorList,
    DeleteMessagesResult,
    DeleteScheduleResult,
    DocumentListResponse,
    FollowUpOutcome,
    FollowUpResult,
    GaiaClient,
    HealthResponse,
    LocalModelStatus,
    MessageList,
    ModelNeed,
    RestartModelResult,
    RequestOptions,
    ParsedSchedule,
    Schedule,
    ScheduleList,
    SessionList,
    SessionSearchResponse,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    UserInputResult,
} from './client.types';
import {
    ATTACH_HEADER_TIMEOUT_MS,
    ENDPOINTS,
    followupOutcomePath,
    MESSAGE_PAGE_SIZE,
    QUEUED_IDLE_MS,
    schedulePath,
    scheduleRunPath,
    SEND_HEADER_TIMEOUT_MS,
    SESSION_PAGE_SIZE,
    sessionCapabilitiesPath,
    sessionDocumentPath,
    sessionMessagePath,
    sessionMessagesAndBelowPath,
    sessionMessagesPath,
    sessionPath,
    sessionPrivatePath,
    setupNeedsPath,
    STREAM_IDLE_MS,
    UI_HEADERS,
} from './constants';
import { parseSseStream } from './sse';

export interface HttpClientConfig {
    baseUrl: string;
    token?: string | null;
    fetch: FetchLike;
}

interface HeaderLimit {
    endpoint: StreamEndpoint;
    ms: number;
    abort: () => void;
}

/** The address without trailing slashes; GaiaConfigError when it isn't an http(s) URL. */
export function normalizeBaseUrl(baseUrl: string): string {
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

// A non-recoverable agent_error ends the turn; the closing `done` may never come.
function endsTurn(event: StreamEvent): boolean {
    return event.type === 'done' || event.type === 'error' || (event.type === 'agent_error' && event.recoverable !== true);
}

// A turn waiting in line for the model only speaks when its place changes.
function idleLimit(last: StreamEvent | undefined): number {
    return last?.type === 'status' && last.phase === 'queued' ? QUEUED_IDLE_MS : STREAM_IDLE_MS;
}

function within<T>(limit: HeaderLimit, pending: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            limit.abort();
            reject(new GaiaStreamTimeoutError(limit.endpoint, limit.ms));
        }, limit.ms);
    });
    return Promise.race([pending, expired]).finally(() => clearTimeout(timer));
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

    async function request(
        method: string,
        path: string,
        body: unknown,
        signal?: AbortSignal,
        headerLimit?: HeaderLimit,
    ): Promise<FetchResponseLike> {
        const url = `${base}${path}`;
        const init: FetchRequestInit = {
            method,
            headers: headers(body !== undefined),
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            ...(signal ? { signal } : {}),
        };
        let res: FetchResponseLike;
        try {
            const pending = fetch(url, init);
            res = await (headerLimit ? within(headerLimit, pending) : pending);
        } catch (err) {
            if (err instanceof GaiaStreamTimeoutError || signal?.aborted) throw err;
            throw new GaiaNetworkError(url, err);
        }
        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            const detail = parseErrorDetail(errorText);
            throw res.status === 401 ? new GaiaAuthError(detail) : new GaiaApiError(res.status, detail);
        }
        return res;
    }

    async function readJson<T>(res: FetchResponseLike, path: string): Promise<T> {
        const text = await res.text();
        try {
            return JSON.parse(text) as T;
        } catch {
            throw new GaiaApiError(res.status, text.slice(0, 200), 'mobileApp.error.notJson', { path });
        }
    }

    async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
        return readJson<T>(await request('GET', path, undefined, signal), path);
    }

    async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
        return readJson<T>(await request('POST', path, body, signal), path);
    }

    async function patchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
        return readJson<T>(await request('PATCH', path, undefined, signal), path);
    }

    async function deleteJson<T>(path: string, signal?: AbortSignal): Promise<T> {
        return readJson<T>(await request('DELETE', path, undefined, signal), path);
    }

    async function putJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
        return readJson<T>(await request('PUT', path, body, signal), path);
    }

    async function* streamTurn(
        method: 'GET' | 'POST',
        path: string,
        body: unknown,
        endpoint: StreamEndpoint,
        headerMs: number,
        signal?: AbortSignal,
    ): AsyncGenerator<StreamEvent> {
        // One controller drops the connection whether the caller left, the headers or the stream timed out.
        const connection = new AbortController();
        const drop = () => connection.abort();
        if (signal?.aborted) drop();
        else signal?.addEventListener('abort', drop);
        let ended = false;
        try {
            let res: FetchResponseLike;
            try {
                res = await request(method, path, body, connection.signal, { endpoint, ms: headerMs, abort: drop });
            } catch (err) {
                // No turn is running: its answer, if it had one, is already saved.
                if (endpoint === 'attach' && err instanceof GaiaApiError && err.status === 404) return;
                throw err;
            }
            if (!res.body) {
                throw new GaiaStreamError('mobileApp.error.noBody');
            }
            try {
                for await (const event of parseSseStream(res.body, idleLimit)) {
                    if (endsTurn(event)) ended = true;
                    yield event;
                }
            } catch (err) {
                if (signal?.aborted) throw err;
                // The turn already ended; a connection that dies or goes quiet after that changes nothing.
                if (ended) return;
                if (err instanceof GaiaStreamError) throw err;
                throw new GaiaStreamDroppedError(err);
            }
            if (!ended) {
                throw new GaiaStreamError('mobileApp.error.streamClosed');
            }
        } finally {
            signal?.removeEventListener('abort', drop);
            // Closes a connection left open; after a body read to its end this does nothing.
            drop();
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

        getSession(sessionId, options) {
            return getJson<Session>(sessionPath(sessionId), options?.signal);
        },

        createSession(request = {}, options) {
            return postJson<Session>(ENDPOINTS.sessions, request, options?.signal);
        },

        getFollowUpOutcome(sessionId, options) {
            return getJson<FollowUpOutcome>(followupOutcomePath(sessionId), options?.signal);
        },

        searchSessions(query: string, includeAutomated: boolean, options?: RequestOptions): Promise<SessionSearchResponse> {
            const params = new URLSearchParams({ q: query, include_automated: String(includeAutomated) });
            return getJson<SessionSearchResponse>(`${ENDPOINTS.sessionSearch}?${params}`, options?.signal);
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
            return { messages: fromApiMessages(messages), total: first.total };
        },

        sendFollowUp(sessionId, text, options) {
            return postJson<FollowUpResult>(ENDPOINTS.chatFollowup, { session_id: sessionId, text }, options?.signal);
        },

        updateSession(sessionId, update, options) {
            return putJson<Session>(sessionPath(sessionId), update, options?.signal);
        },

        toggleSessionPrivate(sessionId, options) {
            return patchJson<Session>(sessionPrivatePath(sessionId), options?.signal);
        },

        async detachDocument(sessionId, docId, options) {
            await request('DELETE', sessionDocumentPath(sessionId, docId), undefined, options?.signal);
        },

        getCapabilities(sessionId, options) {
            return getJson<AgentCapabilities>(sessionCapabilitiesPath(sessionId), options?.signal);
        },

        getResourceUsage(options) {
            return getJson<ResourceUsage>(ENDPOINTS.systemResources, options?.signal);
        },

        sendMessage(sessionId, message, options) {
            const body = { session_id: sessionId, message, stream: true };
            return streamTurn('POST', ENDPOINTS.chatSend, body, 'send', SEND_HEADER_TIMEOUT_MS, options?.signal);
        },

        attachToRun(sessionId, options) {
            const path = `${ENDPOINTS.chatAttach}?session_id=${encodeURIComponent(sessionId)}`;
            return streamTurn('GET', path, undefined, 'attach', ATTACH_HEADER_TIMEOUT_MS, options?.signal);
        },

        deleteMessage(sessionId, messageId, options) {
            return deleteJson<{ deleted: boolean }>(sessionMessagePath(sessionId, messageId), options?.signal);
        },

        deleteMessagesFrom(sessionId, messageId, options) {
            return deleteJson<DeleteMessagesResult>(sessionMessagesAndBelowPath(sessionId, messageId), options?.signal);
        },

        cancelChat(sessionId, options) {
            return postJson<CancelChatResult>(ENDPOINTS.chatCancel, { session_id: sessionId }, options?.signal);
        },

        confirmTool(request, options) {
            const body = {
                session_id: request.session_id,
                approved: request.approved,
                always: request.always ?? false,
                ...(request.confirm_id ? { confirm_id: request.confirm_id } : {}),
            };
            return postJson<ConfirmToolResult>(ENDPOINTS.chatConfirmTool, body, options?.signal);
        },

        sendUserInput(request, options) {
            const body = { session_id: request.session_id, request_id: request.request_id, value: request.value };
            return postJson<UserInputResult>(ENDPOINTS.chatUserInput, body, options?.signal);
        },

        listConnectors(options) {
            return getJson<ConnectorList>(ENDPOINTS.connectors, options?.signal);
        },

        listAgentMcps(options) {
            return getJson<AgentMcpList>(ENDPOINTS.connectorsAgentMcps, options?.signal);
        },

        listSchedules(options) {
            return getJson<ScheduleList>(ENDPOINTS.schedules, options?.signal);
        },

        createSchedule(request, options) {
            return postJson<Schedule>(ENDPOINTS.schedules, request, options?.signal);
        },

        parseSchedule(input, timezone, options) {
            return postJson<ParsedSchedule>(ENDPOINTS.scheduleParse, { input, timezone }, options?.signal);
        },

        updateScheduleStatus(name, status, options) {
            return putJson<Schedule>(schedulePath(name), { status }, options?.signal);
        },

        runSchedule(name, options) {
            return postJson<Schedule>(scheduleRunPath(name), undefined, options?.signal);
        },

        deleteSchedule(name, options) {
            return deleteJson<DeleteScheduleResult>(schedulePath(name), options?.signal);
        },

        listDocuments(options) {
            return getJson<DocumentListResponse>(ENDPOINTS.documents, options?.signal);
        },

        getSystemStatus(options) {
            return getJson<SystemStatus>(ENDPOINTS.systemStatus, options?.signal);
        },

        getLocalModelStatus(options) {
            return getJson<LocalModelStatus>(ENDPOINTS.localModelStatus, options?.signal);
        },

        restartLocalModel(confirm, options) {
            return postJson<RestartModelResult>(ENDPOINTS.localModelRestart, { confirm }, options?.signal);
        },

        getModelNeed(job, options) {
            return getJson<ModelNeed>(setupNeedsPath(job), options?.signal);
        },

        downloadSetupModel(modelId, acknowledgeLowDisk, options) {
            return postJson<SetupRunStatus>(
                ENDPOINTS.setupModelDownload,
                { model_id: modelId, acknowledge_low_disk: acknowledgeLowDisk, keep_trying: false },
                options?.signal,
            );
        },

        getSetupStatus(options) {
            return getJson<SetupRunStatus>(ENDPOINTS.setupStatus, options?.signal);
        },

        cancelSetup(modelId, options) {
            return postJson<{ cancelled: boolean }>(ENDPOINTS.setupCancel, { model_id: modelId }, options?.signal);
        },

        getStartScreen(options) {
            return getJson<StartScreen>(ENDPOINTS.onboardingStart, options?.signal);
        },

        checkSetup(skipChatModel, options) {
            return getJson<SetupCheck>(`${ENDPOINTS.setupCheck}?skip_chat_model=${skipChatModel}`, options?.signal);
        },

        getSetupPlan(options) {
            return getJson<SetupPlan>(ENDPOINTS.setupPlan, options?.signal);
        },

        startSetup(skipChatModel, gaiaLemonade = false, options = {}) {
            return postJson<SetupRunStatus>(
                ENDPOINTS.setupRun,
                {
                    skip_chat_model: skipChatModel,
                    gaia_lemonade: gaiaLemonade,
                    acknowledge_low_disk: !!options.acknowledgeLowDisk,
                    keep_trying: !!options.keepTrying,
                    extra_models: options.extraModels ?? [],
                    server_only: !!options.serverOnly,
                    upgrade_embedded: !!options.upgradeEmbedded,
                },
                options.signal,
            );
        },
    };
}
