// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Wording for work a turn ran that GAIA could not copy for undo (#5225). */

import { isolate, pluralKey, ref, type MessageKey, type MessageRef, type PluralKey } from '../i18n/registry';
import type { Translate } from '../i18n/translator';
import type { UntrackedWork } from '../types/changes';

interface KindMessages {
    /** "{n} commands", `.one` / `.other`. */
    count: PluralKey;
    /** "Command" / "Commands", for a title that has no entry label. */
    name: PluralKey;
    /** Prefix for a single entry's label. */
    prefix: MessageKey;
}

const kind = (id: string) => ({
    count: `untracked.${id}` as PluralKey,
    name: `untracked.${id}.name` as PluralKey,
    prefix: `untracked.${id}.prefix` as MessageKey,
});

const KINDS: Record<string, KindMessages> = {
    shell: kind('shell'),
    run_python: kind('run_python'),
    execute_python_file: kind('execute_python_file'),
    mcp: kind('mcp'),
    install_cli: kind('install_cli'),
    late_write: kind('late_write'),
};

const MAX_LABEL = 120;

function truncate(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > MAX_LABEL ? `${flat.slice(0, MAX_LABEL - 1).trimEnd()}…` : flat;
}

export interface UntrackedEntry {
    /** The entry's description, cut to one short line; '' when it has none. */
    label: string;
    /** Its full text, for a tooltip. */
    detail: string;
    count: number;
}

export interface UntrackedGroup {
    kind: string;
    /** "Python snippets ×7", or "Python: counts errors by hour" for one entry. */
    title: string;
    count: number;
    /** Distinct entries, identical ones counted once. */
    entries: UntrackedEntry[];
}

function countRef(k: string, n: number): MessageRef {
    const known = KINDS[k];
    return known
        ? ref(pluralKey(known.count, n), { n })
        : ref('untracked.unknown', { n, kind: isolate(k, 'ltr') });
}

function collect(list: UntrackedWork[]) {
    const groups = new Map<string, { kind: string; count: number; entries: Map<string, UntrackedEntry> }>();
    for (const u of list) {
        let group = groups.get(u.kind);
        if (!group) {
            group = { kind: u.kind, count: 0, entries: new Map() };
            groups.set(u.kind, group);
        }
        group.count += 1;
        const detail = (u.detail ?? '').trim();
        const entry = group.entries.get(detail);
        if (entry) entry.count += 1;
        else group.entries.set(detail, { label: truncate(detail), detail, count: 1 });
    }
    return [...groups.values()];
}

/** Untracked work by kind, in the order it ran, identical entries merged. */
export function groupUntracked(list: UntrackedWork[], t: Translate): UntrackedGroup[] {
    return collect(list).map(({ kind, count, entries }) => {
        const known = KINDS[kind];
        const distinct = [...entries.values()];
        const title = t.compose((say) => {
            const name = (n: number) => (known ? say(pluralKey(known.name, n)) : isolate(kind, 'ltr'));
            if (distinct.length !== 1) return say('untracked.times', { title: name(2), n: count });
            const only = distinct[0];
            const text = only.label
                ? say('untracked.titleOf', { prefix: known ? ref(known.prefix) : isolate(kind, 'ltr'), label: only.label })
                : name(1);
            return only.count > 1 ? say('untracked.times', { title: text, n: only.count }) : text;
        });
        return { kind, title, count, entries: distinct };
    });
}

function workRef(list: UntrackedWork[]): MessageRef {
    const parts = collect(list).map((g) => countRef(g.kind, g.count));
    if (parts.length === 0) return ref('untracked.none');
    let joined = parts[0];
    parts.slice(1, -1).forEach((next) => {
        joined = ref('untracked.join.comma', { head: joined, next });
    });
    return parts.length > 1 ? ref('untracked.join.and', { head: joined, last: parts[parts.length - 1] }) : joined;
}

/** "7 Python snippets", "2 commands and 3 Python snippets". */
export function describeUntracked(list: UntrackedWork[], t: Translate): string {
    const work = workRef(list);
    return t.compose((say) => say(work.ref, work.params));
}

/**
 * The warning under a turn or a chat that ran work GAIA could not copy.
 *
 * @param also   the turn changed tracked files too, so this is in addition.
 * @param inChat the warning covers the whole chat, not one turn.
 * @param undo   the message naming the button the sentence refers to.
 */
export function untrackedWarning(
    list: UntrackedWork[],
    t: Translate,
    { also = false, inChat = false, undo = 'untracked.undo' }: { also?: boolean; inChat?: boolean; undo?: MessageKey } = {},
): string {
    const lead: MessageKey = inChat ? (also ? 'untracked.lead.chatAlso' : 'untracked.lead.chat') : also ? 'untracked.lead.also' : 'untracked.lead.ran';
    const work = workRef(list);
    const key: PluralKey = 'untracked.warning';
    return t.compose((say) => say(pluralKey(key, list.length), { lead: ref(lead), work, undo: ref(undo) }));
}
