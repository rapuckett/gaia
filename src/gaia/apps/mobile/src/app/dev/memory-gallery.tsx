// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { useEffect, useState } from 'react';

import { useConnectionStore } from '@/state/connection';

import { GaiaClientProvider } from '@/data';
import { MemoryScreen } from '@/features/memory';
import { MEMORY_TABS } from '@/features/memory/tabs';
import { ProfileDevContext } from '@/features/memory/profile/ProfileCard';
import { memoryScene, profileSceneStart, sceneDefaultTab, sceneIsPaired, type MemoryScene } from '@/features/memory/devScenes';
import { ScreenBannerProvider, UIProvider } from '@/ui';

const SCENES: readonly MemoryScene[] = ['on', 'off', 'loading', 'failed', 'actionFails', 'statsEmpty', 'statsManyTools', 'aboutEmpty', 'aboutFailed', 'aboutMany', 'aboutShowMore', 'goalsEmpty', 'goalsFailed', 'goalsStoreError', 'goalsStoreDamaged', 'knowledgeRich', 'knowledgeEmpty', 'knowledgeFailed', 'knowledgeMany', 'profileIdle', 'profileScanning', 'profileReview', 'profileScanningFull', 'profileReviewFull', 'profileFailedFull', 'profileSaved', 'profileInferring', 'profileInferenceReview', 'profileFailed', 'profileOff', 'discoveryOff', 'profilePaired', 'profileConsentRest', 'profileConsentConfirm', 'profileConsentRace'];

function MemoryView({ picked, tab }: { picked: MemoryScene; tab?: string }) {
    const router = useRouter();
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => memoryScene(picked));
    useEffect(() => {
        if (!sceneIsPaired(picked)) return;
        useConnectionStore.setState({ connection: { baseUrl: 'https://pc.local:4443', pcId: 'pc-1', pinned: true } });
        return () => useConnectionStore.setState({ connection: null });
    }, [picked]);
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <ProfileDevContext.Provider value={profileSceneStart(picked)}>
                            <MemoryScreen onBack={() => router.replace('/')} initialTab={MEMORY_TABS.find((entry) => entry.key === (tab ?? sceneDefaultTab(picked)))?.key} />
                        </ProfileDevContext.Provider>
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The Memory screen on a fake PC; `?scene=on|off|loading|failed|actionFails|statsEmpty|statsManyTools|aboutEmpty|aboutFailed|aboutMany|aboutShowMore|goalsEmpty|goalsFailed|goalsStoreError|goalsStoreDamaged|knowledgeRich|knowledgeEmpty|knowledgeFailed|knowledgeMany|profileIdle|profileScanning|profileReview|profileScanningFull|profileReviewFull|profileFailedFull|profileSaved|profileInferring|profileInferenceReview|profileFailed|profileOff|discoveryOff|profilePaired|profileConsentRest|profileConsentConfirm|profileConsentRace`, and `&tab=about|goals|profile|advanced`. */
export default function MemoryGalleryRoute() {
    const { scene, tab } = useLocalSearchParams<{ scene?: string; tab?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const picked = SCENES.find((s) => s === scene) ?? 'on';
    return <KeyedScene sceneKey={`${picked}/${tab ?? ''}`} scene={MemoryView} props={{ picked, tab }} />;
}
