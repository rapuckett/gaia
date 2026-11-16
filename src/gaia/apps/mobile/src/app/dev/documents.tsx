// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { GaiaClientProvider } from '@/data';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { DOCUMENTS_SCENES, DOCUMENTS_SCENE_CHAT_ID, documentsSceneClient } from '@/features/documents/devScenes';
import { DocumentsScreen } from '@/features/documents';
import { Screen, ScreenBannerProvider, Stack, Text, UIProvider } from '@/ui';

type Found = (typeof DOCUMENTS_SCENES)[string];

function DocumentsView({ found }: { found: Found }) {
    const router = useRouter();
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => documentsSceneClient(found));
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <DocumentsScreen
                            chatId={found.chat ? DOCUMENTS_SCENE_CHAT_ID : undefined}
                            initial={found.start}
                            onBrowseFiles={() => router.push('/dev/files')}
                            onPreview={() => router.push('/dev/file-preview?scene=binary')}
                        />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}

/** The document library on a fake PC; `?state=<name>` (see DOCUMENTS_SCENES), `library` when no state is given. */
export default function DocumentsGalleryRoute() {
    const { state = 'library' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const found = DOCUMENTS_SCENES[state];
    if (!found) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No documents scene "${state}"`}</Text>
                        {Object.keys(DOCUMENTS_SCENES).map((key) => <Text key={key}>{key}</Text>)}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return <KeyedScene sceneKey={state} scene={DocumentsView} props={{ found }} />;
}
