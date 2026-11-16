// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import type { ScrollView } from 'react-native';

import { GaiaClientProvider } from '@/data';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { SETTINGS_SECTIONS } from '@/features/settings/sections';
import { SETTINGS_SCENES, settingsSceneClient, type SettingsScene } from '@/features/settings/devScenes';
import { SettingsTargets } from '@/features/settings/targets';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider } from '@/ui';

function SettingsView({ found }: { found: SettingsScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => settingsSceneClient(found));
    const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
    const Pane = SETTINGS_SECTIONS[found.section].pane;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <Screen scroll scrollRef={scrollRef}>
                            <SettingsTargets section={found.section} target={found.target} scrollRef={scrollRef}>
                                <Pane provider={found.provider ?? 'local'} />
                            </SettingsTargets>
                        </Screen>
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The real Setup and Model settings panes on a fake PC; `?state=<name>` (see SETTINGS_SCENES). */
export default function SettingsGalleryRoute() {
    const { state = 'gpu-adjustable' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const found = SETTINGS_SCENES[state];
    if (!found) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No settings scene "${state}"`}</Text>
                        {Object.keys(SETTINGS_SCENES).map((key) => <Text key={key}>{key}</Text>)}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return <KeyedScene sceneKey={state} scene={SettingsView} props={{ found }} />;
}
