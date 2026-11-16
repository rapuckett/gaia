// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { GaiaClientProvider } from '@/data';
import { FlagshipAgentBanner } from '@/features/banners/FlagshipAgentBanner';
import { ResourceStrip } from '@/features/chat/header/ResourceStrip';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { AppErrorBoundary } from '@/features/errors/AppErrorBoundary';
import { NeedPrompt } from '@/features/model/ModelNeededHost';
import { ModelServerDownNotice } from '@/features/model/ModelServerDownNotice';
import { ModelStatusSheet } from '@/features/model/ModelStatusSheet';
import { MODEL_SCENES, modelSceneClient, type ModelScene } from '@/features/model/devScenes';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider } from '@/ui';

const noop = () => undefined;

function Boom(): never {
    throw new Error('Dev gallery: a render error.');
}

function Body({ scene }: { scene: ModelScene }) {
    switch (scene.view) {
        case 'sheet':
            return <ModelStatusSheet open onClose={noop} onOpenSettings={noop} initial={scene.sheet} />;
        case 'need':
            return scene.need ? <NeedPrompt need={scene.need} initial={scene.needInitial} /> : null;
        case 'down':
            return (
                <Stack padding="lg">
                    <ModelServerDownNotice initialAsked={scene.downAsked} />
                </Stack>
            );
        case 'resources':
            return <ResourceStrip onClose={noop} />;
        case 'agent':
            return (
                <Stack padding="lg">
                    <FlagshipAgentBanner initialState={scene.agentState} />
                </Stack>
            );
        case 'error':
            return (
                <AppErrorBoundary variant={scene.errorVariant}>
                    <Boom />
                </AppErrorBoundary>
            );
    }
}

/** Model status, server-down, resource, agent and error states on a fake PC; `?state=<name>` (see MODEL_SCENES). */
export default function ModelServerGalleryRoute() {
    const { state = 'sheet-loaded' } = useLocalSearchParams<{ state?: string }>();
    const found = MODEL_SCENES[state];
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        if (!found) return null;
        return modelSceneClient(found);
    });
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    if (!found || !client) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No model-server scene "${state}"`}</Text>
                        {Object.keys(MODEL_SCENES).map((key) => <Text key={key}>{key}</Text>)}
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
                        <Screen scroll>
                            <Body scene={found} />
                        </Screen>
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
