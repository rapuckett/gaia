// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { pickStarters, withStarter } from '../tryChips.core';
import type { StartCard } from '../../types';

const card = (skill: string): StartCard => ({ skill, title: skill, note: '', prompt: skill, needs_input: false });

describe('tryChips.core', () => {
    it('shows at most two tasks, then examples up to three', () => {
        expect(pickStarters([]).examples).toHaveLength(3);
        expect(pickStarters([card('a'), card('b')]).examples).toHaveLength(1);
        const five = pickStarters(['a', 'b', 'c', 'd', 'e'].map(card));
        expect(five.tasks.map((c) => c.skill)).toEqual(['a', 'b']);
        expect(five.examples).toHaveLength(1);
    });

    it('leaves out a task offered elsewhere and fills from the next one', () => {
        const picked = pickStarters(['doc', 'b', 'c'].map(card), ['doc']);
        expect(picked.tasks.map((c) => c.skill)).toEqual(['b', 'c']);
        expect(pickStarters([card('doc')], ['doc']).examples).toHaveLength(3);
    });

    it('puts a pick after typed text and replaces the last pick', () => {
        expect(withStarter('', '', 'one')).toBe('one');
        expect(withStarter('Mine', '', 'one')).toBe('Mine\n\none');
        expect(withStarter('Mine\n\none', 'one', 'two')).toBe('Mine\n\ntwo');
    });
});
