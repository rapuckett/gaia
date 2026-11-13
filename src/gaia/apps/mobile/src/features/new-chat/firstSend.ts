// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as messageQueue from '@webui/utils/messageQueue';

export interface FirstSendDeps {
    createSession: () => Promise<{ id: string }>;
    // Resolves false when the chat exists but the first message did not go out.
    deliver: (sessionId: string, text: string) => Promise<boolean | void>;
    queueHeld: (sessionId: string, items: messageQueue.QueuedMessage[]) => void;
    describeError: (err: unknown) => string;
    firstNotSent: string;
}

export interface FirstSendState {
    text: string;
    sending: boolean;
    error: string | null;
}

export interface FirstSend {
    getState: () => FirstSendState;
    subscribe: (listener: () => void) => () => void;
    setText: (text: string) => void;
    submit: () => Promise<void>;
}

// Creates the chat on the first send; messages typed meanwhile wait and follow into it.
export function createFirstSend(deps: FirstSendDeps, initialText = ''): FirstSend {
    let state: FirstSendState = { text: initialText, sending: false, error: null };
    const listeners = new Set<() => void>();
    const held: string[] = [];

    const set = (patch: Partial<FirstSendState>) => {
        state = { ...state, ...patch };
        listeners.forEach((l) => l());
    };

    const run = async (message: string) => {
        set({ sending: true, error: null, text: '' });
        try {
            const session = await deps.createSession();
            const sent = await deps.deliver(session.id, message);
            const waiting = held.splice(0);
            if (waiting.length > 0) {
                const add = (items: messageQueue.QueuedMessage[], text: string) =>
                    sent === false
                        ? [...items, { ...messageQueue.item(text, 'failed'), error: deps.firstNotSent }]
                        : messageQueue.enqueue(items, text, 'queued');
                deps.queueHeld(session.id, waiting.reduce(add, []));
            }
        } catch (err) {
            // Nothing was sent, so every message goes back in the box.
            set({ text: [message, ...held.splice(0)].join('\n\n'), error: deps.describeError(err) });
        } finally {
            set({ sending: false });
        }
    };

    return {
        getState: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setText: (text) => set({ text }),
        submit: async () => {
            const message = state.text.trim();
            if (!message) return;
            if (state.sending) {
                held.push(message);
                set({ text: '' });
                return;
            }
            await run(message);
        },
    };
}
