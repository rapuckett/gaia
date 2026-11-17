// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isMessageKey, type MessageKey } from '../i18n/registry';
import type { Translate } from '../i18n/translator';

/** `base.<CLDR plural form>` in one language half, so Arabic agrees with 2, 3-10 and 11+. */
function countedKey(base: string, n: number, code: string): MessageKey {
    const key = `${base}.${new Intl.PluralRules(code).select(n)}`;
    if (!isMessageKey(key)) throw new Error(`No "${key}" message for ${n} in ${code}; add every plural form to locales/${code}.ts.`);
    return key;
}

/** The done line after an undo, composed once per language so the English gloss appears once. */
export function undoneText(result: { restored: unknown[]; removed: unknown[]; kept_folders: unknown[] }, t: Translate): string {
    return t.compose((say, code) => {
        const part = (base: string, n: number) => say(countedKey(base, n, code), { n });
        const parts: string[] = [];
        if (result.restored.length) parts.push(part('mobileApp.changes.done.restored', result.restored.length));
        if (result.removed.length) parts.push(part('mobileApp.changes.done.removed', result.removed.length));
        const text = say('mobileApp.changes.done', { parts: parts.join(say('mobileApp.changes.done.join')) || say('mobileApp.changes.done.none') });
        return result.kept_folders.length ? `${text} ${part('mobileApp.changes.done.kept', result.kept_folders.length)}` : text;
    });
}
