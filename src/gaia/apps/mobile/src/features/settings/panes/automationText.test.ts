// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { translator } from '@webui/i18n/translator';

import { everyPhrase } from './automationText';

const saved = Intl.PluralRules;
beforeAll(() => {
    delete (Intl as any).PluralRules;
});
afterAll(() => {
    (Intl as any).PluralRules = saved;
});

describe('everyPhrase without Intl.PluralRules (Hermes on iOS)', () => {
    it('words a day in English', () => {
        const t = translator('en');
        expect(everyPhrase(86400, t.bare, 'en')).toMatch(/^Every .*day/i);
    });

    it('words a day in Arabic', () => {
        const t = translator('ar');
        expect(everyPhrase(86400, t.bare, 'ar')).toBeTruthy();
        expect(everyPhrase(2 * 86400, t.bare, 'ar')).toBeTruthy();
    });
});
