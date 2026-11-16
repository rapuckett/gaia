// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from 'react';

import { isolate } from '@webui/i18n/registry';
import type { GaiaNotification } from '@webui/types/agent';
import type { Schedule } from '@webui/types';

import { useActiveRuns, useGoalStoreHealth, useSchedulesInApp } from '@/data';
import { useT } from '@/i18n/useT';
import { useAlertSettings } from '@/state/alertSettings';
import { useChatAlertBannerStore } from '@/state/chatAlertBanner';
import { createGoalHealthAnnouncer, GOAL_STORE_NOTIFICATION_ID } from '@/state/goalAlerts';
import { addNotification, markNotificationRead, useNotificationStore } from '@/state/notifications';
import { createScheduleAnnouncer } from '@/state/scheduleAlerts';

type Translate = ReturnType<typeof useT>;

function raiseScheduleFailure(failed: Schedule, t: Translate): void {
    const title = t('schedules.failed', { name: failed.name });
    const message = failed.last_error ?? '';
    const notification: GaiaNotification = {
        id: `schedule-error-${failed.id}-${failed.error_count}`,
        type: 'error',
        agentId: 'scheduler',
        agentName: 'GAIA',
        title,
        message,
        timestamp: Date.now(),
        read: false,
        dismissed: false,
        priority: 'high',
        ...(failed.session_id ? { sessionId: failed.session_id } : {}),
    };
    addNotification(notification);
    if (failed.session_id && useAlertSettings.getState().modes.finished === 'banner') {
        useChatAlertBannerStore.getState().show({ sessionId: failed.session_id, event: 'finished', tone: 'danger', title, message: isolate(message, 'ltr') });
    }
}

function raiseGoalStoreFailure(error: string, count: number, t: Translate): void {
    addNotification({
        id: `${GOAL_STORE_NOTIFICATION_ID}${count}`,
        type: 'error',
        agentId: 'goals',
        agentName: 'GAIA',
        title: t('mem.goals.storeError'),
        message: error,
        timestamp: Date.now(),
        read: false,
        dismissed: false,
        priority: 'high',
    });
}

function readGoalStoreFailures(): void {
    for (const n of useNotificationStore.getState().items) {
        if (n.id.startsWith(GOAL_STORE_NOTIFICATION_ID) && !n.read) markNotificationRead(n.id);
    }
}

/**
 * The app-wide reads the web makes: the schedules and the running chats, every 30 s while the app is active.
 * A scheduled task that failed, including while the app was closed, raises one alert in the center and the banner.
 * An unreadable goal store raises one alert per failure, read again once the store opens.
 */
export function AppPolls() {
    const t = useT();
    useActiveRuns();
    const schedules = useSchedulesInApp().data?.schedules;
    const liveT = useRef(t);
    useEffect(() => {
        liveT.current = t;
    });
    const announcer = useRef<ReturnType<typeof createScheduleAnnouncer> | null>(null);
    useEffect(() => {
        if (!schedules) return;
        announcer.current ??= createScheduleAnnouncer((failed) => raiseScheduleFailure(failed, liveT.current));
        void announcer.current(schedules);
    }, [schedules]);
    const goalStoreError = useGoalStoreHealth().data?.error;
    const goalAnnouncer = useRef<ReturnType<typeof createGoalHealthAnnouncer> | null>(null);
    useEffect(() => {
        if (goalStoreError === undefined) return;
        goalAnnouncer.current ??= createGoalHealthAnnouncer(
            (error, count) => raiseGoalStoreFailure(error, count, liveT.current),
            readGoalStoreFailures,
        );
        goalAnnouncer.current(goalStoreError);
    }, [goalStoreError]);
    return null;
}
