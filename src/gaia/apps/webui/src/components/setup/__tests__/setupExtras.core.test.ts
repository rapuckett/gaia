// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { SetupModelProgress, SetupRunStatus } from '../../../types';
import { extrasLeft, extrasStillFetching } from '../setupExtras.core';

const m = (id: string, state: SetupModelProgress['state']) => ({ id, state }) as SetupModelProgress;
const run = (state: SetupRunStatus['state'], models: SetupModelProgress[]) => ({ state, models }) as SetupRunStatus;
const isExtra = (id: string) => id === 'extra';

describe('extrasLeft', () => {
    it('names the extras a stopped run left behind when everything setup needs is on disk', () => {
        expect(extrasLeft(run('cancelled', [m('chat', 'ready'), m('extra', 'cancelled')]), false, isExtra)).toEqual(['extra']);
        expect(extrasLeft(run('failed', [m('chat', 'ready'), m('extra', 'failed')]), false, isExtra)).toEqual(['extra']);
    });

    it('names nothing while downloads move, once the run is not stopped, or when a needed model is missing', () => {
        const models = [m('chat', 'ready'), m('extra', 'cancelled')];
        expect(extrasLeft(run('failed', models), true, isExtra)).toEqual([]);
        expect(extrasLeft(run('running', models), false, isExtra)).toEqual([]);
        expect(extrasLeft(run('failed', [m('chat', 'failed'), m('extra', 'cancelled')]), false, isExtra)).toEqual([]);
        expect(extrasLeft(run('failed', [m('chat', 'ready'), m('extra', 'ready')]), false, isExtra)).toEqual([]);
        expect(extrasLeft({ ...run('failed', models), server_only: true }, false, isExtra)).toEqual([]);
        expect(extrasLeft(null, false, isExtra)).toEqual([]);
    });
});

describe('extrasStillFetching', () => {
    it('lists extras still pulling once setup is ready, and nothing before', () => {
        const models = [m('chat', 'ready'), m('a', 'downloading'), m('b', 'queued'), m('c', 'failed')];
        expect(extrasStillFetching(run('ready', models))).toEqual(['a', 'b']);
        expect(extrasStillFetching(run('running', models))).toEqual([]);
        expect(extrasStillFetching(null)).toEqual([]);
    });
});
