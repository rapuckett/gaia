// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { isLocaleCode } from '@webui/i18n/registry';

import { appLanguageSetting, type AppLanguageSetting } from '../../modules/gaia-app-language';

const KEY = 'gaia.locale';
/** The phone language the stored-pick path last saw (src/state/systemLanguage.ts). */
export const SEEN_DEVICE_LOCALE_KEY = 'gaia.deviceLocale';

interface LocaleState {
    /** The language the person picked in the app; null follows the phone. */
    locale: string | null;
    /** True once the saved pick has been read; the first frame waits for it so direction is right. */
    hydrated: boolean;
    /** A pick in GAIA, saved as the phone's per-app language where it has one, else by the app. */
    setLocale(code: string | null): void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
    locale: null,
    hydrated: false,
    setLocale: (locale) => {
        set({ locale });
        saveLocale(locale);
    },
}));

function message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function saveLocale(code: string | null): void {
    const perApp = appLanguageSetting();
    if (perApp) {
        try {
            perApp.set(code);
        } catch (err) {
            console.error(`Could not save the language as GAIA's language in the phone's Settings: ${message(err)}`);
        }
        return;
    }
    const write = code ? AsyncStorage.setItem(KEY, code) : AsyncStorage.removeItem(KEY);
    write.catch((err: unknown) => {
        console.error(`Could not save the language: ${message(err)}`);
    });
}

function languageOf(tag: string | null): string | null {
    const code = tag?.split('-')[0]?.toLowerCase() ?? null;
    return code && isLocaleCode(code) ? code : null;
}

/**
 * Re-reads the per-app language, which the phone's Settings can change while GAIA runs, without writing it back.
 * False where the phone has none and GAIA keeps the pick itself.
 */
export function syncLocaleFromPlatform(): boolean {
    const perApp = appLanguageSetting();
    if (!perApp) return false;
    const locale = languageOf(perApp.get());
    if (locale !== useLocaleStore.getState().locale) useLocaleStore.setState({ locale });
    return true;
}

/** Once, from builds that kept the pick themselves: the per-app setting takes it over, so nothing changes for the person. */
async function migrateStoredPick(perApp: AppLanguageSetting, saved: string): Promise<void> {
    // Android: a per-app language set in system Settings since the phone was last seen would have replaced the pick.
    const seen = Platform.OS === 'android' ? await AsyncStorage.getItem(SEEN_DEVICE_LOCALE_KEY) : null;
    const current = languageOf(perApp.get());
    const phoneMoved = seen !== null && current !== null && current !== seen;
    if (isLocaleCode(saved) && !phoneMoved) perApp.set(saved);
    await AsyncStorage.removeItem(KEY);
}

export async function hydrateLocale(): Promise<void> {
    try {
        const saved = await AsyncStorage.getItem(KEY);
        const perApp = appLanguageSetting();
        if (!perApp) {
            useLocaleStore.setState({ locale: saved && isLocaleCode(saved) ? saved : null, hydrated: true });
            return;
        }
        if (saved !== null) await migrateStoredPick(perApp, saved);
        useLocaleStore.setState({ locale: languageOf(perApp.get()), hydrated: true });
    } catch (err) {
        console.error(`Could not read the saved language; following the phone: ${message(err)}`);
        useLocaleStore.setState({ hydrated: true });
    }
}

void hydrateLocale();
