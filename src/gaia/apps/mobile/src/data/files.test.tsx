// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFakeClient } from '@/api/fake';

import { useAddPcPath } from './files';
import { GaiaClientProvider } from './GaiaClientProvider';

describe('useAddPcPath', () => {
    it.each([
        ['"C:\\Users\\a\\y.pdf"', 'C:\\Users\\a\\y.pdf'],
        ['file:///home/a/b.pdf', '/home/a/b.pdf'],
        ['/home/a/b.pdf', '/home/a/b.pdf'],
    ])('sends %s to the PC as %s', async (typed, sent) => {
        const client = createFakeClient({});
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
            </QueryClientProvider>
        );
        const hook = await renderHook(() => useAddPcPath(), { wrapper });
        await act(async () => hook.result.current.mutateAsync({ path: typed, readChatId: 'chat-1', chatId: null }));
        expect(client.uploadedPaths).toEqual([{ filepath: sent, sessionId: 'chat-1' }]);
    });
});
