// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { GaiaClientProvider } from '@/data';
import { ChatAlertNotice, ConnectionBanner } from '@/features/banners/ConnectionBanner';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { NotificationCenterScreen } from '@/features/notifications';
import { chatAlertBanner, NOTIFICATION_SCENES, notificationSceneClient, type NotificationScene } from '@/features/notifications/devScenes';
import NotificationsPane from '@/features/settings/panes/Notifications';
import { useT } from '@/i18n/useT';
import { SetupGate } from '@/features/setup/SetupGate';
import { IDLE_TURN, useChatStreamStore } from '@/state/chatStreams';
import { useChatAlertBannerStore } from '@/state/chatAlertBanner';
import { setNotificationFilter, useNotificationStore } from '@/state/notifications';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider } from '@/ui';

const noop = () => undefined;

/** The app's notification stores hold the scene: a pending approval is a chat turn blocked on it. */
function seed(scene: NotificationScene) {
    useNotificationStore.setState({ items: scene.items ?? [], filter: scene.filter ?? null });
    setNotificationFilter(scene.filter ?? null);
    useChatAlertBannerStore.setState({ alert: null });
    const turns = Object.fromEntries(
        (scene.waiting ?? []).map((confirmId, i) => [
            `dev-chat-${i}`,
            { ...IDLE_TURN, status: 'streaming' as const, pendingPermission: { type: 'permission_request', confirm_id: confirmId, tool: 'run_shell_command', tool_label: 'run a command', args: { command: 'git status' } } as never },
        ]),
    );
    useChatStreamStore.setState({ turns });
}

function Body({ scene }: { scene: NotificationScene }) {
    const t = useT();
    if (scene.view === 'center') {
        return (
            <ScreenBannerProvider banner={null}>
                <NotificationCenterScreen onBack={noop} onOpenChat={noop} />
            </ScreenBannerProvider>
        );
    }
    if (scene.view === 'alerts') {
        return (
            <ScreenBannerProvider banner={null}>
                <Screen scroll>
                    <NotificationsPane />
                </Screen>
            </ScreenBannerProvider>
        );
    }
    const placeholder = (
        <Stack padding="lg">
            <Text tone="muted">Chats</Text>
        </Stack>
    );
    if (scene.view === 'gate') {
        return (
            <ScreenBannerProvider banner={null}>
                <SetupGate>{placeholder}</SetupGate>
            </ScreenBannerProvider>
        );
    }
    return (
        <ScreenBannerProvider
            banner={
                // The root ChatAlertFeed clears the store's alert (turn seeding, 8 s timer), so the scene hosts its own.
                <Stack gap="sm">
                    {scene.chatAlert ? <ChatAlertNotice alert={chatAlertBanner(scene.chatAlert, t)} /> : null}
                    <ConnectionBanner />
                </Stack>
            }
        >
            <Screen scroll>{placeholder}</Screen>
        </ScreenBannerProvider>
    );
}

function NotificationsView({ found }: { found: NotificationScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        seed(found);
        return notificationSceneClient(found);
    });
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <Body scene={found} />
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The notification center, connection banners, setup-gate notice and alert settings on a fake PC; `?state=<name>` (see NOTIFICATION_SCENES). */
export default function NotificationsGalleryRoute() {
    const { state = 'mixed' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const found = NOTIFICATION_SCENES[state];
    if (!found) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No notifications scene "${state}"`}</Text>
                        {Object.keys(NOTIFICATION_SCENES).map((key) => <Text key={key}>{key}</Text>)}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return <KeyedScene sceneKey={state} scene={NotificationsView} props={{ found }} />;
}
