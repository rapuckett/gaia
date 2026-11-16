// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { GaiaClientProvider } from '@/data';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { SchedulesScreen } from '@/features/schedules';
import { SCHEDULE_SCENES, schedulesSceneClient, type ScheduleSceneName } from '@/features/schedules/devScenes';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider } from '@/ui';

const noop = () => undefined;

function SchedulesView({ state }: { state: string }) {
    const found = (SCHEDULE_SCENES as Record<string, (typeof SCHEDULE_SCENES)[ScheduleSceneName]>)[state];
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => (found ? schedulesSceneClient(found) : null));
    if (!found || !client) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No schedules scene "${state}"`}</Text>
                        {Object.keys(SCHEDULE_SCENES).map((key) => <Text key={key}>{key}</Text>)}
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
                        <SchedulesScreen onOpenChat={noop} onOpenAutomations={noop} dev={found.dev} />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The Schedules screen on a fake PC; `?state=<name>` (see SCHEDULE_SCENES), `list` when no state is given. */
export default function SchedulesGalleryRoute() {
    const { state = 'list' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    return <KeyedScene sceneKey={state} scene={SchedulesView} props={{ state }} />;
}
