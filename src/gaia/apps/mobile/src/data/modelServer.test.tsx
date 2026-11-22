// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { LemonadeTarget } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';

import { GaiaClientProvider } from './GaiaClientProvider';
import { modelServerKeys, useSwitchToYourServer } from './modelServer';

const KEY = 'sk-lemonade-7b3d';
const TARGET = { mode: 'gaia', source: 'config', base_url: null, saved_base_url: null, api_key_stored: false, gaia_installed: true, offer: false } as unknown as LemonadeTarget;

function setup(client = createFakeClient({ lemonadeTarget: TARGET })) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
        </QueryClientProvider>
    );
    return { client, queryClient, wrapper };
}

describe('useSwitchToYourServer', () => {
    it('sends the switch confirmed with the key only in the body, and keeps the key out of the query cache', async () => {
        const { client, queryClient, wrapper } = setup();
        const hook = await renderHook(() => useSwitchToYourServer(), { wrapper });

        await act(async () => {
            await hook.result.current.send(' http://192.168.1.20:13305 ', ` ${KEY} `);
        });

        expect(client.targetSets).toEqual([{ mode: 'external', base_url: 'http://192.168.1.20:13305', api_key: KEY, confirm: true }]);
        expect(queryClient.getQueryData<LemonadeTarget>(modelServerKeys.target)?.mode).toBe('external');
        const cached = JSON.stringify([queryClient.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data]), queryClient.getMutationCache().getAll().map((m) => m.state)]);
        expect(cached).not.toContain(KEY);
    });

    it('sends no key field when none was typed', async () => {
        const { client, wrapper } = setup();
        const hook = await renderHook(() => useSwitchToYourServer(), { wrapper });

        await act(async () => {
            await hook.result.current.send('http://localhost:13305', '   ');
        });

        expect(client.targetSets).toEqual([{ mode: 'external', base_url: 'http://localhost:13305', confirm: true }]);
    });

    it('throws a failure that quotes the key with the key masked', async () => {
        const { wrapper } = setup(createFakeClient({ lemonadeTarget: TARGET, serverChangeError: new GaiaApiError(422, `Lemonade rejected ${KEY}`) }));
        const hook = await renderHook(() => useSwitchToYourServer(), { wrapper });

        let thrown: unknown;
        await act(async () => {
            thrown = await hook.result.current.send('http://localhost:13305', KEY).catch((err: unknown) => err);
        });

        expect(thrown).toBeInstanceOf(GaiaApiError);
        expect((thrown as GaiaApiError).status).toBe(422);
        expect(`${(thrown as GaiaApiError).message} ${(thrown as GaiaApiError).detail}`).not.toContain(KEY);
    });
});
