// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { SessionChanges } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { pluralCategory } from '@/i18n/plural';
import { describeFailureWith, type Translate } from '@/i18n/useT';
import { isMessageKey, isolate, ref, type MessageKey, type Say } from '@webui/i18n/registry';

/** "4 files" as a message param, so each language words its own count. */
export const filesRef = (n: number) => ref(n === 1 ? 'chg.files.one' : 'chg.files.other', { n });

/** "+120 −8" as one left-to-right island, so the signs stay with their numbers in right-to-left text. */
export function countsText(additions: number, deletions: number): string {
    return isolate(`+${additions} \u2212${deletions}`, 'ltr');
}

/** A failed load as our sentence plus the PC's own reason, which stays out of the sentence and goes on its own line. */
export function loadFailure(error: unknown, t: Translate, keys: { withReason: 'turnChanges.loadError' | 'mobileApp.changes.loadFailed'; noReason: 'turnChanges.loadErrorNoReason' | 'mobileApp.changes.loadFailedNoReason' }): { text: string; detail?: string } {
    if (error instanceof GaiaApiError && error.detail) return { text: t(keys.noReason), detail: error.detail };
    return { text: t.compose((say) => say(keys.withReason, { error: describeFailureWith(error, say) })) };
}

/** `base.<CLDR plural form>` in one language half, so Arabic agrees with 2, 3-10 and 11+. */
function countedKey(base: string, n: number, code: string): MessageKey {
    const key = `${base}.${pluralCategory(code, n)}`;
    if (!isMessageKey(key)) throw new Error(`No "${key}" message for ${n} in ${code}; add every plural form to locales/${code}.ts.`);
    return key;
}

/** The done line after an undo, composed once per language so the English gloss appears once; the counts agree per half. */
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

/** "4 files" in one language half, agreeing with the count. */
function filesPart(say: Say, code: string, n: number): string {
    return say(countedKey('mobileApp.changes.chat.files', n, code), { n });
}

/** The chat's counts as one sentence with one gloss; `key` picks the wording around the files and counts. */
function chatLine(changes: SessionChanges, t: Translate, key: 'mobileApp.changes.chat.total' | 'mobileApp.changes.chat.summary'): string {
    const { files, additions, deletions } = changes.totals;
    return t.compose((say, code) => say(key, { files: filesPart(say, code, files), counts: countsText(additions, deletions) }));
}

/** "4 files changed, +120 −8". */
export const totalText = (changes: SessionChanges, t: Translate) => chatLine(changes, t, 'mobileApp.changes.chat.total');

/** "4 files · +120 −8". */
export const summaryText = (changes: SessionChanges, t: Translate) => chatLine(changes, t, 'mobileApp.changes.chat.summary');

/** The Review changes sheet's heading line, composed with the totals so the gloss appears once. */
export function reviewHeadingText(changes: SessionChanges, t: Translate): string {
    const { files, additions, deletions } = changes.totals;
    return t.compose((say, code) =>
        say('mobileApp.changes.chat.reviewHeading', {
            total: say('mobileApp.changes.chat.total', { files: filesPart(say, code, files), counts: countsText(additions, deletions) }),
        }),
    );
}
