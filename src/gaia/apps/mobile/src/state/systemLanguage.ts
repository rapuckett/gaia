// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { getLocale, isLocaleCode } from '@webui/i18n/registry';

import { deviceLanguageCode, deviceLocaleCode } from '@/i18n/useT';
import { layoutDirection } from '@/platform/direction';
import { useLanguageSwitch } from '@/state/languageSwitch';
import { useLocaleStore } from '@/state/locale';

const SEEN_KEY = 'gaia.deviceLocale';
const SHOWN_KEY = 'gaia.systemSwitchShown';

interface SystemSwitchState {
    /** The language Android's per-app setting switched to, while the layout still waits for a restart; null when none. */
    target: string | null;
}

export const useSystemSwitch = create<SystemSwitchState>(() => ({ target: null }));

let firstCheck = true;
let giveUp = false;

/** Tests only: back to a fresh process. */
export function resetSystemLanguageCheck(): void {
    firstCheck = true;
    giveUp = false;
    useSystemSwitch.setState({ target: null });
}

/**
 * Android 13+ lets a person change GAIA's language in system Settings while the app runs. React Native flips its
 * layout only on a full restart, so a language whose direction differs from the layout covers the app until then.
 * Call at start and whenever the app returns to the foreground, once the saved pick has loaded.
 */
export async function checkSystemLanguage(): Promise<void> {
    if (Platform.OS !== 'android') return;
    // An in-app pick has its own cover, with Cancel.
    if (useLanguageSwitch.getState().target !== null) return;
    const cold = firstCheck;
    firstCheck = false;
    try {
        const device = deviceLocaleCode();
        const reported = deviceLanguageCode();
        const [seen, shown] = await Promise.all([AsyncStorage.getItem(SEEN_KEY), AsyncStorage.getItem(SHOWN_KEY)]);
        if (seen !== reported) {
            await AsyncStorage.setItem(SEEN_KEY, reported);
            // The phone's setting is the newer word: drop an older in-app pick so it can't fight it on the next launch.
            // A language GAIA doesn't ship can't replace the pick.
            const pick = useLocaleStore.getState().locale;
            if (seen !== null && pick !== null && pick !== device && isLocaleCode(reported)) useLocaleStore.getState().setLocale(null);
        }
        const language = useLocaleStore.getState().locale ?? device;
        if (getLocale(language).meta.dir === layoutDirection()) {
            giveUp = false;
            useSystemSwitch.setState({ target: null });
            if (shown !== null) await AsyncStorage.removeItem(SHOWN_KEY);
            return;
        }
        if (giveUp) return;
        if (shown !== null && cold) {
            giveUp = true;
            console.error(
                `The layout is still ${layoutDirection()} after a restart although the language is "${language}" (${getLocale(language).meta.dir}). A restart cannot fix it, so the language-switch cover is skipped. Check that the Android per-app language and I18nManager agree (src/state/systemLanguage.ts).`,
            );
            return;
        }
        await AsyncStorage.setItem(SHOWN_KEY, language);
        useSystemSwitch.setState({ target: language });
    } catch (err) {
        console.error(`Could not check whether the system language switch needs a restart: ${err instanceof Error ? err.message : String(err)}`);
    }
}
