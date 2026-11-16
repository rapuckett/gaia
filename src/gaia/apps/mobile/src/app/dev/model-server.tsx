// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { GaiaClientProvider } from '@/data';
import { FlagshipAgentBanner } from '@/features/banners/FlagshipAgentBanner';
import { ResourceStrip } from '@/features/chat/header/ResourceStrip';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { useT } from '@/i18n/useT';
import { AppErrorBoundary } from '@/features/errors/AppErrorBoundary';
import { NeedPrompt } from '@/features/model/ModelNeededHost';
import { ModelRestoreNotice } from '@/features/model/ModelRestoreNotice';
import { ModelServerDownNotice } from '@/features/model/ModelServerDownNotice';
import { ModelStatusSheet } from '@/features/model/ModelStatusSheet';
import { MODEL_SCENES, modelSceneClient, type ModelScene } from '@/features/model/devScenes';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider } from '@/ui';

const noop = () => undefined;

function Boom(): never {
    throw new Error('Dev gallery: a render error.');
}

function Body({ scene }: { scene: ModelScene }) {
    const t = useT();
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
            // The app shows the strip under the chat header; the stub header gives it the same offset.
            return (
                <>
                    <Stack paddingX="lg" paddingY="sm">
                        <Text role="title" weight="semibold" numberOfLines={1}>
                            {t('chat.label')}
                        </Text>
                    </Stack>
                    <ResourceStrip onClose={noop} />
                </>
            );
        case 'agent':
            return (
                <Stack padding="lg">
                    <FlagshipAgentBanner initialState={scene.agentState} />
                </Stack>
            );
        case 'restore':
            return (
                <Stack padding="lg">
                    <ModelRestoreNotice onPick={noop} />
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

function ModelServerView({ found }: { found: ModelScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => modelSceneClient(found));
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

/** Model status, server-down, resource, agent and error states on a fake PC; `?state=<name>` (see MODEL_SCENES). */
export default function ModelServerGalleryRoute() {
    const { state = 'sheet-loaded' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const found = MODEL_SCENES[state];
    if (!found) {
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
    return <KeyedScene sceneKey={state} scene={ModelServerView} props={{ found }} />;
}
