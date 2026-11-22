// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LemonadeTarget, LocalModelStatus } from '@/api/client.types';

import { serverDownOffer, type TargetRead } from './serverDownOffer';

const status = (owner: string) => ({ owner }) as LocalModelStatus;
const target = (mode: string, source: string) => ({ mode, source }) as LemonadeTarget;

describe('serverDownOffer', () => {
    it.each([
        ['ours', status('gaia'), target('gaia', 'gaia'), { start: true, useOwn: false, notOurs: false }, 'read'],
        ['ours, though a target says external', status('gaia'), target('external', 'config'), { start: true, useOwn: false, notOurs: false }, 'read'],
        ['external and saved', status('user'), target('external', 'config'), { start: false, useOwn: true, notOurs: false }, 'read'],
        ['external and pinned by the environment', status('user'), target('external', 'env'), { start: false, useOwn: false, notOurs: true }, 'read'],
        ['not ours, target still loading', status('user'), undefined, { start: false, useOwn: false, notOurs: false }, 'loading'],
        ['not ours, target read failed', status('user'), undefined, { start: false, useOwn: false, notOurs: false }, 'failed'],
        ['external config, target still loading', status('user'), target('external', 'config'), { start: false, useOwn: false, notOurs: false }, 'loading'],
        ['ours, target failed', status('gaia'), undefined, { start: true, useOwn: false, notOurs: false }, 'failed'],
        ['nothing read yet', undefined, undefined, { start: false, useOwn: false, notOurs: false }, 'read'],
    ])('%s', (_name, s, t, expected, read) => {
        expect(serverDownOffer(s, t, read as TargetRead)).toEqual(expected);
    });
});
