// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { getLocales } from 'expo-localization';

import { DEFAULT_LOCALE, getLocale, isLocaleCode, isolate, setVariantPrefix, type Say } from '@webui/i18n/registry';
import { dateLocale, translator, type Translate } from '@webui/i18n/translator';

import { GaiaApiError, GaiaError, GaiaNetworkError, GaiaTurnError } from '@/api/errors';
import { useLocaleStore } from '@/state/locale';

// The phone says "your PC" where the shared catalog says "this PC".
setVariantPrefix('mobileApp.yourPc.');

export { dateLocale, translator, type Translate };

export function deviceLocaleCode(): string {
    const code = getLocales()[0]?.languageCode;
    return isLocaleCode(code) ? code : DEFAULT_LOCALE;
}

export function describeError(error: unknown, t: Translate): string {
    if (error instanceof GaiaError) return t(error.messageKey, error.params);
    return error instanceof Error ? error.message : String(error);
}

/** English from the PC, kept in reading order inside an Arabic line. */
export function ltr(text: string): string {
    return isolate(text, 'ltr');
}

/** For an error filled into another message: use inside `t.compose`, so each language half carries its own wording and the line is bracketed once. */
export function describeErrorWith(error: unknown, say: Say): string {
    if (error instanceof GaiaError) return say(error.messageKey, error.params);
    return error instanceof Error ? error.message : String(error);
}

/** Like `describeErrorWith`, but a PC's own reason (`GaiaApiError.detail`) goes in as sent. */
export function describeFailureWith(error: unknown, say: Say): string {
    if (error instanceof GaiaApiError) return error.detail;
    return describeErrorWith(error, say);
}

/** Server text we didn't write (a PC's reason, a plain Error's message), or undefined when the error is our own translated wording. */
export function serverText(error: unknown): string | undefined {
    if (error instanceof GaiaApiError) return error.detail || undefined;
    if (error instanceof GaiaError) return undefined;
    return error instanceof Error ? error.message || undefined : undefined;
}

/** A PC's HTTP error, pairing-auth error or failed turn as our reason-free sentence plus its raw text for `detail`; any other error reads as `describeError`. */
export function describeHttpFailure(error: unknown, t: Translate): { text: string; detail?: string } {
    if (error instanceof GaiaApiError && error.messageKey === 'mobileApp.error.http' && error.detail) {
        return { text: t('mobileApp.error.httpNoDetail', { status: error.status }), detail: error.detail };
    }
    if (error instanceof GaiaApiError && error.messageKey === 'mobileApp.error.auth') {
        return { text: t('mobileApp.error.authNoDetail'), detail: error.detail || undefined };
    }
    if (error instanceof GaiaTurnError && error.detail) {
        return { text: t('mobileApp.error.turnFailedNoDetail'), detail: error.detail };
    }
    return { text: describeError(error, t) };
}

/** The raw cause for a Details disclosure; never part of the sentence a person reads. */
export function technicalDetail(error: unknown): string {
    if (error instanceof GaiaNetworkError) return `${error.params.url}: ${error.params.reason}`;
    if (error instanceof GaiaApiError) return `${error.status} ${error.detail}`.trim();
    return error instanceof Error ? error.message : String(error);
}

/** The language picked in the app, else the phone's. */
export function useLocaleCode(): string {
    const picked = useLocaleStore((s) => s.locale);
    return picked && isLocaleCode(picked) ? picked : deviceLocaleCode();
}

export function useT(): Translate {
    return translator(useLocaleCode());
}

export function useDirection(): 'ltr' | 'rtl' {
    return getLocale(useLocaleCode()).meta.dir;
}
