// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { GaiaClientProvider } from '@/data';
import { ChatDrawerContent } from '@/features/chats/ChatDrawerContent';
import { DRAWER_SCENES, drawerSceneClient, sceneNotifications, type DrawerSceneName } from '@/features/chats/devScenes';
import { NAV_ENTRIES } from '@/features/chats/navEntries';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { addNotification, clearNotifications } from '@/state/notifications';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider } from '@/ui';

const noop = () => undefined;
const ROUTE_NAMES = NAV_ENTRIES.map((e) => e.route);

function DrawerView({ state }: { state: string }) {
    const found = (DRAWER_SCENES as Record<string, (typeof DRAWER_SCENES)[DrawerSceneName]>)[state];
    // The drawer fills the window, as it does in the navigator; without a height its list collapses.
    const { height } = useWindowDimensions();
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        if (!found) return null;
        clearNotifications();
        sceneNotifications(found.unreadNotifications ?? 0).forEach(addNotification);
        return drawerSceneClient(found);
    });
    if (!found || !client) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No drawer scene "${state}"`}</Text>
                        {Object.keys(DRAWER_SCENES).map((key) => (
                            <Text key={key}>{key}</Text>
                        ))}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <View style={{ height }}>
                            <ChatDrawerContent
                                activeId={found.activeId}
                                onSelect={noop}
                                onClose={noop}
                                onNewChat={noop}
                                onPcs={noop}
                                routeNames={ROUTE_NAMES}
                                live={found.live}
                                queues={found.queues}
                                error={found.error}
                                dev={found.dev}
                            />
                        </View>
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The chat list on a fake PC; `?state=<name>` (see DRAWER_SCENES), `groups` when no state is given. */
export default function DrawerGalleryRoute() {
    const { state = 'groups' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    return <KeyedScene sceneKey={state} scene={DrawerView} props={{ state }} />;
}
