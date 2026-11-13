// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { SystemStatus, WarmUpStatus } from '@webui/types';

import { createFakeClient } from '@/api/fake';
import { translator } from '@/i18n/useT';

import { createFirstSend } from './firstSend';
import { greetingKey } from './greeting';
import { startingReason } from './starting';
import { createStartScreenLoader } from './startScreen';
import { warmUpLine, warmUpProgress } from './warmUp';

const t = translator('en');

// The fake client has no createSession, so the chat's creation is stubbed here.
function setup(overrides: { createSession?: () => Promise<{ id: string }>; deliver?: (id: string, text: string) => Promise<boolean | void> } = {}) {
    const fake = createFakeClient();
    const queued: { id: string; items: { text: string; state: string; error?: string }[] }[] = [];
    const flow = createFirstSend({
        createSession: overrides.createSession ?? (async () => ({ id: 's1' })),
        deliver:
            overrides.deliver ??
            (async (id, text) => {
                for await (const event of fake.sendMessage(id, text)) void event;
            }),
        queueHeld: (id, items) => queued.push({ id, items }),
        describeError: (err) => (err instanceof Error ? err.message : String(err)),
        firstNotSent: 'The first message was not sent.',
    });
    return { fake, queued, flow };
}

describe('first send', () => {
    it('creates the chat, then sends the first message into it', async () => {
        const { fake, flow } = setup();
        flow.setText('  hello  ');
        await flow.submit();
        expect(fake.sent).toEqual([{ sessionId: 's1', message: 'hello' }]);
        expect(flow.getState()).toMatchObject({ text: '', sending: false, error: null });
    });

    it('ignores an empty box', async () => {
        const { fake, flow } = setup();
        flow.setText('   ');
        await flow.submit();
        expect(fake.sent).toEqual([]);
    });

    it('holds messages typed while the chat is created and queues them after', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const { fake, queued, flow } = setup({ createSession: async () => (await gate, { id: 's1' }) });
        flow.setText('first');
        const first = flow.submit();
        flow.setText('second');
        await flow.submit();
        flow.setText('third');
        await flow.submit();
        expect(flow.getState().text).toBe('');
        release();
        await first;
        expect(fake.sent.map((s) => s.message)).toEqual(['first']);
        expect(queued).toHaveLength(1);
        expect(queued[0].items.map((i) => [i.text, i.state])).toEqual([['second', 'queued'], ['third', 'queued']]);
    });

    it('shows held messages as failed when the first one was not sent', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const { queued, flow } = setup({ deliver: async () => (await gate, false) });
        flow.setText('first');
        const first = flow.submit();
        flow.setText('second');
        await flow.submit();
        release();
        await first;
        expect(queued[0].items).toMatchObject([{ text: 'second', state: 'failed', error: 'The first message was not sent.' }]);
    });

    it('restores everything to the box, joined by a blank line, and shows the error', async () => {
        let fail!: () => void;
        const gate = new Promise<void>((_, reject) => (fail = () => reject(new Error('Lemonade is down'))));
        const { queued, flow } = setup({ createSession: async () => (await gate, { id: 's1' }) });
        flow.setText('first');
        const first = flow.submit();
        flow.setText('second');
        await flow.submit();
        fail();
        await first;
        expect(flow.getState()).toMatchObject({ text: 'first\n\nsecond', sending: false, error: 'Lemonade is down' });
        expect(queued).toEqual([]);
    });
});

describe('greeting', () => {
    it.each([
        [4, 'evening'],
        [5, 'morning'],
        [11, 'morning'],
        [12, 'afternoon'],
        [17, 'afternoon'],
        [18, 'evening'],
        [0, 'evening'],
    ])('at hour %i reads as %s', (hour, part) => {
        const now = new Date(2026, 10, 12, hour, 30);
        expect(greetingKey(now)).toBe(`newChat.greeting.${part}`);
        expect(t(greetingKey(now))).toContain(part === 'morning' ? 'morning' : part);
    });
});

describe('warm-up line', () => {
    const warming = (patch: Partial<WarmUpStatus>): WarmUpStatus => ({ state: 'warming', elapsed_seconds: 7.9, ...patch });
    const name = (m: string) => m;

    it('is hidden unless warming', () => {
        expect(warmUpProgress({ state: 'ready' })).toBeNull();
        expect(warmUpProgress(undefined)).toBeNull();
    });

    it('says which model and where once known', () => {
        expect(warmUpLine(warmUpProgress(warming({}))!, t, name)).toBe('Getting GAIA ready… 7s');
        expect(warmUpLine(warmUpProgress(warming({ model: 'Gemma' }))!, t, name)).toBe('Loading Gemma… 7s');
        expect(warmUpLine(warmUpProgress(warming({ model: 'Gemma', device: 'npu' }))!, t, name)).toBe(
            'Loading Gemma on your NPU… 7s',
        );
    });
});

describe('starting lock', () => {
    const status = (patch: Partial<SystemStatus>) => patch as SystemStatus;

    it('disables the composer only while boot tasks are pending', () => {
        expect(startingReason(status({ init_state: 'initializing', init_tasks: [{ name: 'a', status: 'running' }] }), t)).toBe(
            'GAIA is starting…',
        );
        expect(startingReason(status({ init_state: 'initializing', init_tasks: [{ name: 'a', status: 'done' }] }), t)).toBeNull();
        expect(startingReason(status({ init_state: 'ready' }), t)).toBeNull();
        expect(startingReason(undefined, t)).toBeNull();
    });
});

describe('assistant did not start', () => {
    const screen = { cards: [], working_folder: { path: '/', name: '/', gaia_folder: false, choosable: false } };

    it('keeps the reason up through a failed background retry, clears it on success', async () => {
        const fetchStart = jest
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockRejectedValueOnce(new Error('still booting'))
            .mockResolvedValueOnce(screen);
        const loader = createStartScreenLoader(fetchStart, (e) => (e as Error).message);
        await loader.load();
        expect(loader.getState().error).toBe('boom');
        await loader.load(true);
        expect(loader.getState().error).toBe('still booting');
        await loader.load(true);
        expect(loader.getState()).toEqual({ start: screen, error: null });
    });

    it('treats a skills error as the reason', async () => {
        const loader = createStartScreenLoader(async () => ({ ...screen, skills_error: 'no skills' }), String);
        await loader.load();
        expect(loader.getState().error).toBe('no skills');
    });

    it('a manual retry clears the old reason while it loads', async () => {
        const loader = createStartScreenLoader(() => new Promise(() => {}), String);
        const failed = createStartScreenLoader(() => Promise.reject(new Error('x')), (e) => (e as Error).message);
        await failed.load();
        expect(failed.getState().error).toBe('x');
        void loader.load();
        expect(loader.getState().error).toBeNull();
    });
});
