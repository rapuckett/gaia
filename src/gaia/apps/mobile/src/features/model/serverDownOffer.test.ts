// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LemonadeTarget, LocalModelStatus } from '@/api/client.types';

import { serverDownOffer } from './serverDownOffer';

const status = (owner: string) => ({ owner }) as LocalModelStatus;
const target = (mode: string, source: string) => ({ mode, source }) as LemonadeTarget;

describe('serverDownOffer', () => {
    it.each([
        ['ours', status('gaia'), target('gaia', 'gaia'), { start: true, useOwn: false, notOurs: false }],
        ['ours, though a target says external', status('gaia'), target('external', 'config'), { start: true, useOwn: false, notOurs: false }],
        ['external and saved', status('user'), target('external', 'config'), { start: false, useOwn: true, notOurs: false }],
        ['external and pinned by the environment', status('user'), target('external', 'env'), { start: false, useOwn: false, notOurs: true }],
        ['not ours, target unread', status('user'), undefined, { start: false, useOwn: false, notOurs: true }],
        ['nothing read yet', undefined, undefined, { start: false, useOwn: false, notOurs: false }],
    ])('%s', (_name, s, t, expected) => {
        expect(serverDownOffer(s, t)).toEqual(expected);
    });
});
