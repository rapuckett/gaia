// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { getLocales } from 'expo-localization';

import {
    compose,
    DEFAULT_LOCALE,
    getLocale,
    isLocaleCode,
    pluralKey,
    translate,
    translateBare,
    withHint,
    type MessageKey,
    type Params,
    type PluralKey,
    type Say,
} from '@webui/i18n/registry';

import { GaiaError } from '@/api/errors';

// Same shape as webui's `translator()`, which can't be imported: its module pulls in the chat store.
export interface Translate {
    (key: MessageKey, params?: Params): string;
    plural: (base: PluralKey, n: number, params?: Params) => string;
    hint: (label: string, hint: string) => string;
    compose: (build: (say: Say, code: string) => string) => string;
    bare: (key: MessageKey, params?: Params) => string;
    locale: string;
}

const cache = new Map<string, Translate>();

export function translator(code: string): Translate {
    let t = cache.get(code);
    if (!t) {
        const fn = ((key: MessageKey, params?: Params) => translate(code, key, params)) as Translate;
        fn.plural = (base, n, params) => translate(code, pluralKey(base, n), { n, ...params });
        fn.hint = (label, hint) => withHint(code, label, hint);
        fn.compose = (build) => compose(code, build);
        fn.bare = (key, params) => translateBare(code, key, params);
        fn.locale = code;
        t = fn;
        cache.set(code, t);
    }
    return t;
}

export function deviceLocaleCode(): string {
    const code = getLocales()[0]?.languageCode;
    return isLocaleCode(code) ? code : DEFAULT_LOCALE;
}

export function describeError(error: unknown, t: Translate): string {
    if (error instanceof GaiaError) return t(error.messageKey, error.params);
    return error instanceof Error ? error.message : String(error);
}

export function useT(): Translate {
    return translator(deviceLocaleCode());
}

export function useDirection(): 'ltr' | 'rtl' {
    return getLocale(deviceLocaleCode()).meta.dir;
}
