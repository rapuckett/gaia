// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Memory dashboard types and formatters with no DOM or store, shared by the web and the phone app. */

import type { MessageKey } from '../i18n/registry';
import { dateLocale, type Translate } from '../i18n/translator';

/** The label of each memory category. */
export const CATEGORY_KEYS: Record<string, MessageKey> = {
    fact: 'mem.cat.fact', preference: 'mem.cat.preference', error: 'mem.cat.error',
    skill: 'mem.cat.skill', note: 'mem.cat.note', reminder: 'mem.cat.reminder',
};

/** The Activity chart's ranges in days, and the one it opens on. */
export const ACTIVITY_RANGES = [1, 7, 30] as const;
export const DEFAULT_ACTIVITY_DAYS = 30;
/** How far ahead Upcoming & Overdue looks. */
export const UPCOMING_DAYS = 7;

export const ACTIVITY_RANGE_LABELS: Record<(typeof ACTIVITY_RANGES)[number], MessageKey> = {
    1: 'mem.activity.day1',
    7: 'mem.activity.days7',
    30: 'mem.activity.days30',
};

export interface ActivityDay {
    date: string;
    conversations: number;
    tool_calls: number;
    knowledge_added: number;
    errors: number;
}


export interface ToolStat {
    tool_name: string;
    total_calls: number;
    success_count: number;
    failure_count: number;
    denied_count?: number;
    success_rate: number;
    avg_duration_ms: number;
    last_used: string | null;
    last_error: string | null;
}


export interface TemporalItem {
    id: string;
    content: string;
    category: string;
    due_at: string;
    reminded_at: string | null;
    context: string;
    created_at: string;
}

export function formatDate(iso: string | null, locale: string | undefined): string {
    if (!iso) return '\u2014';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '\u2014';
        const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
        return d.toLocaleDateString(locale, opts);
    } catch { return '\u2014'; }
}

export function formatDateFull(iso: string | null, locale: string | undefined): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString(locale, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    } catch { return ''; }
}

export function formatRelativeDate(iso: string | null, t: Translate): string {
    if (!iso) return '\u2014';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '\u2014';
        const now = Date.now();
        const diff = d.getTime() - now;
        const absDiff = Math.abs(diff);
        const secs = Math.floor(absDiff / 1000);
        const mins = Math.floor(absDiff / 60000);
        const hours = Math.floor(absDiff / 3600000);
        const days = Math.floor(absDiff / 86400000);

        if (diff < 0) {
            // Past
            if (secs < 5) return t('time.justNow');
            if (secs < 60) return t('mem.rel.secondsAgo', { n: secs });
            if (hours === 0) return t('time.minutesAgo', { n: mins });
            if (days === 0) return t('time.hoursAgo', { n: hours });
            if (days === 1) return t('time.yesterday');
            if (days < 30) return t('time.daysAgo', { n: days });
            return formatDateFull(iso, dateLocale(t));
        } else {
            // Future
            if (secs < 5) return t('mem.rel.now');
            if (secs < 60) return t('mem.rel.inSeconds', { n: secs });
            if (hours === 0) return t('mem.rel.inMinutes', { n: mins });
            if (days === 0) return t('mem.rel.inHours', { n: hours });
            if (days === 1) return t('mem.rel.tomorrow');
            if (days < 30) return t('mem.rel.inDays', { n: days });
            return formatDateFull(iso, dateLocale(t));
        }
    } catch { return '\u2014'; }
}

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export function isOverdue(dueAt: string): boolean {
    try {
        return new Date(dueAt).getTime() < Date.now();
    } catch { return false; }
}

export function successRateClass(rate: number): string {
    if (rate >= 0.9) return 'high';
    if (rate >= 0.7) return 'medium';
    return 'low';
}

export function formatDateRange(start: string | null, end: string | null, locale: string | undefined): string {
    const s = formatDate(start, locale);
    const e = formatDate(end, locale);
    if (s === '\u2014' && e === '\u2014') return '';
    if (s === e) return s;
    return `${s} \u2013 ${e}`;
}

/** Count today's activity from the timeline data. */
export function todayCount(activity: ActivityDay[]): number {
    if (activity.length === 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayData = activity.find(d => d.date === today);
    if (!todayData) return 0;
    return todayData.knowledge_added;
}
