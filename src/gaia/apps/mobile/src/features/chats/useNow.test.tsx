// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useNow } from './useNow';

describe('useNow', () => {
    let handler: ((state: string) => void) | null = null;
    const remove = jest.fn();

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-11-17T10:00:00'));
        remove.mockClear();
        jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, h: (state: string) => void) => {
            handler = h;
            return { remove };
        }) as unknown as typeof AppState.addEventListener);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it('re-reads the clock when the app returns to the foreground, not while it stays away', async () => {
        const view = await renderHook(() => useNow());
        const first = view.result.current.getTime();

        jest.setSystemTime(new Date('2026-11-17T10:05:00'));
        await act(async () => handler!('background'));
        expect(view.result.current.getTime()).toBe(first);

        await act(async () => handler!('active'));
        expect(view.result.current.getTime()).toBe(new Date('2026-11-17T10:05:00').getTime());

        await view.unmount();
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it('ticks at local midnight', async () => {
        const view = await renderHook(() => useNow());
        await act(async () => {
            jest.advanceTimersByTime(14 * 3600 * 1000 + 1000);
        });
        expect(view.result.current.getDate()).toBe(18);
        await view.unmount();
    });
});
