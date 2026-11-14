// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { getLocales } from 'expo-localization';

import { DEFAULT_LOCALE, getLocale, isLocaleCode } from '@webui/i18n/registry';
import { translator, type Translate } from '@webui/i18n/translator';

import { GaiaError } from '@/api/errors';

export { translator, type Translate };

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
