// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { GaiaClientProvider } from '@/data';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { LogsScreen } from '@/features/logs';
import { LOG_SCENES, logSceneClient, type LogScene } from '@/features/logs/devScenes';
import { ScreenBannerProvider, UIProvider } from '@/ui';

function LogsView({ scene }: { scene: LogScene }) {
    const router = useRouter();
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => logSceneClient(scene));
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <LogsScreen
                            onBack={() => router.replace('/')}
                            initialSource={scene.source}
                            initialFollow={scene.follow}
                            initialProblemsOnly={scene.problemsOnly}
                        />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The log viewer on a fake PC; `?scene=errors|follow|filtered|empty|unavailable|failed`. */
export default function LogsGalleryRoute() {
    const { scene = 'errors' } = useLocalSearchParams<{ scene?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const found = LOG_SCENES[scene] ?? LOG_SCENES.errors!;
    return <KeyedScene sceneKey={scene} scene={LogsView} props={{ scene: found }} />;
}
