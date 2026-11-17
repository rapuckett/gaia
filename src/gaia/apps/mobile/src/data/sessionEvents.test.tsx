// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import type { GaiaClient, StreamEvent } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';

import { GaiaClientProvider } from './GaiaClientProvider';
import { queryKeys } from './queries';
import { EVENTS_BACKOFF_MAX_MS, EVENTS_BACKOFF_MIN_MS, followSessionEvents, useSessionSync } from './sessionEvents';

const ev = (e: object) => e as StreamEvent;

function clientWith(watch: GaiaClient['watchSessionEvents']): GaiaClient {
    return { ...createFakeClient(), watchSessionEvents: watch };
}

describe('followSessionEvents', () => {
    it('hands over a chat only for set_active_session with an id', async () => {
        const client = createFakeClient({
            sessionEvents: [
                ev({ type: 'set_active_session', session_id: 'chat-1' }),
                ev({ type: 'set_active_session', session_id: '' }),
                ev({ type: 'set_active_session' }),
                ev({ type: 'sessions_changed', session_id: 'chat-2' }),
            ],
        });
        const abort = new AbortController();
        const seen: (string | null)[] = [];
        await followSessionEvents({
            client,
            signal: abort.signal,
            onEvent: (id) => seen.push(id),
            onError: () => {},
            sleep: async () => abort.abort(),
        });
        expect(seen).toEqual(['chat-1', null, null, null]);
    });

    it('reconnects with a delay that doubles to the cap, and starts over after a healthy connection', async () => {
        const abort = new AbortController();
        const errors: unknown[] = [];
        const sleeps: number[] = [];
        let clock = 0;
        let connects = 0;
        const client = clientWith(async function* () {
            connects += 1;
            // The 8th connection holds for a minute before it drops.
            if (connects === 8) clock += 60_000;
            throw new Error(`drop ${connects}`);
        });
        await followSessionEvents({
            client,
            signal: abort.signal,
            onEvent: () => {},
            onError: (e) => errors.push(e),
            now: () => clock,
            sleep: async (ms) => {
                sleeps.push(ms);
                if (sleeps.length === 10) abort.abort();
            },
        });
        expect(errors).toHaveLength(10);
        expect(sleeps.slice(0, 7)).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
        expect(sleeps[7]).toBe(EVENTS_BACKOFF_MIN_MS);
        expect(sleeps[8]).toBe(EVENTS_BACKOFF_MIN_MS * 2);
        expect(EVENTS_BACKOFF_MAX_MS).toBe(30_000);
    });

    it('stops quietly when the signal aborts mid-stream, without reporting an error', async () => {
        const abort = new AbortController();
        const onError = jest.fn();
        const client = clientWith(async function* () {
            abort.abort();
            throw new Error('aborted');
        });
        await followSessionEvents({ client, signal: abort.signal, onEvent: () => {}, onError, sleep: async () => {} });
        expect(onError).not.toHaveBeenCalled();
    });
});

describe('useSessionSync', () => {
    let appStateHandler: ((state: string) => void) | null = null;
    const remove = jest.fn();

    beforeEach(() => {
        remove.mockClear();
        appStateHandler = null;
        Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
        jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (state: string) => void) => {
            appStateHandler = handler;
            return { remove };
        }) as unknown as typeof AppState.addEventListener);
    });
    afterEach(() => jest.restoreAllMocks());

    function setup(client: GaiaClient, onOpenChat: (id: string) => void) {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
            </QueryClientProvider>
        );
        return { invalidate, wrapper };
    }

    it('refreshes the chat list on each event and opens the chat another client asked for', async () => {
        const open = jest.fn();
        const client = createFakeClient({
            sessionEvents: [ev({ type: 'set_active_session', session_id: 'chat-9' }), ev({ type: 'sessions_changed' })],
        });
        const { invalidate, wrapper } = setup(client, open);
        const view = await renderHook(() => useSessionSync(open), { wrapper });
        await act(async () => {});
        expect(invalidate).toHaveBeenCalledTimes(2);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.sessions });
        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith('chat-9');
        await view.unmount();
    });

    it('stops the stream in the background, and refetches and reconnects on return', async () => {
        const signals: AbortSignal[] = [];
        const client = clientWith(async function* (options) {
            signals.push(options!.signal!);
            await new Promise<void>((resolve) => options!.signal!.addEventListener('abort', () => resolve()));
        });
        const { invalidate, wrapper } = setup(client, () => {});
        const view = await renderHook(() => useSessionSync(() => {}), { wrapper });
        await act(async () => {});
        expect(signals).toHaveLength(1);
        expect(signals[0]!.aborted).toBe(false);

        await act(async () => appStateHandler!('background'));
        expect(signals[0]!.aborted).toBe(true);

        await act(async () => appStateHandler!('active'));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.sessions });
        expect(signals).toHaveLength(2);

        await view.unmount();
        expect(signals[1]!.aborted).toBe(true);
        expect(remove).toHaveBeenCalledTimes(1);
    });
});
