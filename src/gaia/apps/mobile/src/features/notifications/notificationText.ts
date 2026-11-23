// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate, type MessageKey } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';
import type { GaiaNotification, NotificationType } from '@webui/types/agent';
import { noticeText, visibleStrict, visibleText } from '@webui/utils/calendarApproval.core';
import { permissionPromptText } from '@webui/utils/permissionPrompts.core';

export const FILTER_LABELS: Record<NotificationType, MessageKey> = {
    permission_request: 'notifications.filter.permissions',
    policy_alert: 'notifications.filter.policy',
    error: 'notifications.filter.errors',
    security_alert: 'notifications.filter.security',
    status_change: 'notifications.filter.status',
    info: 'notifications.filter.info',
};

/** The web's relative time: "just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function relativeTime(timestamp: number, now: number, t: Translate, locale: string): string {
    const secs = Math.floor((now - timestamp) / 1000);
    if (secs < 60) return t('time.justNow');
    const mins = Math.floor(secs / 60);
    if (mins < 60) return t('time.minutesAgo', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('time.hoursAgo', { n: hrs });
    const days = Math.floor(hrs / 24);
    if (days < 7) return t('time.daysAgo', { n: days });
    return new Date(timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** An approval reads as the chat's card does, not as its stored English text; hidden characters show as [U+XXXX] like the PC. */
export function notificationText(n: GaiaNotification, t: Translate): { title: string; message: string } {
    if (n.type === 'permission_request' && n.tool) {
        const { heading, question } = permissionPromptText(n, t, (s) => isolate(visibleStrict(s), 'ltr'));
        return { title: heading, message: question };
    }
    if (n.type === 'policy_alert') {
        const tool = n.tool ? visibleText(n.tool, true) : t('activity.policy.unknownTool');
        return { title: t('activity.policy.blocked', { tool }), message: noticeText(n.message) };
    }
    // An error's message is the PC's English reason.
    if (n.type === 'error') return { title: noticeText(n.title), message: isolate(noticeText(n.message), 'ltr') };
    return { title: noticeText(n.title), message: noticeText(n.message) };
}
