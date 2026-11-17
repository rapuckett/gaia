// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { enqueue } from '@webui/utils/messageQueue';

import { GaiaNetworkError } from '@/api/errors';

import { flushHeld, useComposerQueueStore } from './composerQueue';

const NEW_CHAT = '';
const queue = (chat: string) => useComposerQueueStore.getState().byChat[chat] ?? [];

function hold(chat: string, text: string) {
    useComposerQueueStore.setState((s) => ({ byChat: { ...s.byChat, [chat]: enqueue(queue(chat), text, 'queued') } }));
}

describe('flushHeld', () => {
    beforeEach(() => useComposerQueueStore.setState({ byChat: {} }));

    it('sends text held before the chat existed, in order, and empties the queue', async () => {
        hold(NEW_CHAT, 'first');
        hold(NEW_CHAT, 'second');
        const sent: string[] = [];
        await flushHeld('chat-1', async (_id, text) => void sent.push(text));
        expect(sent).toEqual(['first', 'second']);
        expect(queue('chat-1')).toEqual([]);
        expect(queue(NEW_CHAT)).toEqual([]);
    });

    it('keeps a message whose send failed, and holds back the ones behind it', async () => {
        hold(NEW_CHAT, 'first');
        hold(NEW_CHAT, 'second');
        const send = jest.fn().mockRejectedValue(new Error('no connection'));
        await flushHeld('chat-1', send);
        expect(send).toHaveBeenCalledTimes(1);
        expect(queue('chat-1').map((m) => [m.text, m.state, m.error])).toEqual([
            ['first', 'failed', 'no connection'],
            ['second', 'queued', undefined],
        ]);
    });

    it('keeps a failed send as translatable data, not the error message text', async () => {
        hold(NEW_CHAT, 'first');
        await flushHeld('chat-1', jest.fn().mockRejectedValue(new GaiaNetworkError('http://pc:4200', new Error('refused'))));
        const [failed] = queue('chat-1');
        expect(failed.state).toBe('failed');
        expect(failed.error).not.toMatch(/mobileApp\.|\{/);
        expect(failed.failure).toMatchObject({ messageKey: 'mobileApp.error.network', params: { url: 'http://pc:4200', reason: 'refused' } });
        expect(JSON.parse(JSON.stringify(failed)).failure.messageKey).toBe('mobileApp.error.network');
    });
});
