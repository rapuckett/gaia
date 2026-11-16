// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { PAIRING_SCENES, PairingSceneView } from '@/features/pairing/devScenes';
import { Screen, Stack, Text, UIProvider } from '@/ui';

/** Your PCs and the connection banner on a fake paired PC; `?state=route-home|route-tailnet|route-tailnet-long-name|unreachable-away`. */
export default function PairingGalleryRoute() {
    const { state = 'route-home' } = useLocalSearchParams<{ state?: string }>();
    const scene = PAIRING_SCENES[state];
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    if (!scene) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No pairing scene "${state}"`}</Text>
                        {Object.keys(PAIRING_SCENES).map((key) => <Text key={key}>{key}</Text>)}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return <PairingSceneView scene={scene} />;
}
