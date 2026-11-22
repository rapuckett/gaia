// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CONNECT_RETRY_MS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';

import { GaiaClientProvider } from './GaiaClientProvider';
import { useSendProviderKey } from './providers';

const GATEWAY = { base_url: 'https://gw.example.com/v1' };
const waiting409 = () =>
    new GaiaApiError(409, 'macOS is asking GAIA for keychain access.', undefined, undefined, { code: 'key_store_waiting', message: 'macOS is asking GAIA for keychain access.' });

/** `send` against a client whose first connects fail with `failures`, in order, then succeed. */
async function sendWith(failures: GaiaApiError[], gateway?: typeof GATEWAY) {
    const client = createFakeClient({});
    const calls = jest.fn();
    client.connectProvider = async () => {
        calls();
        const next = failures.shift();
        if (next) throw next;
        return { remembered: true };
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
        </QueryClientProvider>
    );
    const hook = await renderHook(() => useSendProviderKey(), { wrapper });
    const onWaiting = jest.fn();
    let outcome: { ok: true } | { ok: false; err: unknown } = { ok: true };
    await act(async () => {
        const pending = hook.result.current
            .send('amd', 'gw-key', { onWaiting, stopped: () => false, ...(gateway ? { gateway } : null) })
            .then(
                () => ({ ok: true }) as const,
                (err: unknown) => ({ ok: false, err }) as const,
            );
        await jest.advanceTimersByTimeAsync(CONNECT_RETRY_MS * 3);
        outcome = await pending;
    });
    await hook.unmount();
    queryClient.clear();
    return { calls: calls.mock.calls.length, onWaiting, outcome };
}

describe('useSendProviderKey', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('waits out a gateway move held by the key store\'s prompt (409 key_store_waiting)', async () => {
        const { calls, onWaiting, outcome } = await sendWith([waiting409()], GATEWAY);
        expect(outcome.ok).toBe(true);
        expect(calls).toBe(2);
        expect(onWaiting).toHaveBeenCalledWith('macOS is asking GAIA for keychain access.');
    });

    it('throws any other 409 on a gateway move after one try, a PC without codes included', async () => {
        const { calls, onWaiting, outcome } = await sendWith([new GaiaApiError(409, 'The saved key belongs to another gateway.')], GATEWAY);
        expect(outcome.ok).toBe(false);
        expect(calls).toBe(1);
        expect(onWaiting).not.toHaveBeenCalled();
    });

    it('still waits out a plain-text 409 from a PC without codes when nothing moves', async () => {
        const { calls, outcome } = await sendWith([new GaiaApiError(409, 'macOS is asking GAIA for keychain access.')]);
        expect(outcome.ok).toBe(true);
        expect(calls).toBe(2);
    });
});
