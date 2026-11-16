// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { pluralCategory } from './plural';

const saved = Intl.PluralRules;
beforeAll(() => {
    delete (Intl as any).PluralRules;
});
afterAll(() => {
    (Intl as any).PluralRules = saved;
});

describe('pluralCategory without Intl.PluralRules', () => {
    it('picks English forms', () => {
        expect([0, 1, 2, 5].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other', 'other']);
        expect(pluralCategory('en-US', 1)).toBe('one');
    });

    it('picks Arabic forms', () => {
        const got = [0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103].map((n) => pluralCategory('ar', n));
        expect(got).toEqual(['zero', 'one', 'two', 'few', 'few', 'many', 'many', 'other', 'other', 'other', 'few']);
    });

    it('throws for a locale the app does not ship', () => {
        expect(() => pluralCategory('fr', 1)).toThrow(/"fr"/);
    });
});
