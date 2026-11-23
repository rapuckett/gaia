// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { translator } from '@/i18n/useT';

import { NOTICE_TEXT, type ActionFailure } from './approvalActions';

// The "Needs you" channel GaiaMessagingService creates before it posts an approval (PushInbox.NEEDS_YOU).
const ANDROID_CHANNEL = 'gaia.needs_you';

/** Marks the app's own notice in its data, so it shows as a banner even while the app is open. */
export const NOTICE_DATA_KEY = 'gaiaNotice';

export function isActionNotice(data: unknown): boolean {
    return !!data && typeof data === 'object' && (data as Record<string, unknown>)[NOTICE_DATA_KEY] === true;
}

/** Why a notification's Approve or Deny wasn't sent, in plain words, as system text without the English brackets. */
export function noticeContent(reason: ActionFailure, locale: string, sessionId: string | null): Notifications.NotificationContentInput {
    const t = translator(locale);
    return {
        title: t.bare('mobileApp.push.action.title'),
        body: t.bare(NOTICE_TEXT[reason]),
        // Tapping it opens the chat to answer there; the chat id is not shown.
        data: { [NOTICE_DATA_KEY]: true, ...(sessionId ? { route: `/chat/${sessionId}` } : {}) },
    };
}

/** Posts the notice now. A notice that can't be posted is logged, so a failure is never silent. */
export async function postActionNotice(reason: ActionFailure, locale: string, sessionId: string | null): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: noticeContent(reason, locale, sessionId),
            trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : null,
        });
    } catch (error) {
        console.error(`Could not show why an answer from a notification wasn't sent (${reason})`, error);
    }
}
