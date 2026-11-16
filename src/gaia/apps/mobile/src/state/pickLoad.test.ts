// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import type { WarmUpStatus } from '@webui/types';

import { usePickLoadStore } from './pickLoad';

const MODEL = 'Qwen3-4B-Instruct-GGUF';
const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('pick load', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        usePickLoadStore.getState().clear();
    });
    afterEach(() => {
        usePickLoadStore.getState().clear();
        jest.useRealTimers();
    });

    it('counts seconds while loading and goes away once loaded', async () => {
        let warm: WarmUpStatus = { state: 'warming', elapsed_seconds: 3.4, model: MODEL };
        const client = createFakeClient({ warmUp: () => warm });
        usePickLoadStore.getState().watch(client, MODEL);
        expect(usePickLoadStore.getState().pickLoad).toEqual({ model: MODEL, seconds: 0, error: null });
        await flush();
        expect(usePickLoadStore.getState().pickLoad).toEqual({ model: MODEL, seconds: 3, error: null });
        warm = { state: 'ready', model: MODEL };
        await jest.advanceTimersByTimeAsync(1000);
        expect(usePickLoadStore.getState().pickLoad).toBeNull();
    });

    it('keeps the backend reason on failure, and ignores another model\'s failed warm-up', async () => {
        const client = createFakeClient({ warmUp: { state: 'failed', error: 'out of memory', model: MODEL } });
        usePickLoadStore.getState().watch(client, MODEL);
        await flush();
        expect(usePickLoadStore.getState().pickLoad?.error).toEqual({ reason: 'out of memory' });

        const other = createFakeClient({ warmUp: { state: 'failed', error: 'x', model: 'Other-GGUF' } });
        usePickLoadStore.getState().watch(other, MODEL);
        await flush();
        expect(usePickLoadStore.getState().pickLoad).toBeNull();
    });

    it('says so when it loses track, and Retry asks for a fresh load then follows it', async () => {
        const broken = createFakeClient({ warmUpError: new GaiaApiError(500, 'boom') });
        usePickLoadStore.getState().watch(broken, MODEL);
        await flush();
        expect(usePickLoadStore.getState().pickLoad?.error?.key).toBe('banner.pickLoad.lostTrack');

        const client = createFakeClient({ warmUp: { state: 'warming', elapsed_seconds: 1, model: MODEL } });
        await usePickLoadStore.getState().retry(client);
        expect(client.warmUpRequests).toEqual([true]);
        expect(usePickLoadStore.getState().pickLoad).toMatchObject({ model: MODEL, seconds: 1, error: null });
    });

    it('reports a retry the PC refused', async () => {
        usePickLoadStore.setState({ pickLoad: { model: MODEL, seconds: 0, error: { reason: 'x' } } });
        const client = createFakeClient({ warmUpError: new GaiaApiError(500, 'no') });
        await usePickLoadStore.getState().retry(client);
        expect(usePickLoadStore.getState().pickLoad?.error?.key).toBe('banner.pickLoad.startFailed');
    });
});
