// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Schedule } from '@webui/types';

import { createScheduleAnnouncer } from './scheduleAlerts';

const schedule = (id: string, error_count: number): Schedule => ({ id, name: id, error_count, last_error: error_count ? 'boom' : null }) as Schedule;

describe('schedule failure alerts', () => {
    it('raises a failure from while the app was closed once, then only newer ones', async () => {
        const raised: string[] = [];
        const save = jest.fn(async () => undefined);
        const announce = createScheduleAnnouncer((s) => raised.push(`${s.id}:${s.error_count}`), () => undefined, { load: async () => ({ a: 1, b: 0 }), save });

        await announce([schedule('a', 1), schedule('b', 2)]);
        expect(raised).toEqual(['b:2']);
        expect(save).toHaveBeenLastCalledWith({ a: 1, b: 2 });

        await announce([schedule('a', 1), schedule('b', 2)]);
        expect(raised).toEqual(['b:2']);

        await announce([schedule('a', 2), schedule('b', 2)]);
        expect(raised).toEqual(['b:2', 'a:2']);
    });
});

describe('schedule finished alerts', () => {
    const ran = (id: string, run_count: number, extra: Partial<Schedule> = {}): Schedule => ({ id, name: id, run_count, error_count: 0, last_error: null, ...extra }) as Schedule;

    it('raises one per new clean run, none for runs from before launch or for failures', async () => {
        const done: string[] = [];
        const announce = createScheduleAnnouncer(() => undefined, (s) => done.push(`${s.id}:${s.run_count}`), { load: async () => ({}), save: async () => undefined });

        await announce([ran('a', 3)]);
        await announce([ran('a', 3)]);
        expect(done).toEqual([]);

        await announce([ran('a', 4)]);
        await announce([ran('a', 4)]);
        expect(done).toEqual(['a:4']);

        await announce([ran('a', 5, { running: true })]);
        expect(done).toEqual(['a:4']);
        await announce([ran('a', 5)]);
        expect(done).toEqual(['a:4', 'a:5']);

        await announce([ran('a', 6, { error_count: 1, last_error: 'boom' })]);
        expect(done).toEqual(['a:4', 'a:5']);
    });
});
