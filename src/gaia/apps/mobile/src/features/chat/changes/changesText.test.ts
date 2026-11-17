// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { stripIsolates } from '@webui/i18n/registry';

import type { SessionChanges } from '@/api/client.types';
import { translator } from '@/i18n/useT';

import { reviewHeadingText, summaryText, totalText, undoneText } from './changesText';

const changes = { totals: { files: 4, additions: 52, deletions: 22, uncounted: 0 } } as SessionChanges;

describe('Changes totals in Arabic', () => {
    it.each([
        ['total', totalText],
        ['summary', summaryText],
    ])('keep the %s signed counts as one left-to-right run', (_name, build) => {
        const text = build(changes, translator('ar'));
        expect(text).toContain('⁦+52 −22⁩');
    });
});

const files = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);
const result = (restored: number, removed: number, kept = 0) => ({ restored: files(restored), removed: files(removed), kept_folders: files(kept) });

describe('undoneText', () => {
    const saved = Intl.PluralRules;
    beforeAll(() => {
        delete (Intl as any).PluralRules;
    });
    afterAll(() => {
        (Intl as any).PluralRules = saved;
    });

    it('keeps the English sentence unchanged', () => {
        expect(undoneText(result(1, 1), translator('en'))).toBe('Undone: restored 1 file, removed 1 new file.');
    });

    it.each([result(2, 0), result(0, 3), result(1, 1), result(4, 11, 2), result(0, 0)])('ar is one sentence with one gloss (%j)', (r) => {
        const text = undoneText(r, translator('ar'));
        const flat = stripIsolates(text);
        const gloss = flat.match(/\(([^()]*)\)/g) ?? [];
        expect(gloss).toHaveLength(1);
        expect(flat).not.toContain('(, )');
        expect(gloss[0]).not.toMatch(/[؀-ۿ]/);
        expect(flat.startsWith('تم التراجع')).toBe(true);
        expect(gloss[0]!.startsWith('(Undone:')).toBe(true);
    });

    it.each([
        [1, 'أُعيد ملف واحد'],
        [2, 'أُعيد ملفان'],
        [3, 'أُعيد 3 ملفات'],
        [11, 'أُعيد 11 ملفًا'],
    ])('ar agrees with %i restored files', (n, phrase) => {
        expect(stripIsolates(undoneText(result(n, 0), translator('ar')))).toContain(phrase);
    });
});

describe('chat totals', () => {
    const saved = Intl.PluralRules;
    beforeAll(() => {
        delete (Intl as any).PluralRules;
    });
    afterAll(() => {
        (Intl as any).PluralRules = saved;
    });
    const of = (n: number) => ({ totals: { files: n, additions: 52, deletions: 22, uncounted: 0 } }) as SessionChanges;

    it.each([totalText, summaryText, reviewHeadingText])('ar is one sentence with one gloss and the counts in one isolate', (build) => {
        const text = build(of(4), translator('ar'));
        const flat = stripIsolates(text);
        expect(flat).not.toContain('))');
        expect(flat.match(/\(/g)).toHaveLength(1);
        expect(flat.match(/\)/g)).toHaveLength(1);
        expect(text.match(/⁦\+52 −22⁩/g)).toHaveLength(2);
    });

    it('keeps the English line unchanged', () => {
        expect(totalText(of(4), translator('en'))).toBe('4 files changed, ⁦+52 −22⁩');
        expect(summaryText(of(1), translator('en'))).toBe('1 file · ⁦+52 −22⁩');
    });

    it.each([
        [1, 'ملف واحد'],
        [2, 'ملفان'],
        [3, '3 ملفات'],
        [11, '11 ملفًا'],
    ])('ar agrees with %i files', (n, phrase) => {
        expect(stripIsolates(summaryText(of(n), translator('ar')))).toContain(phrase);
    });
});
