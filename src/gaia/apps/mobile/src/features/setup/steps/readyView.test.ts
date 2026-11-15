// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { StartCard } from '@webui/types';

import { starterCards } from './readyView';

const cards = [{ skill: 'summarize' }, { skill: 'check-in' }] as StartCard[];

describe('starterCards', () => {
    it('leaves "Check in" out of a first run and offers it when setup is run again', () => {
        expect(starterCards(cards, false).map((c) => c.skill)).toEqual(['summarize']);
        expect(starterCards(cards, true).map((c) => c.skill)).toEqual(['summarize', 'check-in']);
    });
});
