// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';

import {
    enqueue,
    failDelivered,
    needsOutcome,
    nextToSend,
    notStarted,
    promote,
    reconcile,
    remove,
    returned,
    steerRefused,
    taken,
    type QueuedMessage,
} from '@webui/utils/messageQueue';

import type { GaiaClient, StreamEvent } from '@/api/client.types';
import { GaiaApiError, GaiaConfigError, GaiaError } from '@/api/errors';
import type { MessageKey, Params } from '@webui/i18n/registry';
import { sendTurn, useGaiaClient } from '@/data';

/** Where text typed before its chat exists waits. */
const NEW_CHAT = '';

/** A failed send as plain data: the catalog key and params (and the PC's status and reason), so the row is translated when it is drawn. */
export interface QueueFailure {
    messageKey: MessageKey;
    params: Params;
    status?: number;
    detail?: string;
}

export type HeldMessage = QueuedMessage & { failure?: QueueFailure };

const NONE: HeldMessage[] = [];

/** Our own errors keep their key and params; any other error is just its message, shown as the detail. */
export function failureOf(err: unknown): { error: string; failure?: QueueFailure } {
    if (err instanceof GaiaApiError) {
        return { error: err.detail, failure: { messageKey: err.messageKey, params: err.params, status: err.status, detail: err.detail } };
    }
    if (err instanceof GaiaError) return { error: '', failure: { messageKey: err.messageKey, params: err.params } };
    return { error: err instanceof Error ? err.message : String(err) };
}

function markFailure(items: HeldMessage[], id: number, failure: QueueFailure | undefined): HeldMessage[] {
    return failure ? items.map((m) => (m.id === id && m.state === 'failed' ? { ...m, failure } : m)) : items;
}

interface QueueState {
    byChat: Readonly<Record<string, HeldMessage[]>>;
    /** What is typed in a chat's box; Stop appends the queued texts to it. */
    drafts: Readonly<Record<string, string>>;
}

export const useComposerQueueStore = create<QueueState>(() => ({ byChat: {}, drafts: {} }));

function change(chat: string, edit: (items: HeldMessage[]) => HeldMessage[]): void {
    useComposerQueueStore.setState((state) => ({ byChat: { ...state.byChat, [chat]: edit(state.byChat[chat] ?? NONE) } }));
}

const itemsOf = (chat: string) => useComposerQueueStore.getState().byChat[chat] ?? NONE;

export type SendHeld = (sessionId: string, text: string) => Promise<boolean | void>;

/**
 * Sends the chat's held messages in order. A message that can't go (a turn is
 * already running) waits in line; one whose send failed stays `failed`, and
 * holds back the rest so order is kept.
 */
export async function flushHeld(sessionId: string, send: SendHeld): Promise<void> {
    // Text typed while the chat was being created belongs to it now.
    const early = itemsOf(NEW_CHAT);
    if (early.length) {
        change(NEW_CHAT, () => []);
        change(sessionId, (items) => [...items, ...early]);
    }
    for (let next = nextToSend(itemsOf(sessionId)); next; next = nextToSend(itemsOf(sessionId))) {
        const { id, text } = next;
        change(sessionId, (items) => promote(items, id, 'queued', 'starting'));
        try {
            const sent = await send(sessionId, text);
            if (sent === false) {
                change(sessionId, (items) => notStarted(items, id));
                return;
            }
        } catch (err) {
            const { error, failure } = failureOf(err);
            change(sessionId, (items) => markFailure(notStarted(items, id, error), id, failure));
            return;
        }
        change(sessionId, (items) => remove(items, id));
    }
}

/**
 * Settles messages offered to the finished reply against GAIA's record of it,
 * so none is dropped or sent twice. While a reply still runs, they wait.
 */
export async function settleOffered(client: GaiaClient, sessionId: string): Promise<void> {
    if (!needsOutcome(itemsOf(sessionId))) return;
    try {
        const outcome = await client.getFollowUpOutcome(sessionId);
        change(sessionId, (items) => reconcile(items, outcome));
    } catch (err) {
        if (err instanceof GaiaApiError && err.status === 409) return;
        const { error, failure } = failureOf(err);
        change(sessionId, (items) => {
            const delivered = new Set(items.filter((m) => m.state === 'delivered').map((m) => m.id));
            return failDelivered(items, error).map((m) => (delivered.has(m.id) ? { ...m, failure } : m));
        });
    }
}

/** Folds what the running reply says about messages offered to it into the chat's queue. */
export function applyFollowUpEvent(sessionId: string, event: StreamEvent): void {
    if (event.type === 'followup_taken' && event.text) {
        const text = event.text;
        change(sessionId, (items) => taken(items, text));
    }
    if (event.type === 'followup_returned' && event.texts) {
        const texts = event.texts;
        change(sessionId, (items) => returned(items, texts));
    }
}

export interface ComposerQueue {
    held: HeldMessage[];
    /** Keeps text typed while the chat is being created. */
    hold(text: string): void;
    /** Drops one item. */
    remove(id: number): void;
    /** Puts a failed item back in line. */
    retry(id: number): void;
    /** Offers a queued item to the running reply; it stays queued when the reply can't take it. */
    steer(id: number): void;
    /** The chat's box text. */
    draft: string;
    setDraft(next: string | ((prev: string) => string)): void;
    /** Empties the chat's queue into the end of its box, joined by blank lines. */
    giveBack(): void;
    /** Removes and returns the items held before their chat existed. */
    takeHeld(): HeldMessage[];
    /** Puts in items that already failed to send. */
    queueHeld(sessionId: string, items: HeldMessage[]): void;
    /** Sends now as the chat's next turn; false when a turn is already running. */
    deliver(sessionId: string, text: string): Promise<boolean | void>;
    /** Sends the held items in order once the chat exists. */
    flush(sessionId: string): Promise<void>;
}

export function useComposerQueue(sessionId: string | null): ComposerQueue {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const key = sessionId ?? NEW_CHAT;
    const held = useComposerQueueStore((state) => state.byChat[key] ?? NONE);
    const draft = useComposerQueueStore((state) => state.drafts[key] ?? '');

    const hold = useCallback((text: string) => change(key, (items) => enqueue(items, text, 'queued')), [key]);

    const queueHeld = useCallback((chat: string, items: HeldMessage[]) => change(chat, (list) => [...list, ...items]), []);

    const deliver = useCallback(
        async (chat: string, text: string) => {
            if (!client) throw new GaiaConfigError('mobileApp.error.noConnection');
            return sendTurn({ client, queryClient }, chat, text);
        },
        [client, queryClient],
    );

    const flush = useCallback(
        async (chat: string) => {
            if (client) await settleOffered(client, chat);
            await flushHeld(chat, deliver);
        },
        [client, deliver],
    );

    const dropItem = useCallback((id: number) => change(key, (items) => remove(items, id)), [key]);

    const retry = useCallback((id: number) => change(key, (items) => promote(items, id, 'failed', 'queued')), [key]);

    const steer = useCallback(
        (id: number) => {
            const item = itemsOf(key).find((m) => m.id === id && m.state === 'queued');
            if (!item || !client) return;
            change(key, (items) => promote(items, id, 'queued', 'sending'));
            client.sendFollowUp(key, item.text).then(
                () => change(key, (items) => promote(items, id, 'sending', 'delivered')),
                () => change(key, (items) => steerRefused(items, id)),
            );
        },
        [client, key],
    );

    const setDraft = useCallback(
        (next: string | ((prev: string) => string)) =>
            useComposerQueueStore.setState((state) => {
                const prev = state.drafts[key] ?? '';
                return { drafts: { ...state.drafts, [key]: typeof next === 'function' ? next(prev) : next } };
            }),
        [key],
    );

    const giveBack = useCallback(() => {
        const texts = itemsOf(key).map((m) => m.text);
        if (texts.length === 0) return;
        change(key, () => []);
        setDraft((prev) => [prev.trim(), ...texts].filter(Boolean).join('\n\n'));
    }, [key, setDraft]);

    const takeHeld = useCallback(() => {
        const items = itemsOf(NEW_CHAT);
        change(NEW_CHAT, () => []);
        return items;
    }, []);

    return { held, hold, remove: dropItem, retry, steer, draft, setDraft, giveBack, takeHeld, queueHeld, deliver, flush };
}

/** Keeps the chat's queue in step with the running reply's follow-up events. */
export function useFollowUpEvents(sessionId: string, events: readonly StreamEvent[]): { unavailable: boolean } {
    const seen = useRef(0);
    useEffect(() => {
        if (events.length < seen.current) seen.current = 0;
        for (const event of events.slice(seen.current)) applyFollowUpEvent(sessionId, event);
        seen.current = events.length;
    }, [sessionId, events]);
    return { unavailable: events.some((e) => e.type === 'followup_unavailable') };
}
