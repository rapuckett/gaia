// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CHATS_POLL_MS } from '@/api/constants';
import { createFakeClient } from '@/api/fake';

import { GaiaClientProvider } from './GaiaClientProvider';
import { useSessions } from './queries';

describe('the chat list poll', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        focusManager.setFocused(undefined);
        jest.useRealTimers();
    });

    it('re-reads every 5 s in the foreground and not while backgrounded', async () => {
        const client = createFakeClient({ sessions: [] });
        const list = jest.spyOn(client, 'listSessions');
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
            </QueryClientProvider>
        );
        await renderHook(() => useSessions(), { wrapper });
        await act(async () => {});
        expect(list).toHaveBeenCalledTimes(1);

        await act(async () => { jest.advanceTimersByTime(CHATS_POLL_MS); });
        expect(list).toHaveBeenCalledTimes(2);

        await act(async () => { focusManager.setFocused(false); });
        await act(async () => { jest.advanceTimersByTime(CHATS_POLL_MS * 3); });
        expect(list).toHaveBeenCalledTimes(2);
    });

    it('drops a chat deleted on the PC at the next read, even the last one', async () => {
        const chat = { id: 'a', title: 'Renamed chat', created_at: '', updated_at: '', model: '', system_prompt: null, message_count: 1, document_ids: [] };
        const client = createFakeClient({ sessions: [chat] });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
            </QueryClientProvider>
        );
        const list = await renderHook(() => useSessions(), { wrapper });
        await waitFor(() => expect(list.result.current.data?.sessions).toHaveLength(1));

        const read = jest.fn(async () => ({ sessions: [], total: 0 }));
        client.listSessions = read;
        await act(async () => jest.advanceTimersByTimeAsync(CHATS_POLL_MS));
        expect(read).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(list.result.current.data?.sessions).toEqual([]));
    });
});
