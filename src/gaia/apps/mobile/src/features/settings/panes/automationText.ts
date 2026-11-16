// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// The wording rules of webui's AutomationsSettings.tsx, which is a component and can't be imported.
// Each takes one language half's `say` and locale, so a composed line words its dates and plurals per half.

import { isMessageKey, isolateUnit, type MessageKey, type Say } from '@webui/i18n/registry';

const UNITS: [string, number][] = [['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];

/** "Every 30 minutes"; null for a span the catalog has no wording for. */
export function everyPhrase(seconds: number, say: Say, code: string): string | null {
    const unit = UNITS.find(([, size]) => seconds % size === 0) ?? UNITS[UNITS.length - 1]!;
    const n = Math.max(1, Math.round(seconds / unit[1]));
    const key = `schedules.span.${unit[0]}.${new Intl.PluralRules(code).select(n)}`;
    if (!isMessageKey(key)) return null;
    return say('schedules.desc.every', { span: say(key as MessageKey, { n }) });
}

/** An epoch-seconds time as the desktop shows it: weekday, day, month and clock, kept whole in either direction. */
export function formatWhen(epochSeconds: number, locale: string | undefined): string {
    return isolateUnit(
        new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
            new Date(epochSeconds * 1000),
        ),
    );
}

const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** The store's "mon,tue,…" as "Weekdays" or "Mon, Wed"; the raw text, kept left to right, for anything else. */
export function daysPhrase(days: string, say: Say): string {
    const idx = days.split(',').map((d) => DAY_CODES.indexOf(d.trim()));
    if (idx.some((i) => i < 0)) return isolateUnit(days);
    if (idx.length === 7) return say('schedules.days.every');
    if (idx.length === 5 && idx.every((i) => i < 5)) return say('schedules.days.weekdays');
    if (idx.length === 2 && idx.includes(5) && idx.includes(6)) return say('schedules.days.weekends');
    return idx.map((i) => say(`schedules.day.${i}` as MessageKey)).join(say('schedules.days.join'));
}
