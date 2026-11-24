// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { DeadlineError, withDeadline } from './deadline';

describe('withDeadline', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('cancels a job with no answer at the deadline, and not a moment before', async () => {
        let signal: AbortSignal | undefined;
        const running = withDeadline(10_000, 'Asking the PC', (s) => {
            signal = s;
            return new Promise<string>(() => undefined);
        });
        const settled = running.catch((err: unknown) => err);
        await jest.advanceTimersByTimeAsync(9_999);
        expect(signal?.aborted).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        expect(signal?.aborted).toBe(true);
        expect(await settled).toBeInstanceOf(DeadlineError);
    });

    it('passes on an answer that came in time, and its failure', async () => {
        expect(await withDeadline(10_000, 'Asking the PC', async () => 'known')).toBe('known');
        await expect(withDeadline(10_000, 'Asking the PC', async () => Promise.reject(new Error('refused')))).rejects.toThrow('refused');
    });
});
