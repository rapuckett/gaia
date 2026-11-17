// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useConnectionStore } from '@/state/connection';
import { readNewChatDraft, writeNewChatDraft } from '@/state/newChatDraft';

import { useForgetPc } from './pairedPcs';
import { setPairingService } from './registry';
import type { PairedPc, PairingService } from './service';

const pc = (id: string, baseUrl: string): PairedPc => ({ id, name: id, connection: { baseUrl, pcId: id } });

describe('useForgetPc', () => {
    afterEach(() => setPairingService(null));

    it('leaves no connection only when the PC in use is the one forgotten', async () => {
        const forget = jest.fn(async () => {});
        setPairingService({ forget } as unknown as PairingService);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        );
        const { result } = await renderHook(() => useForgetPc(), { wrapper });

        useConnectionStore.getState().setConnection({ baseUrl: 'https://192.168.1.20:4243', pcId: 'mine' });
        await act(async () => { await result.current.mutateAsync(pc('other', 'https://192.168.1.30:4243')); });
        expect(useConnectionStore.getState().connection).not.toBeNull();

        await act(async () => { await result.current.mutateAsync(pc('mine', 'https://192.168.1.20:4243')); });
        expect(forget).toHaveBeenCalledTimes(2);
        expect(useConnectionStore.getState().connection).toBeNull();
    });

    it("removes the forgotten PC's unsent new-chat draft and keeps the others'", async () => {
        await AsyncStorage.clear();
        setPairingService({ forget: jest.fn(async () => {}) } as unknown as PairingService);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        );
        const { result } = await renderHook(() => useForgetPc(), { wrapper });
        writeNewChatDraft('pc-a', 'for A');
        writeNewChatDraft('pc-b', 'for B');
        await act(async () => { await result.current.mutateAsync(pc('pc-a', 'https://192.168.1.20:4243')); });
        expect(await readNewChatDraft('pc-a')).toBe('');
        expect(await readNewChatDraft('pc-b')).toBe('for B');
    });
});
