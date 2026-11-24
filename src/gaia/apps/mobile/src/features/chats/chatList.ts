// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { pluralKey, type MessageKey } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';
import { placeInLine } from '@webui/utils/chatAlerts.core';
import { MAX_SESSION_TITLE_CHARS } from '@webui/utils/constants';
import {
    groupSessionsForList,
    sessionRowStatus,
    type ListGroup,
    type LiveRuns,
    type RowStatus,
} from '@webui/utils/sessionGrouping';

import { foldText } from '@webui/utils/chatSearch';

import { GaiaError } from '@/api/errors';
import { describeErrorWith, serverText } from '@/i18n/useT';
import type { Session, SessionSearchResult } from '@/api/client.types';

export type { LiveRuns, RowStatus };

export const NO_LIVE_RUNS: LiveRuns = { running: [], queued: [], awaiting: {}, prompting: [] };

export interface QueuedMessage {
    state: string;
}

export type StatusTone = 'idle' | 'running' | 'attention' | 'error' | 'success';

const STATUS_TITLE: Record<RowStatus, MessageKey> = {
    running: 'row.status.running',
    queued: 'row.status.queued',
    waiting: 'row.status.waiting',
    done: 'row.status.done',
    failed: 'row.status.failed',
};

const STATUS_TONE: Record<RowStatus, StatusTone> = {
    running: 'running',
    queued: 'idle',
    waiting: 'attention',
    done: 'success',
    failed: 'error',
};

export interface ChatRow {
    id: string;
    title: string;
    active: boolean;
    unread: boolean;
    /** The dot to show; a done turn shows none once read. */
    dot: RowStatus | null;
    /** 1-based place in line for the GPU while queued; 0 otherwise. */
    place: number;
    private: boolean;
    pinned: boolean;
    unsent: number;
    failed: number;
}

export interface ChatSection {
    key: ListGroup['label'];
    titleKey: MessageKey;
    data: ChatRow[];
}

export interface ChatListInput {
    sessions: readonly Session[];
    activeId?: string | null;
    live?: LiveRuns;
    /** Per-chat messages typed but not yet sent (the composer's queue). */
    queues?: Readonly<Record<string, readonly QueuedMessage[]>>;
    now?: Date;
    /** Include eval and scheduled runs, which the list hides by default. */
    showAutomated?: boolean;
}

export function buildChatSections({
    sessions,
    activeId = null,
    live = NO_LIVE_RUNS,
    queues = {},
    now,
    showAutomated,
}: ChatListInput): ChatSection[] {
    return groupSessionsForList([...sessions], live, { now, showAutomated }).map((group) => ({
        key: group.label,
        titleKey: group.label,
        data: group.sessions.map((s): ChatRow => {
            const active = s.id === activeId;
            const unread = !!s.unread && !active;
            const status = sessionRowStatus(s, live);
            const queue = queues[s.id] ?? [];
            return {
                id: s.id,
                title: s.title,
                active,
                unread,
                dot: status === 'done' && !unread ? null : status,
                place: live.queued.indexOf(s.id) + 1,
                private: !!s.private,
                pinned: !!s.pinned,
                unsent: queue.length,
                failed: queue.filter((m) => m.state === 'failed').length,
            };
        }),
    }));
}

/** Milliseconds from `now` to the next local midnight (at least 1, so a timer never spins). */
export function msUntilNextMidnight(now: Date): number {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(1, next.getTime() - now.getTime());
}

export type ChatListState = 'loading' | 'error' | 'empty' | 'list';

export function chatListState(query: { isPending: boolean; isError: boolean }, sections: readonly ChatSection[]): ChatListState {
    if (query.isError) return 'error';
    if (query.isPending) return 'loading';
    return sections.length === 0 ? 'empty' : 'list';
}

export function statusTone(dot: RowStatus): StatusTone {
    return STATUS_TONE[dot];
}

export interface RowText {
    /** The dot's accessible text, with the place in line when queued. */
    status: string | null;
    /** "2nd in line · 1 not sent"; null when there is nothing to say. */
    note: string | null;
    noteFailed: boolean;
    aria: string;
}

export function rowText(row: ChatRow, t: Translate): RowText {
    const place = row.place > 0 ? placeInLine(t, 'row.queuePlace', row.place) : null;
    const status = row.dot ? [t(STATUS_TITLE[row.dot]), place].filter(Boolean).join(', ') : null;
    const waiting = row.failed > 0 ? t.plural('row.notSent', row.failed) : row.unsent > 0 ? t.plural('row.toSend', row.unsent) : null;
    const note = [place, waiting].filter(Boolean).join(' · ') || null;
    const aria = [row.title, status, waiting, row.unread ? t('row.unread') : null].filter(Boolean).join(', ');
    return { status, note, noteFailed: row.failed > 0, aria };
}

/** "Delete? Tap again" for the second tap, as one sentence so the Arabic carries one English gloss. */
export function deleteConfirmLabel(row: Pick<ChatRow, 'unsent'>, t: Translate): string {
    return t.compose((say) =>
        say('row.tapAgain', { label: row.unsent > 0 ? say(pluralKey('row.deleteUnsent', row.unsent), { n: row.unsent }) : say('row.deleteConfirm') }),
    );
}

export type RowErrorKind = 'delete' | 'rename' | 'pin' | 'unpin' | 'markRead';

const ROW_ERROR_KEY: Record<Exclude<RowErrorKind, 'markRead'>, MessageKey> = {
    delete: 'sidebar.deleteFailed',
    rename: 'sidebar.renameFailed',
    pin: 'sidebar.pinFailed',
    unpin: 'sidebar.unpinFailed',
};

/** The reason-free sentence for a failed row action, plus the PC's own text for the detail line. */
export function rowFailure(kind: RowErrorKind, error: unknown, t: Translate): { message: string; detail?: string } {
    const message = t(kind === 'markRead' ? 'mobileApp.chats.markReadFailed' : ROW_ERROR_KEY[kind]);
    const detail = serverText(error);
    if (detail && detail !== message) return { message, detail };
    return error instanceof GaiaError ? { message: describeErrorWith(error, t) } : { message };
}

/** Chats whose title holds `query` or whose messages the backend matched, in the list's own order. */
export function searchedSessions(
    sessions: readonly Session[],
    query: string,
    hits: ReadonlyMap<string, SessionSearchResult>,
): Session[] {
    const needle = foldText(query.trim());
    return sessions.filter((s) => foldText(s.title).includes(needle) || hits.has(s.id));
}

export type RowAction = 'rename' | 'pin' | 'unpin' | 'delete';

/** The "⋯" menu's items, in the web menu's order; a pinned chat offers Unpin. */
export function rowActions(row: Pick<ChatRow, 'pinned'>): RowAction[] {
    return ['rename', row.pinned ? 'unpin' : 'pin', 'delete'];
}

/** What a rename saves: the trimmed, capped title, or null when there is nothing to change. */
export function renamedTitle(draft: string, previous: string): string | null {
    const title = draft.trim().slice(0, MAX_SESSION_TITLE_CHARS).trim();
    return !title || draft === previous || title === previous ? null : title;
}
