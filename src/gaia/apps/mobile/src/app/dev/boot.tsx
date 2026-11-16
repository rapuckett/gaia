// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { StartupScreen } from '@/features/setup/StartupScreen';
import { BOOT_STATES } from '@/features/setup/devScenes';
import { Screen, Stack, Text, UIProvider } from '@/ui';

/** The "Starting GAIA…" wait shown until the setup check answers; `?state=starting|upgrading` (see BOOT_STATES). */
export default function BootGalleryRoute() {
    const { state = 'starting' } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    if (!(BOOT_STATES as readonly string[]).includes(state)) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No boot scene "${state}"`}</Text>
                        {BOOT_STATES.map((key) => <Text key={key}>{key}</Text>)}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return (
        <UIProvider>
            <StartupScreen upgrading={state === 'upgrading'} />
        </UIProvider>
    );
}
