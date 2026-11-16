// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { STATUS_LOST_MS, STATUS_REQUEST_TIMEOUT_MS } from '@/api/constants';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import type { GaiaClient, SystemStatus } from '@/api/client.types';

import { fetchStatus } from './queries';
import { classifyStatusError, createStatusHealth } from './statusHealth';

describe('status health', () => {
    it('reads slow after 3 slow answers in a row, not after 2 then a success', () => {
        const h = createStatusHealth();
        h.record('slow');
        h.record('slow');
        expect(h.get().slow).toBe(false);
        h.record('ok');
        h.record('slow');
        h.record('slow');
        expect(h.get().slow).toBe(false);
        h.record('slow');
        expect(h.get().slow).toBe(true);
        h.record('ok');
        expect(h.get()).toEqual({ slow: false, lost: false });
    });

    it('reads slow at once after an outage', () => {
        const h = createStatusHealth();
        h.record('unreachable');
        h.record('slow');
        expect(h.get().slow).toBe(true);
    });

    it('becomes lost after 5 minutes of slow answers', () => {
        let t = 0;
        const h = createStatusHealth(() => t);
        h.record('slow');
        t = STATUS_LOST_MS - 1;
        h.record('slow');
        h.record('slow');
        expect(h.get()).toEqual({ slow: true, lost: false });
        t = STATUS_LOST_MS;
        h.record('slow');
        expect(h.get()).toEqual({ slow: false, lost: true });
    });

    it('classifies timeouts and 504 as slow, 502 and network failures as unreachable', () => {
        expect(classifyStatusError(new Error('x'), true)).toBe('slow');
        expect(classifyStatusError(new GaiaApiError(504, ''), false)).toBe('slow');
        expect(classifyStatusError(new GaiaApiError(502, ''), false)).toBe('unreachable');
        expect(classifyStatusError(new GaiaApiError(500, ''), false)).toBe('error');
        expect(classifyStatusError(new GaiaNetworkError('u', new Error('r')), false)).toBe('unreachable');
    });
});

describe('fetchStatus', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('times out at the status limit and counts it slow', async () => {
        const h = createStatusHealth();
        const client = {
            getSystemStatus: ({ signal }: { signal: AbortSignal }) =>
                new Promise<SystemStatus>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
        } as unknown as GaiaClient;
        for (let n = 1; n <= 3; n++) {
            const pending = fetchStatus(client, new AbortController().signal, h).catch((e: Error) => e) as Promise<Error>;
            await jest.advanceTimersByTimeAsync(STATUS_REQUEST_TIMEOUT_MS - 1);
            expect(h.get().slow).toBe(false);
            await jest.advanceTimersByTimeAsync(1);
            expect((await pending).message).toBe('aborted');
        }
        expect(h.get().slow).toBe(true);
    });
});
