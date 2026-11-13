// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { hashKey, notifyManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import type { GaiaClient, MessageList, StreamEvent } from '@/api/client.types';
import { asGaiaError, GaiaApiError, GaiaConfigError, type GaiaError } from '@/api/errors';
import {
    applyEvent,
    beginTurn,
    IDLE_TURN,
    openTurn,
    readTurn,
    useChatStreamStore,
    writeTurn,
    type ChatStreamStatus,
    type ChatTurn,
    type PermissionRequest,
    type QuestionRequest,
} from '@/state/chatStreams';

import { useGaiaClient } from './GaiaClientProvider';
import { queryKeys } from './queries';

export type { ChatStreamStatus, PermissionRequest, QuestionRequest } from '@/state/chatStreams';

export interface ChatStreamDeps {
    client: GaiaClient;
    queryClient: QueryClient;
}

/** This phone's view of one chat's turn. Aborting it leaves the turn running on the PC. */
interface Run {
    readonly kind: 'send' | 'attach';
    readonly view: AbortController;
    /** An event arrived, so the turn exists on the PC and a stop can reach it. */
    sawEvent: boolean;
    stopRequested: boolean;
}

const runs = new Map<string, Run>();
const subscribers = new Map<string, number>();

function isCurrent(sessionId: string, run: Run): boolean {
    return runs.get(sessionId) === run;
}

function update(sessionId: string, run: Run, change: (turn: ChatTurn) => ChatTurn): void {
    if (isCurrent(sessionId, run)) writeTurn(sessionId, change(readTurn(sessionId)));
}

function newRun(kind: Run['kind']): Run {
    return { kind, view: new AbortController(), sawEvent: false, stopRequested: false };
}

function refreshChat(queryClient: QueryClient, sessionId: string): Promise<void> {
    void queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    return queryClient.invalidateQueries({ queryKey: queryKeys.messages(sessionId) });
}

/**
 * Re-reads the chat, then runs `end` in the same batch as the transcript's own
 * update, so a screen never shows the finished reply twice or not at all.
 */
async function endWithTranscript(queryClient: QueryClient, sessionId: string, end: () => void): Promise<void> {
    const transcript = hashKey(queryKeys.messages(sessionId));
    let unsubscribe = () => {};
    let ended = false;
    const once = () => {
        if (ended) return;
        ended = true;
        unsubscribe();
        end();
    };
    unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        // Cache events arrive inside the batch that notifies the transcript's readers, so this joins it.
        if (event.type === 'updated' && event.action.type === 'success' && event.query.queryHash === transcript) {
            notifyManager.schedule(once);
        }
    });
    await refreshChat(queryClient, sessionId);
    // Nothing re-read it (no screen shows it) or the read failed.
    notifyManager.schedule(once);
}

/** The sent message, shown in the transcript until the re-read brings GAIA's own copy. */
async function showSentMessage(queryClient: QueryClient, sessionId: string, content: string): Promise<void> {
    const key = queryKeys.messages(sessionId);
    if (!queryClient.getQueryData<MessageList>(key)) return;
    // A read already in flight would land on top of it.
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData<MessageList>(key, (list) =>
        list && {
            messages: [
                ...list.messages,
                {
                    id: -Date.now(),
                    session_id: sessionId,
                    role: 'user',
                    content,
                    created_at: new Date().toISOString(),
                    rag_sources: null,
                },
            ],
            total: list.total + 1,
        },
    );
}

function requestStop(deps: ChatStreamDeps, sessionId: string, run: Run): void {
    deps.client.cancelChat(sessionId).catch((err: unknown) => {
        if (!isCurrent(sessionId, run)) return;
        // The turn ended before the stop reached it; its closing `done` is on the way.
        if (err instanceof GaiaApiError && err.status === 404) return;
        run.stopRequested = false;
        update(sessionId, run, (turn) => ({ ...turn, status: 'streaming', error: asGaiaError(err) }));
    });
}

async function follow(deps: ChatStreamDeps, sessionId: string, run: Run, stream: AsyncIterable<StreamEvent>) {
    try {
        for await (const event of stream) {
            if (!isCurrent(sessionId, run)) return;
            if (!run.sawEvent) {
                run.sawEvent = true;
                update(sessionId, run, openTurn);
                if (run.stopRequested) requestStop(deps, sessionId, run);
            }
            update(sessionId, run, (turn) => applyEvent(turn, event));
        }
    } catch (err) {
        if (!isCurrent(sessionId, run)) return;
        const error = asGaiaError(err);
        update(sessionId, run, (turn) => ({
            ...turn,
            status: 'idle',
            pendingPermission: null,
            pendingQuestion: null,
            error,
        }));
        runs.delete(sessionId);
        // Drops the sent message if GAIA never took it, or shows what it saved.
        void refreshChat(deps.queryClient, sessionId);
        return;
    }
    if (!isCurrent(sessionId, run)) return;
    if (!run.sawEvent) {
        runs.delete(sessionId);
        // No turn is running, but one that ended just now may be missing from a transcript read before it.
        void deps.queryClient.invalidateQueries({ queryKey: queryKeys.messages(sessionId) }, { cancelRefetch: false });
        return;
    }
    await endWithTranscript(deps.queryClient, sessionId, () => {
        if (!isCurrent(sessionId, run)) return;
        runs.delete(sessionId);
        const { error } = readTurn(sessionId);
        writeTurn(sessionId, error ? { ...IDLE_TURN, error } : null);
    });
}

/** Starts a turn; false when the text is empty or a turn is already running in this chat. */
export function sendTurn(deps: ChatStreamDeps, sessionId: string, text: string): boolean {
    const message = text.trim();
    if (!message) return false;
    const existing = runs.get(sessionId);
    // A reattach that hasn't found a running turn gives way to a new one.
    if (existing && (existing.kind !== 'attach' || existing.sawEvent)) return false;
    existing?.view.abort();
    const run = newRun('send');
    runs.set(sessionId, run);
    writeTurn(sessionId, beginTurn());
    void (async () => {
        await showSentMessage(deps.queryClient, sessionId, message);
        if (!isCurrent(sessionId, run)) return;
        await follow(deps, sessionId, run, deps.client.sendMessage(sessionId, message, { signal: run.view.signal }));
    })();
    return true;
}

/** Asks GAIA to stop the chat's turn. The stream stays open until GAIA closes the turn. */
export function stopTurn(deps: ChatStreamDeps, sessionId: string): void {
    const run = runs.get(sessionId);
    const { status } = readTurn(sessionId);
    if (!run || run.stopRequested || (status !== 'connecting' && status !== 'streaming')) return;
    run.stopRequested = true;
    update(sessionId, run, (turn) => ({ ...turn, status: 'stopping' }));
    // Before its first event the turn may not exist on the PC yet; the stop goes out with that event.
    if (run.sawEvent) requestStop(deps, sessionId, run);
}

/** Follows the chat's running turn, if it has one; the turn shows once its replay arrives. */
export function attachTurn(deps: ChatStreamDeps, sessionId: string): void {
    if (runs.has(sessionId)) return;
    const run = newRun('attach');
    runs.set(sessionId, run);
    void follow(deps, sessionId, run, deps.client.attachToRun(sessionId, { signal: run.view.signal }));
}

/** Stops following the chat's turn on this phone; the turn goes on on the PC. */
export function detachTurn(sessionId: string): void {
    runs.get(sessionId)?.view.abort();
    runs.delete(sessionId);
    writeTurn(sessionId, null);
}

function subscribe(deps: ChatStreamDeps, sessionId: string): () => void {
    subscribers.set(sessionId, (subscribers.get(sessionId) ?? 0) + 1);
    attachTurn(deps, sessionId);
    return () => {
        const left = (subscribers.get(sessionId) ?? 1) - 1;
        if (left > 0) {
            subscribers.set(sessionId, left);
            return;
        }
        subscribers.delete(sessionId);
        detachTurn(sessionId);
    };
}

export interface ChatStream {
    /** Sends a message; false when the text is empty or a turn is already running here. */
    send(text: string): boolean;
    /** Asks GAIA to stop the running turn. */
    stop(): void;
    status: ChatStreamStatus;
    /** The answer so far; it stays until the transcript holds the finished turn. */
    liveText: string;
    /** The agent's activity in order (status, thinking, tools, plans...). */
    events: readonly StreamEvent[];
    /** Answer it with useConfirmTool. */
    pendingPermission: PermissionRequest | null;
    /** Answer it with useAnswerQuestion. */
    pendingQuestion: QuestionRequest | null;
    /** Why the last send, stop or stream failed; cleared by the next send. */
    error: GaiaError | null;
}

/**
 * The chat's live turn. Every screen showing the chat shares one connection;
 * opening a chat whose turn is still running picks it up from its start.
 */
export function useChatStream(sessionId: string): ChatStream {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const turn = useChatStreamStore((state) => state.turns[sessionId] ?? IDLE_TURN);

    useEffect(() => {
        if (!client) return undefined;
        return subscribe({ client, queryClient }, sessionId);
    }, [client, queryClient, sessionId]);

    const send = useCallback(
        (text: string) => {
            if (client) return sendTurn({ client, queryClient }, sessionId, text);
            writeTurn(sessionId, { ...readTurn(sessionId), error: new GaiaConfigError('mobileApp.error.noConnection') });
            return false;
        },
        [client, queryClient, sessionId],
    );

    const stop = useCallback(() => {
        if (client) stopTurn({ client, queryClient }, sessionId);
    }, [client, queryClient, sessionId]);

    return useMemo(
        () => ({
            send,
            stop,
            status: turn.status,
            liveText: turn.liveText,
            events: turn.events,
            pendingPermission: turn.pendingPermission,
            pendingQuestion: turn.pendingQuestion,
            error: turn.error,
        }),
        [send, stop, turn],
    );
}
