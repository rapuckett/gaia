// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useChatStore } from '../stores/chatStore';
import { DEFAULT_LOCALE } from './registry';
import { translator, type Translate } from './translator';

export { translator, type Translate };

/** The translator for the chosen interface language; re-renders when it changes. */
export function useT(): Translate {
    return translator(useChatStore((s) => s.locale));
}

/** Outside React (module helpers, event handlers): the language chosen right now. */
export function getT(): Translate {
    return translator(useChatStore.getState().locale);
}

/** English, for helpers whose callers pass no translator. */
export const tEn: Translate = translator('en');

/** Dates in the interface language with Western digits; English follows the PC's own region. */
export function dateLocale(t: Translate): string | undefined {
    return t.locale === DEFAULT_LOCALE ? undefined : `${t.locale}-u-nu-latn`;
}
