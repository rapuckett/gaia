// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { CATEGORY_KEYS, type KnowledgeEntry } from '@webui/utils/memoryFormat.core';

import { compose, type MessageKey } from '@webui/i18n/registry';

import { describeFailureWith, type Translate } from '@/i18n/useT';
import type { BadgeTone } from '@/ui';

export const CATEGORY_TONE: Record<string, BadgeTone> = {
    fact: 'accent',
    preference: 'success',
    error: 'danger',
    skill: 'neutral',
    note: 'neutral',
    reminder: 'warning',
};

/** A category's label; an error GAIA saved by itself reads "Learned by GAIA", as on the web. `bare` drops Arabic's English brackets for a badge or chip. */
export function categoryLabel(category: string, source: string | undefined, t: Translate, bare: boolean): string {
    const key = category === 'error' && source === 'error_auto' ? 'mem.cat.errorLearned' : CATEGORY_KEYS[category];
    if (!key) return category;
    return bare ? t.bare(key) : t(key);
}

export type KnowledgeFeedback = { tone: 'danger' | 'info' | 'success'; text: string } | null;

export type { KnowledgeEntry };

/** A failure inside its message, bracketed once: a PC's reason goes in as sent, one of ours is filled in the same language. */
export function failureText(code: string, key: MessageKey, error: unknown): string {
    return compose(code, (say) => say(key, { error: describeFailureWith(error, say) }));
}

/** The notice after a save; a memory the PC couldn't embed says why when it gave a reason, as the web does. */
export function savedNotice(code: string, result: { embedded?: boolean; embed_error?: string } | undefined, edited: boolean): { tone: 'danger' | 'success'; text: string } {
    if (result?.embedded === false) {
        const text = compose(code, (say) => (result.embed_error ? say('mem.toast.server', { message: result.embed_error }) : say('mem.toast.notEmbedded')));
        return { tone: 'danger', text };
    }
    return { tone: 'success', text: compose(code, (say) => say(edited ? 'mem.toast.updated' : 'mem.toast.created')) };
}
