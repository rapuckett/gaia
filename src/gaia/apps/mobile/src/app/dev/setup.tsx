// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { SETUP_SCENES } from '@/features/setup/devScenes';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { SetupSceneView } from '@/features/setup/SetupSceneView';
import { Screen, Stack, Text, UIProvider } from '@/ui';

/** One setup scene on a fake PC; `?step=<step>&state=<name>` (see SETUP_SCENES), `default` when no state is given. */
export default function SetupGalleryRoute() {
    const { step = 'check', state = 'default' } = useLocalSearchParams<{ step?: string; state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const found = SETUP_SCENES[`${step}/${state}`];
    if (!found) {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="sm" padding="lg">
                        <Text role="title">{`No setup scene "${step}/${state}"`}</Text>
                        {Object.keys(SETUP_SCENES).map((key) => <Text key={key}>{key}</Text>)}
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return <KeyedScene sceneKey={`${step}/${state}`} scene={SetupSceneView} props={{ found }} />;
}
