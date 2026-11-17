// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** CLDR cardinal plural form for the app's two locales; Hermes on iOS has no Intl.PluralRules. */
export function pluralCategory(locale: string, n: number): PluralCategory {
    const lang = locale.split(/[-_]/)[0]!.toLowerCase();
    if (lang === 'en') return n === 1 ? 'one' : 'other';
    if (lang === 'ar') {
        if (n === 0) return 'zero';
        if (n === 1) return 'one';
        if (n === 2) return 'two';
        const mod = n % 100;
        if (mod >= 3 && mod <= 10) return 'few';
        if (mod >= 11 && mod <= 99) return 'many';
        return 'other';
    }
    throw new Error(`No plural rules for locale "${locale}": the app ships en and ar; add its CLDR rules to src/i18n/plural.ts.`);
}
