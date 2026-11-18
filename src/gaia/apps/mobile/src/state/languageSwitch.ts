// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';
import { create } from 'zustand';

import { getLocale } from '@webui/i18n/registry';

import { deviceLocaleCode } from '@/i18n/useT';
import { applyDirection, layoutDirection } from '@/platform/direction';
import { useLocaleStore } from '@/state/locale';

interface LanguageSwitchState {
    /** The language waiting for a restart; null when no cover is up. */
    target: string | null;
    /** The saved pick to go back to on Cancel (null followed the phone). */
    previousPick: string | null;
    cancel(): void;
}

export const useLanguageSwitch = create<LanguageSwitchState>((set, get) => ({
    target: null,
    previousPick: null,
    cancel: () => {
        const { target, previousPick } = get();
        if (target === null) return;
        const previous = previousPick ?? deviceLocaleCode();
        // Flags first, so the layout is never half-flipped between the two writes.
        applyDirection(getLocale(previous).meta.dir, previous, previousPick !== null);
        useLocaleStore.getState().setLocale(previousPick);
        set({ target: null, previousPick: null });
    },
}));

/** Applies a language pick; when it flips the layout, which only a restart finishes, covers the app until Cancel or a restart. */
export function pickLanguage(code: string): void {
    const previousPick = useLocaleStore.getState().locale;
    // Flags first, so the next launch is laid out for the pick however the app is closed.
    applyDirection(getLocale(code).meta.dir, code, true);
    useLocaleStore.getState().setLocale(code);
    // The web flips its layout live; only native needs a restart.
    if (Platform.OS !== 'web' && getLocale(code).meta.dir !== layoutDirection()) useLanguageSwitch.setState({ target: code, previousPick });
}
