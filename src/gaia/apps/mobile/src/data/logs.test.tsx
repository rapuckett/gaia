// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { LogReadResponse } from '@/api/client.types';
import { LOG_FOLLOW_MS, LOG_KEEP_LINES } from '@/api/constants';
import { createFakeClient } from '@/api/fake';

import { GaiaClientProvider } from './GaiaClientProvider';
import { isProblem, mergeLogRead, useLogRead } from './logs';

const lines = (...texts: string[]) => texts.map((text) => ({ text }));

describe('merging a log read', () => {
    const first = mergeLogRead(undefined, { available: true, lines: lines('a', 'b'), cursor: '10' }, true);

    it('appends the lines after the cursor and moves the cursor', () => {
        const next = mergeLogRead(first, { available: true, lines: lines('c'), cursor: '12' }, false);
        expect(next.lines.map((l) => l.text)).toEqual(['a', 'b', 'c']);
        expect(next.cursor).toBe('12');
    });

    it('replaces the lines when the log started over, or on a fresh read', () => {
        expect(mergeLogRead(first, { available: true, lines: lines('x'), cursor: '3', reset: true }, false).lines).toEqual(lines('x'));
        expect(mergeLogRead(first, { available: true, lines: lines('y'), cursor: '4' }, true).lines).toEqual(lines('y'));
    });

    it('keeps only the newest lines', () => {
        const many = Array.from({ length: LOG_KEEP_LINES }, (_, i) => `l${i}`);
        const next = mergeLogRead({ ...first, lines: lines(...many) }, { available: true, lines: lines('new'), cursor: '9' }, false);
        expect(next.lines).toHaveLength(LOG_KEEP_LINES);
        expect(next.lines.at(-1)?.text).toBe('new');
        expect(next.lines[0]?.text).toBe('l1');
    });

    it('filters to warnings and errors', () => {
        expect(['info', 'warning', 'error', 'debug', undefined].map((severity) => isProblem({ text: 't', severity }))).toEqual([false, true, true, false, false]);
    });
});

describe('following a log', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    async function setup(active: { current: boolean }, follow: boolean) {
        const afters: (string | null | undefined)[] = [];
        let n = 0;
        const client = createFakeClient({
            logReads: {
                gaia: ({ after }): LogReadResponse => {
                    afters.push(after);
                    n += 1;
                    return { available: true, lines: lines(`line${n}`), cursor: String(n * 10) };
                },
            },
        });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
            </QueryClientProvider>
        );
        const hook = await renderHook(() => useLogRead('gaia', null, { follow, active: active.current }), { wrapper });
        return { afters, hook, queryClient };
    }

    it('asks for the lines after the last cursor and appends them, and Refresh starts over', async () => {
        const { afters, hook } = await setup({ current: true }, true);
        await act(async () => {
            await jest.advanceTimersByTimeAsync(100);
        });
        await act(async () => {
            await jest.advanceTimersByTimeAsync(LOG_FOLLOW_MS);
        });
        expect(afters.slice(0, 2)).toEqual([null, '10']);
        expect(hook.result.current.data?.lines.map((l) => l.text)).toEqual(['line1', 'line2']);

        await act(async () => {
            await hook.result.current.refresh();
            await jest.advanceTimersByTimeAsync(10);
        });
        expect(afters.at(-1)).toBeNull();
        expect(hook.result.current.data?.lines.map((l) => l.text)).toEqual([`line${afters.length}`]);
    });

    it('reads nothing while follow is off after the first read, or while the screen is not in front', async () => {
        const off = await setup({ current: true }, false);
        await act(async () => {
            await jest.advanceTimersByTimeAsync(LOG_FOLLOW_MS * 5);
        });
        expect(off.afters).toHaveLength(1);

        const away = await setup({ current: false }, true);
        await act(async () => {
            await jest.advanceTimersByTimeAsync(LOG_FOLLOW_MS * 5);
        });
        expect(away.afters).toHaveLength(0);
    });
});
