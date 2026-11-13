// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { create } from 'zustand';

import { enqueue, nextToSend, notStarted, promote, remove, type QueuedMessage } from '@webui/utils/messageQueue';

import { GaiaConfigError } from '@/api/errors';
import { sendTurn, useGaiaClient } from '@/data';

/** Where text typed before its chat exists waits. */
const NEW_CHAT = '';

const NONE: QueuedMessage[] = [];

interface QueueState {
    byChat: Readonly<Record<string, QueuedMessage[]>>;
}

export const useComposerQueueStore = create<QueueState>(() => ({ byChat: {} }));

function change(chat: string, edit: (items: QueuedMessage[]) => QueuedMessage[]): void {
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
            const error = err instanceof Error ? err.message : String(err);
            change(sessionId, (items) => notStarted(items, id, error));
            return;
        }
        change(sessionId, (items) => remove(items, id));
    }
}

export interface ComposerQueue {
    held: QueuedMessage[];
    /** Keeps text typed while the chat is being created. */
    hold(text: string): void;
    /** Puts in items that already failed to send. */
    queueHeld(sessionId: string, items: QueuedMessage[]): void;
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

    const hold = useCallback((text: string) => change(key, (items) => enqueue(items, text, 'queued')), [key]);

    const queueHeld = useCallback((chat: string, items: QueuedMessage[]) => change(chat, (list) => [...list, ...items]), []);

    const deliver = useCallback(
        async (chat: string, text: string) => {
            if (!client) throw new GaiaConfigError('mobileApp.error.noConnection');
            return sendTurn({ client, queryClient }, chat, text);
        },
        [client, queryClient],
    );

    const flush = useCallback((chat: string) => flushHeld(chat, deliver), [deliver]);

    return { held, hold, queueHeld, deliver, flush };
}
