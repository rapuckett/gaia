// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

interface LocaleState {
    /** The language the person picked in the app; null follows the phone's. */
    locale: string | null;
    setLocale(code: string | null): void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
    locale: null,
    setLocale: (locale) => set({ locale }),
}));
