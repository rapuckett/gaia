// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** GAIA's own language as the phone's Settings show it (iOS AppleLanguages in the app's domain, Android 13+ per-app language). Never the phone's language. */
export interface AppLanguageSetting {
    /** False on Android below 13, which has no per-app language. */
    readonly supported: boolean;
    /** The app's language tag, such as "ar"; null when it follows the phone. */
    get(): string | null;
    /** One language tag, or null to follow the phone again. */
    set(tag: string | null): void;
}

const native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule<AppLanguageSetting>('GaiaAppLanguage') : null;

/** The per-app language setting; null on the web, on Android below 13, and in builds made before the module, which keep the pick themselves. */
export function appLanguageSetting(): AppLanguageSetting | null {
    return native?.supported ? native : null;
}
