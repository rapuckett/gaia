// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { GaiaClientProvider } from '@/data';
import { MemoryScreen } from '@/features/memory';
import { memoryScene, type MemoryScene } from '@/features/memory/devScenes';
import { UIProvider } from '@/ui';

const SCENES: readonly MemoryScene[] = ['on', 'off', 'loading', 'failed', 'actionFails'];

/** The Memory screen on a fake PC; `?scene=on|off|loading|failed|actionFails`. */
export default function MemoryGalleryRoute() {
    const { scene } = useLocalSearchParams<{ scene?: string }>();
    const router = useRouter();
    const picked = SCENES.find((s) => s === scene) ?? 'on';
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => memoryScene(picked));
    if (!__DEV__) return <Redirect href="/" />;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <MemoryScreen onBack={() => router.replace('/')} />
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
