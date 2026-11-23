// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useActiveRuns, useSessions } from '@/data';
import { alertsBetween } from '@/features/banners/chatAlerts';
import { useChatStreamStore } from '@/state/chatStreams';
import { useConnectionStore } from '@/state/connection';
import { useLocaleStore } from '@/state/locale';

import { gaiaPush } from '../../../modules/gaia-push';
import { chatBadgeCount } from './badge';
import { INITIAL_OFFER_STATE, offerStep, type OfferEvent } from './offerTrigger';
import { PushExplainer } from './PushExplainer';
import { notificationRoute } from './pushRoutes';
import { pushAvailable } from './pushConfig';
import { refreshPermission, requestPushPermission, resetPush, syncPush } from './pushService';
import { usePushStore } from './pushStore';

/** Offers push at Design's moment: the first return after a run finished or an approval waited while away. */
function useOfferTrigger() {
    const state = useRef(INITIAL_OFFER_STATE);
    useEffect(() => {
        const step = (event: OfferEvent) => {
            const next = offerStep(state.current, event);
            state.current = next.state;
            const push = usePushStore.getState();
            if (next.offer && push.offered === false && push.permission === 'undetermined' && !push.explainerOpen) push.openExplainer(true);
        };
        const app = AppState.addEventListener('change', (s) => step({ type: 'app', state: s, at: Date.now() }));
        const streams = useChatStreamStore.subscribe((now, prev) => {
            if (now.turns === prev.turns) return;
            const counts = alertsBetween(prev.turns, now.turns).some((a) => (a.event === 'finished' ? a.outcome !== 'stopped' : true));
            if (counts) step({ type: 'alert', at: Date.now() });
        });
        return () => {
            app.remove();
            streams();
        };
    }, []);
}

/** Opens a tapped iOS notification's chat; Android's open through the push link in +native-intent. */
function useTapRouting() {
    const router = useRouter();
    const response = Notifications.useLastNotificationResponse();
    const handled = useRef<string | null>(null);
    useEffect(() => {
        if (!response) return;
        const id = `${response.notification.request.identifier}:${response.actionIdentifier}`;
        if (handled.current === id) return;
        handled.current = id;
        router.push(notificationRoute(response.notification.request.content.data) as never);
        Notifications.clearLastNotificationResponseAsync().catch((error: unknown) => console.error('Could not clear the opened notification', error));
    }, [response, router]);
}

/** The badge follows the PC's chats on every open (iOS; Android's launcher counts what's on show). */
function useBadgeResync() {
    const sessions = useSessions().data?.sessions;
    const active = useActiveRuns().data;
    const granted = usePushStore((s) => s.permission === 'granted');
    useEffect(() => {
        if (!granted || Platform.OS !== 'ios' || !sessions || !active) return;
        Notifications.setBadgeCountAsync(chatBadgeCount(sessions, active)).catch((error: unknown) => console.error('Could not set the app badge', error));
    }, [granted, sessions, active]);
}

/** Push on the phone: registration on start and on each new pairing, the explainer, tap routing and the badge. Renders only the explainer. */
export function PushHost() {
    return pushAvailable() ? <ActivePush /> : null;
}

function ActivePush() {
    const pcId = useConnectionStore((s) => s.connection?.pcId ?? null);
    const locale = useLocaleStore((s) => s.locale);
    const open = usePushStore((s) => s.explainerOpen);

    useEffect(() => {
        usePushStore.getState().loadOffered().catch((error: unknown) => console.error('Could not read whether notifications were offered', error));
    }, []);

    // Every start re-sends the token (it may have rotated), and a newly paired PC gets its own registration.
    useEffect(() => {
        void syncPush();
    }, [pcId]);

    // Coming back from the phone's Settings may have changed the permission: off resets push everywhere, on registers afresh.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            const before = usePushStore.getState().permission;
            refreshPermission()
                .then((now) => {
                    if (now === 'granted' && before !== 'granted') void syncPush();
                    else if (now !== 'granted' && before === 'granted') void resetPush();
                })
                .catch((error: unknown) => console.error('Could not read the notification permission', error));
        });
        return () => sub.remove();
    }, []);

    useEffect(() => {
        gaiaPush()
            ?.setLanguage(locale)
            .catch((error: unknown) => console.error('Could not give the notification extension the app language', error));
    }, [locale]);

    useOfferTrigger();
    useTapRouting();
    useBadgeResync();

    return (
        <PushExplainer
            open={open}
            onAllow={() => {
                usePushStore.getState().closeExplainer();
                requestPushPermission().catch((error: unknown) => console.error('Asking for the notification permission failed', error));
            }}
            onLater={() => usePushStore.getState().closeExplainer()}
        />
    );
}
