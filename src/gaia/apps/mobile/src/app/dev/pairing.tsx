// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { PAIRING_SCENES, PairingSceneView } from '@/features/pairing/devScenes';
import { PairingFlow } from '@/features/pairing';
import { UIProvider } from '@/ui';

/** The pairing screens on a fake PC; `route-home|route-tailnet|route-tailnet-long-name|two-pcs-same-host|unreachable-away` show Your PCs and the connection banner, `local-network-explainer|local-network-denied` the local network screens, `pair-again-checking|pair-again-unreachable|pair-again-other-device|pair-again-forgotten` the pair-again states (tap `pair-again-forget` on other-device for its confirm sheet). */
export default function PairingGalleryRoute() {
    const { state = 'default' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const scene = PAIRING_SCENES[state];
    if (scene) return <PairingSceneView key={state} scene={scene} />;
    return (
        <UIProvider>
            <PairingFlow />
        </UIProvider>
    );
}
