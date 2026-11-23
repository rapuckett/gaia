// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { GaiaTransportMissingError } from '@/api/errors';
import { useActiveRuns, useSessions } from '@/data';
import { useGaiaClient } from '@/data/GaiaClientProvider';
import { confirmPermission } from '@/data/mutations';
import { alertsBetween } from '@/features/banners/chatAlerts';
import { activeChatId } from '@/features/nav/navigation';
import { translator, useLocaleCode } from '@/i18n/useT';
import { useAlertSettings } from '@/state/alertSettings';
import { useChatStreamStore } from '@/state/chatStreams';
import { useConnectionStore } from '@/state/connection';
import { useLocaleStore } from '@/state/locale';

import { gaiaPush } from '../../../modules/gaia-push';
import { postActionNotice } from './actionNotice';
import { answerFromNotification, readApprovalAction, type ApprovalAction } from './approvalActions';
import { chatBadgeCount } from './badge';
import { INITIAL_OFFER_STATE, offerStep, type OfferEvent } from './offerTrigger';
import { PushExplainer } from './PushExplainer';
import { notificationRoute, safePushRoute } from './pushRoutes';
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

/** Sends a notification's Approve or Deny through the paired PC's pinned client, as the chat's own Allow does. */
function useAnswerFromNotification(): (action: ApprovalAction) => void {
    const client = useGaiaClient();
    const locale = useLocaleCode();
    return useCallback(
        (action: ApprovalAction) => {
            answerFromNotification(action, {
                currentPcId: () => useConnectionStore.getState().connection?.pcId ?? null,
                confirm: (request) => (client ? confirmPermission(client, request) : Promise.reject(new GaiaTransportMissingError())),
                notify: (reason, sessionId) => postActionNotice(reason, locale, sessionId),
                now: Date.now,
            }).catch((error: unknown) => console.error('Answering from a notification failed', error));
        },
        [client, locale],
    );
}

/**
 * Opens a tapped notification's chat, and sends its Approve or Deny: iOS notifications and the app's own notices come
 * through expo-notifications; Android's pushes open through the push link in +native-intent.
 */
function useTapRouting(answer: (action: ApprovalAction) => void) {
    const router = useRouter();
    const response = Notifications.useLastNotificationResponse();
    const handled = useRef<string | null>(null);
    useEffect(() => {
        if (!response) return;
        const id = `${response.notification.request.identifier}:${response.actionIdentifier}`;
        if (handled.current === id) return;
        handled.current = id;
        const data = response.notification.request.content.data as Record<string, unknown> | null | undefined;
        const action = readApprovalAction(response.actionIdentifier, data?.approval);
        if (action) answer(action);
        router.push(notificationRoute(data) as never);
        Notifications.clearLastNotificationResponseAsync().catch((error: unknown) => console.error('Could not clear the opened notification', error));
    }, [response, router, answer]);
}

/** Android's Approve and Deny open the app with the answer in hand: the one that started it, then each one while it runs. */
function useAndroidApprovalActions(answer: (action: ApprovalAction) => void) {
    const router = useRouter();
    useEffect(() => {
        const native = gaiaPush();
        if (Platform.OS !== 'android' || !native?.takeApprovalAction || !native.addListener) return;
        const run = (event: ApprovalAction | null) => {
            if (!event) return;
            answer(event);
            router.push(safePushRoute(`/chat/${event.sessionId}`) as never);
        };
        const read = (raw: unknown) => {
            const kind = raw && typeof raw === 'object' ? (raw as { action?: unknown }).action : undefined;
            return typeof kind === 'string' ? readApprovalAction(kind, raw) : null;
        };
        // Listen first, then take what came before, so an action between the two isn't lost.
        const sub = native.addListener('onApprovalAction', (event) => run(read(event)));
        run(read(native.takeApprovalAction()));
        return () => sub.remove();
    }, [answer, router]);
}

/** Titles the iOS approval notification's Approve and Deny in the app's language; Android labels its own. */
function useApprovalActionTitles(locale: string) {
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        const t = translator(locale);
        gaiaPush()
            ?.setApprovalActions(t.bare('notifications.approve'), t.bare('notifications.deny'))
            .catch((error: unknown) => console.error("Could not set the approval notification's buttons", error));
    }, [locale]);
}

/** The badge follows the PC's chats on every open (iOS; Android's launcher counts what's on show). */
function useBadgeResync() {
    const sessions = useSessions().data?.sessions;
    const active = useActiveRuns().data;
    const granted = usePushStore((s) => s.permission === 'granted');
    const modes = useAlertSettings((s) => s.modes);
    const openId = activeChatId(usePathname());
    useEffect(() => {
        if (!granted || Platform.OS !== 'ios' || !sessions || !active) return;
        Notifications.setBadgeCountAsync(chatBadgeCount(sessions, active, modes, openId)).catch((error: unknown) => console.error('Could not set the app badge', error));
    }, [granted, sessions, active, modes, openId]);
}

/** Push on the phone: registration on start and on each new pairing, the explainer, tap routing and the badge. Renders only the explainer. */
export function PushHost() {
    return pushAvailable() ? <ActivePush /> : null;
}

function ActivePush() {
    const pcId = useConnectionStore((s) => s.connection?.pcId ?? null);
    const locale = useLocaleStore((s) => s.locale);
    const open = usePushStore((s) => s.explainerOpen);
    const answer = useAnswerFromNotification();
    const appLocale = useLocaleCode();

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
    useTapRouting(answer);
    useAndroidApprovalActions(answer);
    useApprovalActionTitles(appLocale);
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
