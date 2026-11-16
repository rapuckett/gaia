// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { AndroidUnsupportedScreen } from '@/features/pairing/AndroidUnsupportedScreen';
import { PairingFlow } from '@/features/pairing';
import { UIProvider } from '@/ui';

/** The pairing screens on a fake PC; `?state=android` forces the Android "not supported yet" screen. */
export default function PairingGalleryRoute() {
    const { state = 'default' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    return <UIProvider>{state === 'android' ? <AndroidUnsupportedScreen /> : <PairingFlow />}</UIProvider>;
}
