// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { AndroidUnsupportedScreen } from '@/features/pairing/AndroidUnsupportedScreen';
import { PAIRING_SCENES, PairingSceneView } from '@/features/pairing/devScenes';
import { PairingFlow } from '@/features/pairing';
import { UIProvider } from '@/ui';

/** The pairing screens on a fake PC; `?state=android` forces the Android "not supported yet" screen, and `route-home|route-tailnet|route-tailnet-long-name|unreachable-away` show Your PCs and the connection banner. */
export default function PairingGalleryRoute() {
    const { state = 'default' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const scene = PAIRING_SCENES[state];
    if (scene) return <PairingSceneView scene={scene} />;
    return <UIProvider>{state === 'android' ? <AndroidUnsupportedScreen /> : <PairingFlow />}</UIProvider>;
}
