// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Library formatting shared by the web UI and the phone app; no DOM. */

import { isolate, type PluralKey } from '../i18n/registry';
import { dateLocale, type Translate } from '../i18n/translator';

/** "3 documents" with the count as its own left-to-right island, so Arabic keeps its colon and "·" in place. */
export function countText(t: Translate, base: PluralKey, n: number): string {
    return t.plural(base, n, { n: isolate(String(n), 'ltr') });
}

/** Format an ISO timestamp as a relative or absolute local time string. */
export function formatTimestamp(isoString: string, t: Translate, now: Date = new Date()): string {
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return t('time.justNow');
        if (diffMin < 60) return t('time.minutesAgo', { n: diffMin });
        if (diffHour < 24) return t('time.hoursAgo', { n: diffHour });
        if (diffDay === 1) return t('time.yesterday');
        if (diffDay < 7) return t('time.daysAgo', { n: diffDay });

        // Older than a week: show date + time
        return date.toLocaleDateString(dateLocale(t), {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

/** Format an ISO timestamp as a full local date/time for tooltips. */
export function formatFullTimestamp(isoString: string, t: Translate): string {
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleString(dateLocale(t), {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch {
        return '';
    }
}
